import { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import { PrivyProvider, useLogin, usePrivy } from '@privy-io/react-auth';
import { useCreateWallet, useSignRawHash } from '@privy-io/react-auth/extended-chains';

import { appConfig } from '~/appConfig';
import {
  createPrivyReadyAccount,
  findPrivyStarknetWallet,
  normalizePrivyStarknetWallet,
  PRIVY_STARKNET_CHAIN_TYPE
} from '~/lib/privyWallet';
import { normalizeAuthFlowError } from '~/lib/privyAuthErrors';
import { WALLET_IDS } from '~/lib/walletIds';

const PrivyWalletContext = createContext({
  configured: false,
  connector: null
});

const createConfigurationError = () => {
  const error = new Error('Privy is not configured.');
  error.userMessage = 'Influence Account login is temporarily unavailable. Please choose another login option.';
  return error;
};

const waitForPrivyReady = async (stateRef) => {
  const timeoutAt = Date.now() + 15000;

  while (!stateRef.current.ready && Date.now() < timeoutAt) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (!stateRef.current.ready) {
    const error = new Error('Privy did not finish loading.');
    error.userMessage = 'Influence Account login is taking too long. Please try again.';
    throw error;
  }

  return stateRef.current;
};

const waitForPrivyAuthenticated = async (stateRef) => {
  const timeoutAt = Date.now() + 15000;

  while ((!stateRef.current.authenticated || !stateRef.current.user) && Date.now() < timeoutAt) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (!stateRef.current.authenticated || !stateRef.current.user) {
    const error = new Error('Privy did not finish authentication.');
    error.userMessage = 'Influence Account login is taking too long. Please try again.';
    throw error;
  }

  return stateRef.current.user;
};

const PrivyWalletBridge = ({ children }) => {
  const { authenticated, logout, ready, user } = usePrivy();
  const { createWallet } = useCreateWallet();
  const { signRawHash } = useSignRawHash();
  const loginRequestRef = useRef();
  const privyStateRef = useRef({ authenticated, ready, user });
  const signRawHashRef = useRef(signRawHash);
  privyStateRef.current = { authenticated, ready, user };
  signRawHashRef.current = signRawHash;

  const { login } = useLogin({
    onComplete: ({ user: authenticatedUser }) => {
      loginRequestRef.current?.resolve(authenticatedUser);
      loginRequestRef.current = null;
    },
    onError: (error) => {
      loginRequestRef.current?.reject(normalizeAuthFlowError(error));
      loginRequestRef.current = null;
    }
  });

  const authenticate = useCallback(async () => {
    const privyState = await waitForPrivyReady(privyStateRef);
    if (privyState.authenticated && privyState.user) return privyState.user;
    if (loginRequestRef.current) {
      await loginRequestRef.current.promise;
      return waitForPrivyAuthenticated(privyStateRef);
    }

    let resolve;
    let reject;
    const promise = new Promise((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });

    loginRequestRef.current = { promise, reject, resolve };
    login({ loginMethods: ['google', 'email'] });
    await promise;
    return waitForPrivyAuthenticated(privyStateRef);
  }, [login]);

  const connect = useCallback(async ({ auto = false, paymaster, provider, resumeAuth = false } = {}) => {
    const privyState = await waitForPrivyReady(privyStateRef);
    if (auto && !privyState.authenticated) return {};

    const authenticatedUser = privyState.authenticated
      ? privyState.user
      : resumeAuth ? null : await authenticate();
    if (!authenticatedUser) return {};

    let wallet = findPrivyStarknetWallet(authenticatedUser);
    if (!wallet) {
      if (auto && !resumeAuth) return {};
      const created = await createWallet({ chainType: PRIVY_STARKNET_CHAIN_TYPE });
      wallet = normalizePrivyStarknetWallet(created.wallet);
    }

    const accountDetails = createPrivyReadyAccount({
      paymaster,
      provider,
      wallet,
      signRawHash: async (hash) => {
        await authenticate();

        return signRawHashRef.current({
          address: wallet.address,
          chainType: PRIVY_STARKNET_CHAIN_TYPE,
          hash
        });
      }
    });

    return {
      account: accountDetails.address,
      chainId: appConfig.get('Starknet.chainId'),
      deploymentData: accountDetails.deploymentData,
      walletAccount: accountDetails.account
    };
  }, [authenticate, createWallet, signRawHash]);

  const connector = useMemo(() => ({
    id: WALLET_IDS.PRIVY,
    connect,
    disconnect: logout,
    wallet: { id: WALLET_IDS.PRIVY }
  }), [connect, logout]);

  return (
    <PrivyWalletContext.Provider value={{ configured: true, connector }}>
      {children}
    </PrivyWalletContext.Provider>
  );
};

export const PrivyWalletProvider = ({ children }) => {
  const appId = appConfig.get('Privy.appId');
  const clientId = appConfig.get('Privy.clientId');

  if (!appId) {
    const connector = {
      id: WALLET_IDS.PRIVY,
      connect: async () => { throw createConfigurationError(); },
      disconnect: async () => {}
    };

    return (
      <PrivyWalletContext.Provider value={{ configured: false, connector }}>
        {children}
      </PrivyWalletContext.Provider>
    );
  }

  return (
    <PrivyProvider
      appId={appId}
      {...(clientId ? { clientId } : {})}
      config={{
        appearance: {
          showWalletLoginFirst: false,
          theme: 'dark'
        },
        embeddedWallets: {
          createOnLogin: 'off',
          showWalletUIs: false
        },
        loginMethods: ['google', 'email']
      }}>
      <PrivyWalletBridge>{children}</PrivyWalletBridge>
    </PrivyProvider>
  );
};

export const usePrivyWallet = () => useContext(PrivyWalletContext);

export default PrivyWalletContext;
