import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from 'react-query';
import { isExpired } from 'react-jwt';
import { PaymasterRpc, RpcProvider, WalletAccount } from 'starknet';
import { connect as starknetConnect, disconnect as starknetDisconnect } from 'starknetkit';
import { ArgentMobileConnector, isInArgentMobileAppBrowser } from 'starknetkit/argentMobile';
import { InjectedConnector } from 'starknetkit/injected';
import { WebWalletConnector } from 'starknetkit/webwallet';
import { Address } from '@influenceth/sdk';
import { appConfig } from '~/appConfig';
import LoginPrompt from '~/components/LoginPrompt';
import Reconnecting from '~/components/Reconnecting';
import api from '~/lib/api';
import { areChainsEqual, fireTrackingEvent, resolveChainId } from '~/lib/utils';
import useStore from '~/hooks/useStore';

// TODO:
// - restore sessions
// - LoginPrompt was broken by upgrade; restore (see todo)
//   (clicking to login with last wallet was throwing an error)

const getErrorMessage = (error) => {
  console.error(error);
  if (typeof error === 'string') return error;
  else if (typeof error === 'object' && error?.message) return error.message;
  return 'An unknown error occurred, please check the console for details.';
};

const isAllowedChain = (chain) => {
  return areChainsEqual(chain, appConfig.get('Starknet.chainId'));
}

const STATUSES = {
  DISCONNECTED: 0,
  CONNECTING: 1,
  CONNECTED: 2,
  AUTHENTICATING: 3,
  AUTHENTICATED: 4
};

// Methods allowed for Starknet sessions
const allowedMethods = [
  { 'Contract Address': appConfig.get('Starknet.Address.dispatcher'), selector: 'run_system' },
  { 'Contract Address': appConfig.get('Starknet.Address.swayToken'), selector: 'transfer_with_confirmation' },
  { 'Contract Address': appConfig.get('Starknet.Address.swayToken'), selector: 'transfer' },
  { 'Contract Address': appConfig.get('Starknet.Address.escrow'), selector: 'withdraw' },
  { 'Contract Address': appConfig.get('Starknet.Address.escrow'), selector: 'deposit' }
];

const SessionContext = createContext();

