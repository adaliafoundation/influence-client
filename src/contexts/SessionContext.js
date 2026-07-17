import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isExpired } from 'react-jwt';
import { PaymasterRpc, RpcProvider, WalletAccount } from 'starknet';
import { disconnect as starknetDisconnect } from 'starknetkit';
import { ArgentMobileConnector, isInArgentMobileAppBrowser } from 'starknetkit/argentMobile';
import { ControllerConnector } from 'starknetkit/controller';
import { InjectedConnector } from 'starknetkit/injected';
import { WebWalletConnector } from 'starknetkit/webwallet';
import { Address } from '@influenceth/sdk';
import { appConfig } from '~/appConfig';
import Reconnecting from '~/components/Reconnecting';
import api from '~/lib/api';
import { areChainsEqual, fireTrackingEvent, resolveChainId } from '~/lib/utils';
import useStore from '~/hooks/useStore';

const silentReconnectAttempts = 3;
const silentReconnectRetryDelay = 250;
const manualConnectTimeout = 30000;
const connectCancelFocusDelay = 750;
const connectCancelCheckInterval = 250;
const defaultEnabledConnectors = {
  webWallet: true,
  argentX: true,
  braavos: true,
  controller: true,
  argentMobile: true
};

const connectorAliases = {
  argentWebWallet: 'webWallet',
  webWallet: 'webWallet',
  argentX: 'argentX',
  braavos: 'braavos',
  cartridge: 'controller',
  controller: 'controller',
  'controller-keychain': 'controller',
  argentMobile: 'argentMobile'
};

const getErrorMessage = (error) => {
  console.error(error);
  if (typeof error === 'string') return error;
  else if (typeof error === 'object' && error?.message) return error.message;
  return 'An unknown error occurred, please check the console for details.';
};

