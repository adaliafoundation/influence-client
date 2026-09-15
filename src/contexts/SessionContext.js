import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isExpired } from 'react-jwt';
import { PaymasterRpc, RpcProvider, WalletAccount } from 'starknet';
import { Address } from '@influenceth/sdk';
import { appConfig } from '~/appConfig';
import Reconnecting from '~/components/Reconnecting';
import api from '~/lib/api';
import { AUTH_PHASES, getAuthPhaseLabel } from '~/lib/authFlow';
import { usePrivyWallet } from '~/contexts/PrivyWalletContext';
import { getLoginSessionVerificationHashes, getLoginTypedData, getLoginVerificationParams } from '~/lib/loginTypedData';
import { createAuthenticatedPaymasterRpc } from '~/lib/paymaster';
import { TOKEN } from '~/lib/priceUtils';
import { areChainsEqual, fireTrackingEvent, resolveChainId } from '~/lib/utils';
import {
  createWalletConnectors,
  defaultEnabledConnectors,
  getSelectedConnectorId,
  getWalletCapabilities,
  getWalletLabel,
  getPendingAuthWalletId,
  getStoredWalletId,
  getCartridgeChainOptions,
  normalizeConnectorId,
  normalizeEnabledConnectors,
  WALLET_IDS,
  WALLET_ERROR_CODES,
  clearPendingAuthWalletId,
  clearStoredWalletId,
  createWalletConnectionError,
  getLoginWalletOptions,
  setPendingAuthWalletId,
  setStoredWalletId
} from '~/lib/wallets';
import { allowedMethods, buildGameplaySessionPolicies } from '~/lib/walletPolicies';
import useStore from '~/hooks/useStore';

const silentReconnectAttempts = 3;
const silentReconnectRetryDelay = 250;
const manualConnectTimeout = 30000;
const connectCancelFocusDelay = 750;
const connectCancelCheckInterval = 250;

const getErrorMessage = (error) => {
  console.error(error);
  if (error?.userMessage) return error.userMessage;
  if (typeof error === 'string') return error;
  else if (typeof error === 'object' && error?.message) return error.message;
  return 'An unknown error occurred, please check the console for details.';
};

const normalizeAuthSigningError = (error) => {
  if (!error?.message?.includes('invalid domain type definition')) return error;

  const authError = new Error('Login challenge is not compatible with this wallet.');
  authError.cause = error;
  authError.code = 'AUTH_TYPED_DATA_UNSUPPORTED';
  authError.userMessage = 'Login could not be signed by this wallet. Please try another wallet or report this issue.';
  return authError;
};