export function SessionProvider({ children }) {
  const queryClient = useQueryClient();
  const createAlert = useStore(s => s.dispatchAlertLogged);

  const currentSession = useStore(s => s.currentSession);
  const gameplay = useStore(s => s.gameplay);
  const referredBy = useStore(s => s.referrer);
  const sessions = useStore(s => s.sessions);
  const dispatchSessionStarted = useStore(s => s.dispatchSessionStarted);
  const dispatchSessionSuspended = useStore(s => s.dispatchSessionSuspended);
  const dispatchSessionResumed = useStore(s => s.dispatchSessionResumed);
  const dispatchSessionEnded = useStore(s => s.dispatchSessionEnded);

  const [readyForChildren, setReadyForChildren] = useState(false);

  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState(STATUSES.DISCONNECTED);
  const [starknetSession, setStarknetSession] = useState();

  const [connectedAccount, setConnectedAccount] = useState();
  const [connectedChainId, setConnectedChainId] = useState();
  const [connectedWalletId, setConnectedWalletId] = useState();
  const [walletAccount, setWalletAccount] = useState();

  const [paymasterTokens, setPaymasterTokens] = useState([]);

  const [blockNumber, setBlockNumber] = useState(0);
  const [blockTime, setBlockTime] = useState(0);
  const [isBlockMissing, setIsBlockMissing] = useState(false);
  const [error, setError] = useState();

  const authenticated = useMemo(() => status === STATUSES.AUTHENTICATED, [status]);
  const provider = useMemo(() => {
    let nodeUrl = appConfig.get('Starknet.provider');

    if (appConfig.get('Starknet.providerBackup') && Math.random() > 0.5) {
      nodeUrl = appConfig.get('Starknet.providerBackup');
    }

    return new RpcProvider({ nodeUrl });
  }, []);

  // Login entry point, starts by connecting to wallet provider
  const connect = useCallback(async (auto = false, enabledConnectors = { webWallet: true, argentX: true, braavos: true, argentMobile: true }) => {
    if (currentSession?.walletId) {
      localStorage.setItem('starknetLastConnectedWallet', currentSession.walletId);
      auto = true;
    }

    try {
      // init argentMobileConnector since a little different
      const argentMobileConnector = ArgentMobileConnector.init({
        options: {
          url: typeof window !== 'undefined' ? window.location.href : '',
          dappName: 'Influence',
          chainId: resolveChainId(appConfig.get('Starknet.chainId')),
          provider
        }
      });

      // pick which and config connectors to include
      const connectors = [];
      if (isInArgentMobileAppBrowser()) {
        connectors.push(argentMobileConnector);
      } else {
        if (enabledConnectors.webWallet && !!appConfig.get('Api.argentWebWallet')) {
          connectors.push(new WebWalletConnector({ url: appConfig.get('Api.argentWebWallet'), provider }));
        }

        if (enabledConnectors.argentX) connectors.push(new InjectedConnector({ options: { id: 'argentX', provider }}));
        if (enabledConnectors.braavos) connectors.push(new InjectedConnector({ options: { id: 'braavos', provider }}));
        if (enabledConnectors.argentMobile) connectors.push(argentMobileConnector);
      }

      const connectionOptions = {
        dappName: 'Influence',
        modalMode: auto ? 'neverAsk' : 'alwaysAsk',
        modalTheme: 'dark',
        projectId: 'influence',
        connectors,
        provider
      };

      setError();
      setConnecting(true);
      const { connectorData, wallet } = await starknetConnect(connectionOptions);
      console.log('waiting 200ms...');
      await new Promise(resolve => setTimeout(resolve, 200)); // deal with timeout delay from Argent

      if (wallet && connectorData?.account) {
        const chainId = resolveChainId(connectorData.chainId);
        setConnectedAccount(Address.toStandard(connectorData.account));
        setConnectedChainId(chainId);
        setConnectedWalletId(wallet.id);

        let paymaster;
        if (appConfig.get('Starknet.paymaster')) {
          paymaster = new PaymasterRpc({
            nodeUrl: appConfig.get('Starknet.paymaster'),
            // TODO: add x-paymaster-api-key if we are going to sponsor gas
            // headers: { 'api-key': process.env.PAYMASTER_API_KEY },
          });
        }

        const newAccount = await WalletAccount.connect(
          provider,
          wallet,
          undefined,
          paymaster
        );
        setPaymasterTokens(await newAccount.paymaster.getSupportedTokens() || []);
        setWalletAccount(newAccount);

        // Default to provider chainId if not set (starknetkit doesn't set for braavos)
        if (!isAllowedChain(chainId)) {
          try {
            await wallet.request({
              type: 'wallet_switchStarknetChain',
              params: { chainId: appConfig.get('Starknet.chainId') }
            });
          } catch (e) { // (standardize error message here since different between wallets)
            throw new Error('Incorrect chain');
          }

          localStorage.setItem('starknetLastConnectedWallet', wallet.id);
          await connect(true);
          setConnecting(false);
          return;
        }

        localStorage.setItem('starknetLastConnectedWallet', wallet.id);
        setStatus(STATUSES.CONNECTED);
      } else {
        console.error('No connected wallet or missing address');
      }
    } catch(e) {
      if (e.message === 'Incorrect chain') {
        console.log('');
        setError(`Incorrect chain, please switch to ${resolveChainId(appConfig.get('Starknet.chainId'))}`);
      }

      else if (e.message !== 'User rejected request') {
        setError(e);
      }
    }

    setConnecting(false);
  }, [currentSession, sessions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Disconnect from the wallet provider and suspend session (don't fully logout)
  const disconnect = useCallback(() => {
    dispatchSessionSuspended();
    setStatus(STATUSES.DISCONNECTED);
  }, [dispatchSessionSuspended]);

  // End / delete session, disconnect wallet and forget last wallet provider (full reset)
  const logout = useCallback(() => {
    dispatchSessionEnded();
    setStatus(STATUSES.DISCONNECTED);
    if (window.starknet) starknetDisconnect({ clearLastWallet: true });
  }, [ dispatchSessionEnded ]);

  // While connecting or connected, listen for network changes from extension
  useEffect(() => {
    const onAccountsChanged = (e) => {
      const eventAccount = Address.toStandard(Array.isArray(e) ? e[0] : e);

      if (currentSession?.accountAddress === eventAccount && status === STATUSES.AUTHENTICATED) {
        // Handle extra events that can occasionally be fired (i.e. we're already authed)
        return;
      } else if (sessions[eventAccount]) {
        // If the account we just switched to has a suspended session, use it
        dispatchSessionResumed(sessions[eventAccount]); // flow manager should fire connect()
      } else {
        // Otherwise we disconnect and wait for the user to explicitly login / reconnect
        disconnect();
      }
    };

    const onNetworkChanged = (e) => {
      const eventNetwork = Array.isArray(e) ? e[0] : e;
      const correctChain = isAllowedChain(eventNetwork);
      if (!correctChain) disconnect();
    };

    const startListening = () => {
      if (walletAccount.on) {
        walletAccount.on('accountsChanged', onAccountsChanged);
        walletAccount.on('networkChanged', onNetworkChanged);
      }
    }

    const stopListening = () => {
      if (!walletAccount) return;

      if (walletAccount.off) {
        walletAccount.off('accountsChanged', onAccountsChanged);
        walletAccount.off('networkChanged', onNetworkChanged);
      }
    };

    if (walletAccount) startListening();
    return stopListening;
  }, [ currentSession, sessions, status, walletAccount ]); // eslint-disable-line react-hooks/exhaustive-deps

  // Checks the account contract do determine if it's deployed on-chain yet
  const checkDeployed = useCallback(async () => {
    try {
      await provider.getClassAt(connectedAccount); // if this throws, the contract is not deployed
      return true;
    } catch (e) {
      if (!e.message.includes('Contract not found')) console.error(e);
      return false;
    }
  }, [connectedAccount, provider]);

  // Authenticate with a signed message against the API and create a new session
  const authenticate = useCallback(async ({ isUpgradeInsecure = false, isUpgradeSessionKey = false } = {}) => {
    const newSession = {};

    // Check if the account contract has been deployed yet
    newSession.isDeployed = await checkDeployed();

    // Start authenticating by requesting a login message from API
    if (!isUpgradeInsecure) setStatus(STATUSES.AUTHENTICATING);
    const loginMessage = await api.requestLogin(connectedAccount);

    try {
      if (newSession.isDeployed) {
        let signature;

        try {
          signature = await walletAccount.signMessage(loginMessage);
        } catch (e) {
          signature = await walletAccount.walletProvider?.account.signMessage(loginMessage);
        }

        if (signature?.code === 'CANCELED') throw new Error('User abort');
        const newToken = await api.verifyLogin(connectedAccount, { signature: signature.join(','), referredBy });
        const walletId = walletAccount?.walletProvider?.id;
        Object.assign(newSession, { walletId, accountAddress: connectedAccount, token: newToken });
      } else {
        // If the wallet is not yet deployed, create an insecure session
        const newToken = await api.verifyLogin(connectedAccount, { signature: 'insecure', referredBy });
        Object.assign(newSession, { walletId: connectedWalletId, accountAddress: connectedAccount, token: newToken });
      }

      dispatchSessionStarted(newSession);
      setStatus(STATUSES.AUTHENTICATED);
      return true;
    } catch (e) {
      if (!isUpgradeInsecure) {
        logout();
        if (['User abort', 'User rejected'].includes(e.message)) return;
        console.error(e);
        createAlert({
          type: 'GenericAlert',
          level: 'warning',
          data: { content: 'Signature verification failed.' },
          duration: 10000
        });
      }
    }

    if (!isUpgradeInsecure) disconnect();
    return false;
  }, [
    checkDeployed,
    connectedAccount,
    connectedWalletId,
    createAlert,
    dispatchSessionStarted,
    referredBy,
    walletAccount,
    disconnect,
    logout
  ]);

  const upgradeInsecureSession = useCallback(() => {
    if (currentSession && !currentSession.isDeployed) return authenticate({ isUpgradeInsecure: true });
  }, [authenticate, currentSession]);

  // Resumes a current session or starts a new one
  const resumeOrAuthenticate = useCallback(async () => {
    // If somehow we've lost wallet connection, disconnect
    if (!connectedAccount || !walletAccount) {
      disconnect();
      return false;
    }

    // Check for pre-existing session and use it if it's still valid
    const existingSession = Object.assign({}, sessions[connectedAccount]);

    if (existingSession && !isExpired(existingSession.token) && existingSession.isDeployed) {
      existingSession.startTime = Date.now();
      dispatchSessionStarted(existingSession);
      setStatus(STATUSES.AUTHENTICATED);
      return true;
    }

    await authenticate();
  }, [authenticate, connectedAccount, walletAccount, sessions, disconnect, dispatchSessionStarted]);

  // End session and disconnect wallet if session expires
  useEffect(() => {
    if (currentSession.token && isExpired(currentSession.token)) logout();
  }, [currentSession, logout]);

  // Connect / auth flow manager
  useEffect(() => {
    // console.log(Object.keys(STATUSES).find(key => STATUSES[key] === status));
    if (status === STATUSES.DISCONNECTED) {
      if (currentSession?.walletId) {
        connect(true).finally(() => setReadyForChildren(true));
      } else {
        setReadyForChildren(true);
      }
    } else if (status === STATUSES.CONNECTED) {
      resumeOrAuthenticate().finally(() => {
        setReadyForChildren(true);
      });
    } else if (status === STATUSES.AUTHENTICATED) {
      fireTrackingEvent('login', { externalId: currentSession?.accountAddress });
    }
  }, [currentSession, status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Catch errors and display in an alert
  useEffect(() => {
    if (error) {
      createAlert({
        type: 'GenericAlert',
        level: 'warning',
        data: { content: getErrorMessage(error) || 'Please try again.' },
        duration: 10000
      });

      setError(null);
      logout(); // Disconnect and reset to prevent further issues
    }
  }, [error, createAlert, logout]);

  const gasTokens = useMemo(() => {
    if (gameplay.feeTokens?.length > 0 && paymasterTokens?.length > 0) {
      return gameplay.feeTokens.filter((t) => {
        return !!paymasterTokens.find((pt) => Address.areEqual(pt.token_address, t));
      });
    }
    return [];
  }, [gameplay.feeTokens, paymasterTokens]);

  // Block management -------------------------------------------------------------------------------------------------

  const bootstrapAuthenticatedUser = useCallback(async () => {
    if (!authenticated || !currentSession?.token) return;

    try {
      await queryClient.fetchQuery(
        [ 'user', currentSession.token ],
        async () => {
          const { user, blockNumber: nextBlockNumber, blockTimestamp } = await api.getUser({ includeBlockData: true });

          if (nextBlockNumber > 0) setBlockNumber(nextBlockNumber);
          if (blockTimestamp > 0) setBlockTime(blockTimestamp);

          return user;
        }
      );
    } catch (e) {
      console.warn('failed to bootstrap authenticated user state', e);
    }
  }, [authenticated, currentSession?.token, queryClient]);
  useEffect(() => { bootstrapAuthenticatedUser(); }, [bootstrapAuthenticatedUser]);

  // reset any cached, but time-dependent queries
  useEffect(() => {
    [
      [ 'orderList' ],
      [ 'inventoryOrders' ],
      [ 'exchangeOrderSummary' ],
      [ 'productOrderSummary' ],
    ].forEach((queryKey) => {
      queryClient.invalidateQueries({ queryKey, refetchType: 'active' });
    });
  }, [blockTime]);

  const [promptLogin, setPromptLogin] = useState();
  const login = useCallback(async () => {
    if ([STATUSES.AUTHENTICATING, STATUSES.AUTHENTICATED].includes(status)) return;

    // TODO: uncomment below and remove connect() to restore login prompt
    // setPromptLogin(true);
    connect();
  }, [authenticated, connect]);

  const handleLoginPrompt = useCallback((choice) => {
    setPromptLogin(false);
    if (choice === false) {
      connect(); // show all wallets
    } else if (choice) {
      connect(undefined, { [choice]: true });
    }
  }, [connect]);

  // TODO: memoize value
  return (
    <SessionContext.Provider value={{
      login,
      logout,
      accountAddress: authenticated ? currentSession?.accountAddress : null,
      allowedMethods,
      authenticated,
      authenticating: [STATUSES.AUTHENTICATING, STATUSES.CONNECTING].includes(status),
      chainId: authenticated ? connectedChainId : null,
      connecting: connecting || !!promptLogin,
      isDeployed: authenticated ? currentSession?.isDeployed : null,
      gasTokens: authenticated ? gasTokens : null,
      provider,
      starknetSession,
      status,
      token: authenticated ? currentSession?.token : null,
      upgradeInsecureSession,
      walletAccount,
      walletId: authenticated ? currentSession?.walletId : null,

      // NOTE:
      // - blockNumber and blockTime are sourced from finalized block data
      //   emitted by the server via websocket / activity headers
      // - `/user` is fetched after auth to seed these values before live updates arrive
      setIsBlockMissing,
      isBlockMissing,
      setBlockNumber,
      setBlockTime,
      blockNumber,
      blockTime
    }}>
      {readyForChildren
        ? children
        : (
          connecting
            ? <Reconnecting walletName={window[`starknet_${currentSession?.walletId}`]?.name} onLogout={logout} />
            : null
        )
      }
      {promptLogin && <LoginPrompt onClick={handleLoginPrompt} />}
    </SessionContext.Provider>
  );
};

export default SessionContext;