const isConnectorNotFoundError = (error) => {
  const message = typeof error === 'string' ? error : error?.message;
  return (
    error?.name === 'ConnectorNotFoundError' ||
    message?.includes('ConnectorNotFoundError') ||
    message?.includes('Connector not found')
  );
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createLoginCancelledError = () => new Error('Login cancelled');

const isLoginCancelledError = (error) => {
  const message = typeof error === 'string' ? error : error?.message;
  return (
    message === 'Login cancelled' ||
    message === 'User rejected request' ||
    message === 'User rejected' ||
    message === 'User abort' ||
    message === 'User not connected' ||
    error?.name === 'UserRejectedRequestError' ||
    error?.name === 'UserNotConnectedError'
  );
};

const createManualConnectCancellation = (connectorId, { cancelOnFocus = true } = {}) => {
  let cleanup = () => {};
  const promise = new Promise((_, reject) => {
    const startTime = Date.now();
    const focusCancels = cancelOnFocus && ['argentX', 'braavos'].includes(connectorId);
    let lostFocus = false;
    let sawControllerOpen = false;
    let focusTimer;

    const rejectCancelled = () => reject(createLoginCancelledError());
    const onBlur = () => {
      lostFocus = true;
    };
    const onFocus = () => {
      if (focusCancels && lostFocus && Date.now() - startTime > 500) {
        focusTimer = setTimeout(rejectCancelled, connectCancelFocusDelay);
      }
    };

    if (focusCancels && typeof window !== 'undefined') {
      window.addEventListener('blur', onBlur);
      window.addEventListener('focus', onFocus);
    }

    const controllerClosedInterval = setInterval(() => {
      if (connectorId !== 'controller' || typeof document === 'undefined') return;
      const controller = document.getElementById('controller');
      const isOpen = controller && controller.style.display !== 'none';

      if (isOpen) {
        sawControllerOpen = true;
      } else if (sawControllerOpen) {
        rejectCancelled();
      }
    }, connectCancelCheckInterval);

    const timeout = setTimeout(rejectCancelled, manualConnectTimeout);

    cleanup = () => {
      clearTimeout(timeout);
      clearTimeout(focusTimer);
      clearInterval(controllerClosedInterval);
      if (focusCancels && typeof window !== 'undefined') {
        window.removeEventListener('blur', onBlur);
        window.removeEventListener('focus', onFocus);
      }
    };
  });

  return { cleanup, promise };
};

const withManualWalletCancellation = async (walletPromise, connectorId, options) => {
  const cancellation = createManualConnectCancellation(connectorId, options);
  try {
    return await Promise.race([walletPromise, cancellation.promise]);
  } finally {
    cancellation.cleanup();
  }
};

const hasWalletConnection = ({ connectorData, wallet } = {}) => {
  return !!(wallet && connectorData?.account);
};

const hasValidSession = (session) => {
  return !!session?.token && !isExpired(session.token);
};

const normalizeConnectorId = (id) => connectorAliases[id] || id;

const normalizeEnabledConnectors = (enabledConnectors = defaultEnabledConnectors) => {
  return Object.entries(enabledConnectors).reduce((normalized, [id, enabled]) => {
    normalized[normalizeConnectorId(id)] = enabled;
    return normalized;
  }, {});
};

const getSelectedConnectorId = (enabledConnectors = defaultEnabledConnectors) => {
  return Object.keys(enabledConnectors).find((id) => enabledConnectors[id]);
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
  const [starknetSession] = useState();

  const [connectedAccount, setConnectedAccount] = useState();
  const [connectedChainId, setConnectedChainId] = useState();
  const [connectedWalletId, setConnectedWalletId] = useState();
  const [walletAccount, setWalletAccount] = useState();

  const [paymasterTokens, setPaymasterTokens] = useState([]);

  const [blockNumber, setBlockNumber] = useState(0);
  const [blockTime, setBlockTime] = useState(0);
  const [isBlockMissing, setIsBlockMissing] = useState(false);
  const [error, setError] = useState();

  const authenticated = useMemo(() => status === STATUSES.AUTHENTICATED || hasValidSession(currentSession), [currentSession, status]);
  const walletConnected = useMemo(() => !!walletAccount, [walletAccount]);
  const provider = useMemo(() => {
    let nodeUrl = appConfig.get('Starknet.provider');

    if (appConfig.get('Starknet.providerBackup') && Math.random() > 0.5) {
      nodeUrl = appConfig.get('Starknet.providerBackup');
    }

    return new RpcProvider({ nodeUrl });
  }, []);

  const getConnectors = useCallback((enabledConnectors = defaultEnabledConnectors) => {
    enabledConnectors = normalizeEnabledConnectors(enabledConnectors);

    // init argentMobileConnector since a little different
    const argentMobileConnector = ArgentMobileConnector.init({
      options: {
        url: typeof window !== 'undefined' ? window.location.href : '',
        dappName: 'Influence',
        chainId: resolveChainId(appConfig.get('Starknet.chainId')),
        provider
      }
    });

    if (isInArgentMobileAppBrowser()) {
      return { argentMobile: argentMobileConnector };
    }

    const connectors = {};
    if (enabledConnectors.webWallet && !!appConfig.get('Api.argentWebWallet')) {
      connectors.webWallet = new WebWalletConnector({ url: appConfig.get('Api.argentWebWallet'), provider });
    }

    if (enabledConnectors.argentX) connectors.argentX = new InjectedConnector({ options: { id: 'argentX', provider }});
    if (enabledConnectors.braavos) connectors.braavos = new InjectedConnector({ options: { id: 'braavos', provider }});
    if (enabledConnectors.controller) connectors.controller = new ControllerConnector();
    if (enabledConnectors.argentMobile) connectors.argentMobile = argentMobileConnector;

    return connectors;
  }, [provider]);

  const connectConnector = useCallback(async (connector, { auto = false, connectorId } = {}) => {
    const connectPromise = connector.connect({ onlyQRCode: true });
    const connectorData = auto
      ? await connectPromise
      : await withManualWalletCancellation(connectPromise, connectorId, { cancelOnFocus: false });

    return {
      connectorData,
      wallet: connector.wallet
    };
  }, []);

  // Login entry point, starts by connecting to wallet provider
  const connect = useCallback(async (auto = false, enabledConnectors = defaultEnabledConnectors) => {
    enabledConnectors = normalizeEnabledConnectors(enabledConnectors);

    if (auto && currentSession?.walletId) {
      localStorage.setItem('starknetLastConnectedWallet', currentSession.walletId);
    }

    try {
      const connectors = getConnectors(enabledConnectors);
      const selectedConnectorId = auto
        ? normalizeConnectorId(currentSession?.walletId || localStorage.getItem('starknetLastConnectedWallet'))
        : normalizeConnectorId(getSelectedConnectorId(enabledConnectors));
      const selectedConnector = connectors[selectedConnectorId];

      if (!selectedConnector) {
        if (!auto) {
          setPromptLogin(true);
          return;
        }
        throw new Error('Connector not found');
      }

      setError();
      setConnecting(true);
      let connectorData;
      let wallet;
      for (let i = 0; i < (auto ? silentReconnectAttempts : 1); i++) {
        try {
          ({ connectorData, wallet } = await connectConnector(selectedConnector, { auto, connectorId: selectedConnectorId }));
          if (!auto || hasWalletConnection({ connectorData, wallet }) || i === silentReconnectAttempts - 1) break;
          await wait(silentReconnectRetryDelay);
        } catch (e) {
          if (!auto || !isConnectorNotFoundError(e) || i === silentReconnectAttempts - 1) throw e;
          await wait(silentReconnectRetryDelay);
        }
      }

      if (hasWalletConnection({ connectorData, wallet })) {
        await wait(200); // deal with timeout delay from Argent
        const chainId = resolveChainId(connectorData.chainId);
        const walletId = wallet.id || selectedConnector.id;
        setConnectedAccount(Address.toStandard(connectorData.account));
        setConnectedChainId(chainId);
        setConnectedWalletId(walletId);

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

          localStorage.setItem('starknetLastConnectedWallet', walletId);
          await connect(true);
          setConnecting(false);
          return;
        }

        localStorage.setItem('starknetLastConnectedWallet', walletId);
        setStatus(STATUSES.CONNECTED);
      } else if (auto) {
        setStatus(hasValidSession(currentSession)
          ? STATUSES.AUTHENTICATED
          : STATUSES.DISCONNECTED
        );
      } else {
        console.error('No connected wallet or missing address');
      }
    } catch(e) {
      if (e.message === 'Incorrect chain') {
        console.log('');
        setError(`Incorrect chain, please switch to ${resolveChainId(appConfig.get('Starknet.chainId'))}`);
      }

      else if (auto && isConnectorNotFoundError(e)) {
        setStatus(hasValidSession(currentSession)
          ? STATUSES.AUTHENTICATED
          : STATUSES.DISCONNECTED
        );
      }

      else if (auto && isLoginCancelledError(e)) {
        setStatus(hasValidSession(currentSession)
          ? STATUSES.AUTHENTICATED
          : STATUSES.DISCONNECTED
        );
      }

      else if (isLoginCancelledError(e)) {
        setStatus(hasValidSession(currentSession)
          ? STATUSES.AUTHENTICATED
          : STATUSES.DISCONNECTED
        );
      }

      else if (e.message !== 'User rejected request') {
        setError(e);
      }
    }

    setConnecting(false);
  }, [connectConnector, currentSession, getConnectors, provider]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearWalletConnection = useCallback(() => {
    setConnectedAccount();
    setConnectedChainId();
    setConnectedWalletId();
    setWalletAccount();
  }, []);

  // Disconnect from the wallet provider and suspend session (don't fully logout)
  const disconnect = useCallback(() => {
    dispatchSessionSuspended();
    setStatus(STATUSES.DISCONNECTED);
    clearWalletConnection();
  }, [clearWalletConnection, dispatchSessionSuspended]);

  // End / delete session, disconnect wallet and forget last wallet provider (full reset)
  const logout = useCallback(() => {
    dispatchSessionEnded();
    setStatus(STATUSES.DISCONNECTED);
    clearWalletConnection();
    if (window.starknet) starknetDisconnect({ clearLastWallet: true });
  }, [ clearWalletConnection, dispatchSessionEnded ]);

  const disconnectWalletOnly = useCallback(() => {
    clearWalletConnection();
    setStatus(hasValidSession(currentSession)
      ? STATUSES.AUTHENTICATED
      : STATUSES.DISCONNECTED
    );
  }, [clearWalletConnection, currentSession]);

  // While connecting or connected, listen for network changes from extension
  useEffect(() => {
    const onAccountsChanged = (e) => {
      if (!e || (Array.isArray(e) && !e[0])) {
        disconnectWalletOnly();
        return;
      }

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
      if (!correctChain) disconnectWalletOnly();
    };

    const startListening = () => {
      if (walletAccount.onAccountChange) {
        walletAccount.onAccountChange(onAccountsChanged);
      } else if (walletAccount.on) {
        walletAccount.on('accountsChanged', onAccountsChanged);
      }

      if (walletAccount.onNetworkChanged) {
        walletAccount.onNetworkChanged(onNetworkChanged);
      } else if (walletAccount.on) {
        walletAccount.on('networkChanged', onNetworkChanged);
      }
    }

    const stopListening = () => {
      if (!walletAccount) return;

      if (walletAccount.off) {
        walletAccount.off('accountsChanged', onAccountsChanged);
        walletAccount.off('networkChanged', onNetworkChanged);
      } else if (walletAccount.walletProvider?.off) {
        walletAccount.walletProvider.off('accountsChanged', onAccountsChanged);
        walletAccount.walletProvider.off('networkChanged', onNetworkChanged);
      }
    };

    if (walletAccount) startListening();
    return stopListening;
  }, [ currentSession, disconnectWalletOnly, sessions, status, walletAccount ]); // eslint-disable-line react-hooks/exhaustive-deps

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
        const walletId = normalizeConnectorId(connectedWalletId || walletAccount?.walletProvider?.id);

        try {
          signature = await withManualWalletCancellation(walletAccount.signMessage(loginMessage), walletId);
        } catch (e) {
          if (isLoginCancelledError(e)) throw e;
          signature = await withManualWalletCancellation(walletAccount.walletProvider?.account.signMessage(loginMessage), walletId);
        }

        if (signature?.code === 'CANCELED') throw new Error('User abort');
        const newToken = await api.verifyLogin(connectedAccount, { signature: signature.join(','), referredBy });
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
        if (isLoginCancelledError(e)) return;
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
      if (hasValidSession(currentSession)) {
        setStatus(STATUSES.AUTHENTICATED);
        setReadyForChildren(true);
      } else if (currentSession?.walletId) {
        connect(true).finally(() => setReadyForChildren(true));
      } else {
        setReadyForChildren(true);
      }
    } else if (status === STATUSES.CONNECTED) {
      resumeOrAuthenticate().finally(() => {
        setReadyForChildren(true);
      });
    } else if (status === STATUSES.AUTHENTICATED) {
      setPromptLogin(false);
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
      if (hasValidSession(currentSession)) {
        disconnectWalletOnly();
      } else {
        logout(); // Disconnect and reset to prevent further issues
      }
    }
  }, [currentSession, disconnectWalletOnly, error, createAlert, logout]);

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
      await queryClient.fetchQuery({
        queryKey: [ 'user', currentSession.token ],
        queryFn: async () => {
          const { user, blockNumber: nextBlockNumber, blockTimestamp } = await api.getUser({ includeBlockData: true });

          if (nextBlockNumber > 0) setBlockNumber(nextBlockNumber);
          if (blockTimestamp > 0) setBlockTime(blockTimestamp);

          return user;
        }
      });
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
  }, [blockTime, queryClient]);

  const [promptLogin, setPromptLogin] = useState();
  const login = useCallback(async (enabledConnectors) => {
    if (status === STATUSES.AUTHENTICATING || (status === STATUSES.AUTHENTICATED && walletConnected)) return;

    if (enabledConnectors) {
      return connect(false, enabledConnectors);
    }

    if (currentSession?.walletId && !walletConnected) {
      return connect(false, { [currentSession.walletId]: true });
    }

    setPromptLogin(true);
  }, [connect, currentSession?.walletId, status, walletConnected]);

  const handleLoginPrompt = useCallback((choice) => {
    if (choice) {
      connect(undefined, { [choice]: true });
    }
  }, [connect]);

  const closeLoginPrompt = useCallback(() => {
    if (!connecting && ![STATUSES.CONNECTED, STATUSES.AUTHENTICATING].includes(status)) {
      setPromptLogin(false);
    }
  }, [connecting, status]);

  const loginOptions = useMemo(() => {
    const options = [];
    if (appConfig.get('Api.argentWebWallet')) options.push('webWallet');
    options.push('argentX', 'braavos', 'controller', 'argentMobile');
    return options;
  }, []);

  const loginPromptBusy = connecting || [STATUSES.CONNECTED, STATUSES.AUTHENTICATING].includes(status);

  // TODO: memoize value
  return (
    <SessionContext.Provider value={{
      login,
      loginPrompt: {
        busy: loginPromptBusy,
        close: closeLoginPrompt,
        onSelect: handleLoginPrompt,
        open: !!promptLogin,
        options: loginOptions
      },
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
      walletConnected,
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
    </SessionContext.Provider>
  );
};

export default SessionContext;