const isConnectorNotFoundError = (error) => {
  const message = typeof error === 'string' ? error : error?.message;
  return (
    error?.code === WALLET_ERROR_CODES.CONNECTOR_NOT_FOUND ||
    error?.name === 'ConnectorNotFoundError' ||
    message?.includes('ConnectorNotFoundError') ||
    message?.includes('Connector not found')
  );
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createLoginCancelledError = () => new Error('Login cancelled');

const createGameplaySessionApprovalError = (cause) => {
  const error = new Error('Gameplay session approval was not completed.');
  error.cause = cause;
  error.userMessage = 'Gameplay session approval was not completed. Please try logging in again.';
  return error;
};

const createLoginSigningUnavailableError = (cause) => {
  const error = new Error('Wallet cannot sign the login challenge.');
  error.cause = cause;
  error.userMessage = 'This wallet could not sign the login challenge. Please try reconnecting or use another wallet.';
  return error;
};

const isLoginCancelledError = (error) => {
  const message = typeof error === 'string' ? error : error?.message;
  return (
    error?.code === WALLET_ERROR_CODES.USER_REJECTED ||
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

const withManualWalletGuard = async (walletPromise, connectorId) => {
  if ([WALLET_IDS.CONTROLLER, WALLET_IDS.PRIVY].includes(normalizeConnectorId(connectorId))) {
    return walletPromise;
  }
  return withManualWalletCancellation(walletPromise, connectorId, { cancelOnFocus: false });
};

const hasWalletConnection = ({ connectorData, wallet } = {}) => {
  return !!(wallet && connectorData?.account);
};

const hasValidSession = (session) => {
  return !!session?.token && !isExpired(session.token);
};

const isAllowedChain = (chain) => {
  return areChainsEqual(chain, appConfig.get('Starknet.chainId'));
};

const STATUSES = {
  DISCONNECTED: 0,
  CONNECTING: 1,
  CONNECTED: 2,
  AUTHENTICATING: 3,
  AUTHENTICATED: 4
};

const getAuthenticatedStatus = (session) => {
  return hasValidSession(session)
    ? STATUSES.AUTHENTICATED
    : STATUSES.DISCONNECTED;
};

const SessionContext = createContext();

export function SessionProvider({ children }) {
  const queryClient = useQueryClient();
  const createAlert = useStore(s => s.dispatchAlertLogged);
  const { connector: privyConnector } = usePrivyWallet();

  const currentSession = useStore(s => s.currentSession);
  const gameplay = useStore(s => s.gameplay);
  const lastConnectedWalletId = useStore(s => s.lastConnectedWalletId);
  const referredBy = useStore(s => s.referrer);
  const sessions = useStore(s => s.sessions);
  const dispatchSessionStarted = useStore(s => s.dispatchSessionStarted);
  const dispatchSessionSuspended = useStore(s => s.dispatchSessionSuspended);
  const dispatchSessionResumed = useStore(s => s.dispatchSessionResumed);
  const dispatchSessionEnded = useStore(s => s.dispatchSessionEnded);

  const [readyForChildren, setReadyForChildren] = useState(false);

  const [connecting, setConnecting] = useState(false);
  const [authPhase, setAuthPhase] = useState(AUTH_PHASES.IDLE);
  const [promptLogin, setPromptLogin] = useState();
  const [status, setStatus] = useState(STATUSES.DISCONNECTED);

  const [connectedAccount, setConnectedAccount] = useState();
  const [connectedChainId, setConnectedChainId] = useState();
  const [connectedWalletId, setConnectedWalletId] = useState();
  const [connectedConnector, setConnectedConnector] = useState();
  const [walletAccount, setWalletAccount] = useState();
  const [accountDeploymentData, setAccountDeploymentData] = useState();
  const [gameplaySessionReady, setGameplaySessionReady] = useState(false);

  const [paymasterTokens, setPaymasterTokens] = useState([]);
  const authFlowRef = useRef(0);
  const resettingWalletRef = useRef(false);

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
  const privyPaymaster = useMemo(() => {
    const nodeUrl = appConfig.get('Starknet.paymasterProxy');
    return nodeUrl ? createAuthenticatedPaymasterRpc({ nodeUrl }) : null;
  }, []);

  const gameplaySessionPolicies = useMemo(() => buildGameplaySessionPolicies(), []);

  const getConnectors = useCallback((enabledConnectors = defaultEnabledConnectors) => {
    return createWalletConnectors(enabledConnectors, {
      controllerOptions: {
        ...getCartridgeChainOptions({
          chainId: appConfig.get('Starknet.chainId'),
          rpcUrl: appConfig.get('Starknet.provider')
        }),
        errorDisplayMode: 'notification',
        policies: gameplaySessionPolicies
      },
      privyConnector
    });
  }, [gameplaySessionPolicies, privyConnector]);

  const connectConnector = useCallback(async (connector, { auto = false, connectorId, resumeAuth = false } = {}) => {
    const connectPromise = connector.connect({
      auto,
      paymaster: privyPaymaster,
      provider,
      resumeAuth
    });
    const connectorData = auto
      ? await connectPromise
      : await withManualWalletGuard(connectPromise, connectorId);

    return {
      connectorData,
      wallet: connector.wallet
    };
  }, [privyPaymaster, provider]);

  // Login entry point, starts by connecting to wallet provider
  const connect = useCallback(async (auto = false, enabledConnectors = defaultEnabledConnectors, { resumeAuth = false } = {}) => {
    enabledConnectors = normalizeEnabledConnectors(enabledConnectors);
    const authFlowId = ++authFlowRef.current;

    if (auto && currentSession?.walletId) {
      setStoredWalletId(currentSession.walletId);
    }

    try {
      const connectors = getConnectors(enabledConnectors);
      const selectedConnectorId = auto
        ? normalizeConnectorId(currentSession?.walletId || lastConnectedWalletId || getStoredWalletId())
        : normalizeConnectorId(getSelectedConnectorId(enabledConnectors));
      const selectedConnector = connectors[selectedConnectorId];

      if (!selectedConnector) {
        if (!auto) {
          setPromptLogin(true);
          return;
        }
        throw createWalletConnectionError(
          WALLET_ERROR_CODES.CONNECTOR_NOT_FOUND,
          selectedConnectorId,
          `${getWalletLabel(selectedConnectorId)} is not available. Choose another login option.`
        );
      }

      setError();
      if (!auto && selectedConnectorId === WALLET_IDS.PRIVY) {
        setPendingAuthWalletId(selectedConnectorId);
      }
      setConnecting(true);
      setAuthPhase(auto ? AUTH_PHASES.RECONNECTING_WALLET : AUTH_PHASES.CONNECTING_WALLET);
      let connectorData;
      let wallet;
      for (let i = 0; i < (auto ? silentReconnectAttempts : 1); i++) {
        try {
          ({ connectorData, wallet } = await connectConnector(selectedConnector, { auto, connectorId: selectedConnectorId, resumeAuth }));
          if (authFlowId !== authFlowRef.current) return;
          if (!auto || hasWalletConnection({ connectorData, wallet }) || i === silentReconnectAttempts - 1) break;
          await wait(silentReconnectRetryDelay);
          if (authFlowId !== authFlowRef.current) return;
        } catch (e) {
          if (!auto || !isConnectorNotFoundError(e) || i === silentReconnectAttempts - 1) throw e;
          await wait(silentReconnectRetryDelay);
          if (authFlowId !== authFlowRef.current) return;
        }
      }

      if (hasWalletConnection({ connectorData, wallet })) {
        await wait(200); // deal with timeout delay from Argent
        if (authFlowId !== authFlowRef.current) return;

        const chainId = resolveChainId(connectorData.chainId);
        const walletId = wallet.id || selectedConnector.id;
        setAuthPhase(AUTH_PHASES.VERIFYING_WALLET);
        setConnectedAccount(Address.toStandard(connectorData.account));
        setConnectedChainId(chainId);
        setConnectedWalletId(walletId);
        setConnectedConnector(selectedConnector);

        if (!isAllowedChain(chainId)) {
          try {
            await wallet.request({
              type: 'wallet_switchStarknetChain',
              params: { chainId: appConfig.get('Starknet.chainId') }
            });
          } catch (e) { // (standardize error message here since different between wallets)
            throw new Error('Incorrect chain');
          }

          setStoredWalletId(walletId);
          await connect(true);
          setConnecting(false);
          return;
        }

        let paymaster;
        if (appConfig.get('Starknet.paymaster')) {
          paymaster = new PaymasterRpc({
            nodeUrl: appConfig.get('Starknet.paymaster'),
            // TODO: add x-paymaster-api-key if we are going to sponsor gas
            // headers: { 'api-key': process.env.PAYMASTER_API_KEY },
          });
        }

        const newAccount = connectorData.walletAccount || await WalletAccount.connect(
          provider,
          wallet,
          undefined,
          paymaster
        );
        if (authFlowId !== authFlowRef.current) return;

        const capabilities = getWalletCapabilities(walletId);
        try {
          const paymasterConfigured = capabilities.requiresSponsoredTransactions
            ? appConfig.get('Starknet.paymasterProxy')
            : appConfig.get('Starknet.paymaster');
          setPaymasterTokens(paymasterConfigured ? (await newAccount.paymaster?.getSupportedTokens?.() || []) : []);
        } catch (error) {
          console.warn('Unable to load paymaster-supported fee tokens.', error);
          setPaymasterTokens([]);
        }
        if (authFlowId !== authFlowRef.current) return;

        setWalletAccount(newAccount);
        setAccountDeploymentData(connectorData.deploymentData);
        setGameplaySessionReady(!!capabilities.supportsSessionKeys);

        clearPendingAuthWalletId();
        setStoredWalletId(walletId);
        setStatus(STATUSES.CONNECTED);
      } else if (auto) {
        setAuthPhase(AUTH_PHASES.IDLE);
        setStatus(getAuthenticatedStatus(currentSession));
      } else if (resumeAuth) {
        clearPendingAuthWalletId();
        setAuthPhase(AUTH_PHASES.IDLE);
        setStatus(getAuthenticatedStatus(currentSession));
      } else if (!auto) {
        throw createWalletConnectionError(
          WALLET_ERROR_CODES.NOT_CONNECTED,
          selectedConnectorId,
          `${getWalletLabel(selectedConnectorId)} did not return an account. Please try again.`
        );
      }
    } catch(e) {
      if (e.message === 'Incorrect chain') {
        console.log('');
        setError(`Incorrect chain, please switch to ${resolveChainId(appConfig.get('Starknet.chainId'))}`);
      }

      else if (auto && isConnectorNotFoundError(e)) {
        setAuthPhase(AUTH_PHASES.IDLE);
        setStatus(getAuthenticatedStatus(currentSession));
      }

      else if (auto && isLoginCancelledError(e)) {
        setAuthPhase(AUTH_PHASES.IDLE);
        setStatus(getAuthenticatedStatus(currentSession));
      }

      else if (isLoginCancelledError(e)) {
        clearPendingAuthWalletId();
        setAuthPhase(AUTH_PHASES.IDLE);
        setStatus(getAuthenticatedStatus(currentSession));
      }

      else if (!auto && e.message !== 'User rejected request') {
        clearPendingAuthWalletId();
        setAuthPhase(AUTH_PHASES.FAILED);
        setError(e);
      }
    }

    if (authFlowId === authFlowRef.current) setConnecting(false);
  }, [connectConnector, currentSession, getConnectors, lastConnectedWalletId, provider]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearWalletConnection = useCallback(() => {
    setConnectedAccount();
    setConnectedChainId();
    setConnectedWalletId();
    setConnectedConnector();
    setWalletAccount();
    setAccountDeploymentData();
    setPaymasterTokens([]);
    setGameplaySessionReady(false);
  }, []);

  const resetAuthFlowState = useCallback(() => {
    authFlowRef.current += 1;
    setConnecting(false);
    setPromptLogin(false);
    setError();
    setAuthPhase(AUTH_PHASES.IDLE);
    setStatus(STATUSES.DISCONNECTED);
    clearPendingAuthWalletId();
    clearWalletConnection();
  }, [clearWalletConnection]);

  const getDisconnectConnector = useCallback(() => {
    if (connectedConnector) return connectedConnector;

    const walletId = normalizeConnectorId(connectedWalletId || currentSession?.walletId || getStoredWalletId());
    if (!walletId) return null;

    return getConnectors({ [walletId]: true })[walletId] || null;
  }, [connectedConnector, connectedWalletId, currentSession?.walletId, getConnectors]);

  // Disconnect from the wallet provider and suspend session (don't fully logout)
  const disconnect = useCallback(() => {
    resettingWalletRef.current = true;
    dispatchSessionSuspended();
    resetAuthFlowState();
    resettingWalletRef.current = false;
  }, [dispatchSessionSuspended, resetAuthFlowState]);

  // End / delete session, disconnect wallet and forget last wallet provider (full reset)
  const logout = useCallback(async () => {
    const connector = getDisconnectConnector();
    resettingWalletRef.current = true;
    try {
      await connector?.disconnect?.();
    } catch (e) {
      console.warn(e);
    } finally {
      dispatchSessionEnded();
      resetAuthFlowState();
      clearStoredWalletId();
      resettingWalletRef.current = false;
    }
  }, [ dispatchSessionEnded, getDisconnectConnector, resetAuthFlowState ]);

  const disconnectWalletOnly = useCallback(() => {
    resettingWalletRef.current = true;
    clearWalletConnection();
    setAuthPhase(AUTH_PHASES.IDLE);
    setStatus(getAuthenticatedStatus(currentSession));
    setConnecting(false);
    resettingWalletRef.current = false;
  }, [clearWalletConnection, currentSession]);

  // While connecting or connected, listen for network changes from extension
  useEffect(() => {
    const onAccountsChanged = (e) => {
      if (resettingWalletRef.current) return;

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
      if (resettingWalletRef.current) return;

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

  const sessionWallet = useMemo(() => {
    const walletCapabilities = getWalletCapabilities(currentSession?.walletId || connectedWalletId);
    return walletCapabilities.supportsSessionKeys ? connectedConnector?.wallet : null;
  }, [connectedConnector?.wallet, currentSession?.walletId, connectedWalletId]);

  const shouldUseSessionKeys = useCallback((ignorePreference = false) => {
    const walletCapabilities = getWalletCapabilities(currentSession?.walletId || connectedWalletId);
    return !!walletCapabilities.supportsSessionKeys && (ignorePreference || gameplay.useSessions !== false);
  }, [connectedWalletId, currentSession?.walletId, gameplay.useSessions]);

  const prepareGameplaySession = useCallback(async (ignorePreference = false) => {
    if (!await shouldUseSessionKeys(ignorePreference)) return false;
    if (gameplaySessionReady) return true;
    if (!sessionWallet?.updateSession) throw createGameplaySessionApprovalError(
      new Error('Wallet does not expose a gameplay session API.')
    );

    let sessionApproved;
    try {
      sessionApproved = await sessionWallet.updateSession({ policies: gameplaySessionPolicies });
    } catch (e) {
      throw createGameplaySessionApprovalError(e);
    }

    if (!sessionApproved) throw createGameplaySessionApprovalError();
    setGameplaySessionReady(true);
    return true;
  }, [gameplaySessionPolicies, gameplaySessionReady, sessionWallet, shouldUseSessionKeys]);

  const signLoginChallenge = useCallback(async (loginMessage, walletId) => {
    try {
      return await withManualWalletGuard(walletAccount.signMessage(loginMessage), walletId);
    } catch (error) {
      const e = normalizeAuthSigningError(error);
      if (isLoginCancelledError(e)) throw e;
      if (e.code === 'AUTH_TYPED_DATA_UNSUPPORTED') throw e;

      const fallbackSignMessage = walletAccount.walletProvider?.account?.signMessage;
      if (!fallbackSignMessage) throw createLoginSigningUnavailableError(e);

      return withManualWalletGuard(fallbackSignMessage.call(walletAccount.walletProvider.account, loginMessage), walletId);
    }
  }, [walletAccount]);

  const verifyLoginSignature = useCallback((walletId, signature, loginMessage) => {
    return api.verifyLogin(connectedAccount, getLoginVerificationParams({
      signature,
      referredBy,
      typedData: loginMessage,
      walletId
    }));
  }, [connectedAccount, referredBy]);

  const logLoginVerificationHashes = useCallback((walletId, loginMessage) => {
    if (normalizeConnectorId(walletId) !== WALLET_IDS.CONTROLLER) return;
    if (!appConfig.get('App.verboseLogs')) return;

    try {
      console.info('Cartridge login verification hashes', getLoginSessionVerificationHashes(loginMessage));
    } catch (e) {
      console.warn('Failed to compute Cartridge login verification hashes', e);
    }
  }, []);

  // Authenticate with a signed message against the API and create a new session
  const authenticate = useCallback(async ({ isUpgradeInsecure = false } = {}) => {
    const authFlowId = ++authFlowRef.current;
    const newSession = {};

    // Check if the account contract has been deployed yet
    if (!isUpgradeInsecure) setAuthPhase(AUTH_PHASES.VERIFYING_WALLET);
    newSession.isDeployed = await checkDeployed();
    if (authFlowId !== authFlowRef.current) return false;

    // Start authenticating by requesting a login message from API
    if (!isUpgradeInsecure) setStatus(STATUSES.AUTHENTICATING);
    if (!isUpgradeInsecure) setAuthPhase(AUTH_PHASES.SIGNING_IN);
    const serverLoginMessage = await api.requestLogin(connectedAccount);
    if (authFlowId !== authFlowRef.current) return false;

    const loginMessage = getLoginTypedData(serverLoginMessage);

    try {
      if (newSession.isDeployed) {
        let signature;
        const walletId = normalizeConnectorId(connectedWalletId || walletAccount?.walletProvider?.id);

        logLoginVerificationHashes(walletId, loginMessage);
        signature = await signLoginChallenge(loginMessage, walletId);
        if (authFlowId !== authFlowRef.current) return false;

        if (signature?.code === 'CANCELED') throw new Error('User abort');
        const newToken = await verifyLoginSignature(walletId, signature, loginMessage);
        if (authFlowId !== authFlowRef.current) return false;

        Object.assign(newSession, { walletId, accountAddress: connectedAccount, token: newToken });

        if (await shouldUseSessionKeys()) {
          setAuthPhase(AUTH_PHASES.PREPARING_SESSION);
          await prepareGameplaySession();
          if (authFlowId !== authFlowRef.current) return false;
        }
      } else {
        // If the wallet is not yet deployed, create an insecure session
        const newToken = await api.verifyLogin(connectedAccount, { signature: 'insecure', referredBy });
        if (authFlowId !== authFlowRef.current) return false;

        Object.assign(newSession, { walletId: connectedWalletId, accountAddress: connectedAccount, token: newToken });
      }

      dispatchSessionStarted(newSession);
      setAuthPhase(AUTH_PHASES.AUTHENTICATED);
      setStatus(STATUSES.AUTHENTICATED);
      return true;
    } catch (e) {
      if (!isUpgradeInsecure) {
        if (isLoginCancelledError(e)) return;
        console.error(e);
        clearWalletConnection();
        setAuthPhase(AUTH_PHASES.FAILED);
        setStatus(getAuthenticatedStatus(currentSession));
        createAlert({
          type: 'GenericAlert',
          level: 'warning',
          data: { content: getErrorMessage(e) || 'Signature verification failed.' },
          duration: 10000
        });
      }
    }

    if (!isUpgradeInsecure && authFlowId === authFlowRef.current) disconnect();
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
    clearWalletConnection,
    currentSession,
    logLoginVerificationHashes,
    signLoginChallenge,
    verifyLoginSignature,
    shouldUseSessionKeys,
    prepareGameplaySession
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
        setAuthPhase(AUTH_PHASES.AUTHENTICATED);
        setReadyForChildren(true);
      } else if (currentSession?.walletId) {
        connect(true).finally(() => setReadyForChildren(true));
      } else if (getPendingAuthWalletId()) {
        const pendingWalletId = getPendingAuthWalletId();
        connect(false, { [pendingWalletId]: true }, { resumeAuth: true })
          .finally(() => setReadyForChildren(true));
      } else {
        setReadyForChildren(true);
      }
    } else if (status === STATUSES.CONNECTED) {
      resumeOrAuthenticate().finally(() => {
        setReadyForChildren(true);
      });
    } else if (status === STATUSES.AUTHENTICATED) {
      setAuthPhase(AUTH_PHASES.AUTHENTICATED);
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
      return [TOKEN.USDC, TOKEN.SWAY].filter((t) => gameplay.feeTokens.includes(t)).filter((t) => {
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
    return getLoginWalletOptions(lastConnectedWalletId);
  }, [lastConnectedWalletId]);

  const loginPromptBusy = connecting || [STATUSES.CONNECTED, STATUSES.AUTHENTICATING].includes(status);
  const walletCapabilities = useMemo(() => getWalletCapabilities(currentSession?.walletId || connectedWalletId), [currentSession?.walletId, connectedWalletId]);

  // TODO: memoize value
  return (
    <SessionContext.Provider value={{
      login,
      loginPrompt: {
        busy: loginPromptBusy,
        close: closeLoginPrompt,
        label: getAuthPhaseLabel(authPhase),
        onSelect: handleLoginPrompt,
        open: !!promptLogin,
        options: loginOptions
      },
      logout,
      accountAddress: authenticated ? currentSession?.accountAddress : null,
      accountDeploymentData: authenticated ? accountDeploymentData : null,
      allowedMethods,
      authenticated,
      authenticating: [STATUSES.AUTHENTICATING, STATUSES.CONNECTING].includes(status),
      authPhase,
      chainId: authenticated ? connectedChainId : null,
      connecting: connecting || !!promptLogin,
      isDeployed: authenticated ? currentSession?.isDeployed : null,
      gasTokens: authenticated ? gasTokens : null,
      paymasterTokens: authenticated ? paymasterTokens : null,
      gameplaySessionReady,
      provider,
      prepareGameplaySession,
      shouldUseSessionKeys,
      sessionWallet,
      status,
      token: authenticated ? currentSession?.token : null,
      upgradeInsecureSession,
      walletCapabilities,
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
            ? (
              <Reconnecting
                phase={authPhase}
                walletName={getWalletLabel(currentSession?.walletId || lastConnectedWalletId)}
                onLogout={logout} />
            )
            : null
        )
      }
    </SessionContext.Provider>
  );
};

export default SessionContext;
