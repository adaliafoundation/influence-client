import { features } from '~/appConfig/features';
import ControllerProvider from '@cartridge/controller';

import {
  WALLET_IDS,
  normalizeConnectorId
} from './walletIds';
import { isUnsupportedWalletDisconnectError } from './walletErrors';

export {
  WALLET_IDS,
  normalizeConnectorId
};

export const WALLET_ERROR_CODES = {
  CONNECTOR_NOT_FOUND: 'CONNECTOR_NOT_FOUND',
  NOT_CONNECTED: 'NOT_CONNECTED',
  USER_REJECTED: 'USER_REJECTED',
  WRONG_CHAIN: 'WRONG_CHAIN'
};

export class WalletConnectionError extends Error {
  constructor(code, message, { cause, userMessage } = {}) {
    super(message);
    this.name = 'WalletConnectionError';
    this.code = code;
    this.cause = cause;
    this.userMessage = userMessage || message;
  }
}

export const WALLET_STORAGE_KEYS = {
  LAST_CONNECTED_WALLET: 'starknetLastConnectedWallet',
  PENDING_AUTH_WALLET: 'starknetPendingAuthWallet'
};

const CARTRIDGE_NATIVE_CHAIN_IDS = new Set([
  '0x534e5f4d41494e',
  '0x534e5f5345504f4c4941'
]);

export const getCartridgeChainOptions = ({ chainId, rpcUrl }) => {
  const options = { defaultChainId: chainId };

  // Controller's native RPCs implement the session execution extensions used
  // on Starknet. Only override the chain definition for custom networks.
  if (!CARTRIDGE_NATIVE_CHAIN_IDS.has(chainId)) {
    options.chains = [{ chainId, rpcUrl }];
  }

  return options;
};

export const walletCapabilities = {
  [WALLET_IDS.PRIVY]: {
    embeddedAccount: true,
    preferredForStarterPacks: true,
    requiresSponsoredTransactions: true,
    supportsSessionKeys: false,
    supportsSubsidies: true,
    usesClientRawSigning: true
  },
  [WALLET_IDS.CONTROLLER]: {
    embeddedAccount: true,
    preferredForStarterPacks: true,
    supportsSessionKeys: true,
    supportsSubsidies: true
  },
  [WALLET_IDS.ARGENT_X]: {
    embeddedAccount: false,
    preferredForStarterPacks: false,
    supportsSessionKeys: false,
    supportsSubsidies: true
  },
  [WALLET_IDS.BRAAVOS]: {
    embeddedAccount: false,
    preferredForStarterPacks: false,
    supportsSessionKeys: false,
    supportsSubsidies: true
  }
};

export const walletRegistry = {
  [WALLET_IDS.PRIVY]: {
    id: WALLET_IDS.PRIVY,
    label: 'Influence Account',
    capabilities: walletCapabilities[WALLET_IDS.PRIVY]
  },
  [WALLET_IDS.CONTROLLER]: {
    id: WALLET_IDS.CONTROLLER,
    label: 'Cartridge Controller',
    capabilities: walletCapabilities[WALLET_IDS.CONTROLLER]
  },
  [WALLET_IDS.ARGENT_X]: {
    id: WALLET_IDS.ARGENT_X,
    label: 'Ready Wallet',
    capabilities: walletCapabilities[WALLET_IDS.ARGENT_X]
  },
  [WALLET_IDS.BRAAVOS]: {
    id: WALLET_IDS.BRAAVOS,
    label: 'Braavos',
    capabilities: walletCapabilities[WALLET_IDS.BRAAVOS]
  }
};

export const defaultWalletOrder = features.privy
  ? [WALLET_IDS.PRIVY, WALLET_IDS.CONTROLLER, WALLET_IDS.ARGENT_X, WALLET_IDS.BRAAVOS]
  : [WALLET_IDS.ARGENT_X, WALLET_IDS.CONTROLLER, WALLET_IDS.BRAAVOS];

export const getPrimaryNewPlayerLoginOptions = () => ({
  [features.privy ? WALLET_IDS.PRIVY : WALLET_IDS.ARGENT_X]: true
});

export const defaultEnabledConnectors = defaultWalletOrder.reduce((connectors, walletId) => {
  connectors[walletId] = true;
  return connectors;
}, {});

export const normalizeEnabledConnectors = (enabledConnectors = defaultEnabledConnectors) => {
  return Object.entries(enabledConnectors).reduce((normalized, [id, enabled]) => {
    const walletId = normalizeConnectorId(id);
    if (defaultWalletOrder.includes(walletId)) normalized[walletId] = enabled;
    return normalized;
  }, {});
};

export const getSelectedConnectorId = (enabledConnectors = defaultEnabledConnectors) => {
  return defaultWalletOrder.find((id) => enabledConnectors[id])
    || Object.keys(enabledConnectors).find((id) => enabledConnectors[id]);
};

export const getWalletCapabilities = (walletId) => {
  return walletCapabilities[normalizeConnectorId(walletId)] || {};
};

export const getWalletLabel = (walletId) => {
  return walletRegistry[normalizeConnectorId(walletId)]?.label || 'wallet';
};

export const getStoredWalletId = () => {
  if (typeof localStorage === 'undefined') return null;
  return normalizeConnectorId(localStorage.getItem(WALLET_STORAGE_KEYS.LAST_CONNECTED_WALLET));
};

export const setStoredWalletId = (walletId) => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(WALLET_STORAGE_KEYS.LAST_CONNECTED_WALLET, normalizeConnectorId(walletId));
};

export const clearStoredWalletId = () => {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(WALLET_STORAGE_KEYS.LAST_CONNECTED_WALLET);
};

export const getPendingAuthWalletId = () => {
  if (typeof sessionStorage === 'undefined') return null;
  return normalizeConnectorId(sessionStorage.getItem(WALLET_STORAGE_KEYS.PENDING_AUTH_WALLET));
};

export const setPendingAuthWalletId = (walletId) => {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(WALLET_STORAGE_KEYS.PENDING_AUTH_WALLET, normalizeConnectorId(walletId));
};

export const clearPendingAuthWalletId = () => {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(WALLET_STORAGE_KEYS.PENDING_AUTH_WALLET);
};

export const getLoginWalletOptions = (lastWalletId) => {
  const normalizedLastWalletId = normalizeConnectorId(lastWalletId || getStoredWalletId());

  if (!defaultWalletOrder.includes(normalizedLastWalletId)) return defaultWalletOrder;

  return [
    normalizedLastWalletId,
    ...defaultWalletOrder.filter((id) => id !== normalizedLastWalletId)
  ];
};

export const createWalletConnectionError = (code, connectorId, message) => {
  return new WalletConnectionError(code, message, {
    userMessage: message || `${getWalletLabel(connectorId)} could not connect. Please try again.`
  });
};

const getInjectedWallet = (id) => {
  if (typeof window === 'undefined') return null;
  return window[`starknet_${id}`] || null;
};

const getChainId = async (wallet) => {
  if (wallet?.chainId) return wallet.chainId;
  return wallet?.request?.({ type: 'wallet_requestChainId' });
};

const clearCartridgeControllerDom = () => {
  if (typeof document === 'undefined') return;

  document.getElementById('controller')?.remove();
  document.getElementById('controller-viewport')?.remove();
};

const clearCartridgeAccountSubscriptions = (controller) => {
  if (!Array.isArray(controller?.subscriptions)) return;
  controller.subscriptions
    .filter((subscription) => subscription.type === 'accountsChanged' && subscription.handler)
    .forEach((subscription) => controller.off?.('accountsChanged', subscription.handler));

  controller.subscriptions = controller.subscriptions.filter((subscription) => subscription.type !== 'accountsChanged');
};

const isCartridgeDisconnectError = (error) => {
  const message = typeof error === 'string' ? error : error?.message;
  return (
    message?.includes("Cannot read properties of undefined (reading 'toLowerCase')") ||
    message?.includes('Timeout waiting for keychain')
  );
};

const normalizeWalletError = (error, connectorId) => {
  const message = typeof error === 'string' ? error : error?.message;

  if (
    error?.code === WALLET_ERROR_CODES.CONNECTOR_NOT_FOUND ||
    error?.name === 'ConnectorNotFoundError' ||
    message?.includes('Connector not found')
  ) {
    return new WalletConnectionError(
      WALLET_ERROR_CODES.CONNECTOR_NOT_FOUND,
      `${getWalletLabel(connectorId)} is not available.`,
      {
        cause: error,
        userMessage: `${getWalletLabel(connectorId)} is not available. Choose another login option.`
      }
    );
  }

  if (
    error?.code === WALLET_ERROR_CODES.USER_REJECTED ||
    error?.name === 'UserRejectedRequestError' ||
    message === 'User rejected request' ||
    message === 'User rejected' ||
    message === 'User abort'
  ) {
    return new WalletConnectionError(
      WALLET_ERROR_CODES.USER_REJECTED,
      'Login cancelled.',
      { cause: error, userMessage: 'Login cancelled.' }
    );
  }

  return error;
};

class InjectedWalletConnector {
  constructor(id) {
    this.id = id;
  }

  get wallet() {
    return getInjectedWallet(this.id);
  }

  async connect({ auto = false } = {}) {
    const wallet = this.wallet;
    if (!wallet) {
      throw new WalletConnectionError(
        WALLET_ERROR_CODES.CONNECTOR_NOT_FOUND,
        `${getWalletLabel(this.id)} is not available.`,
        { userMessage: `${getWalletLabel(this.id)} is not available. Choose another login option.` }
      );
    }

    try {
      const accounts = await wallet.request({
        type: 'wallet_requestAccounts',
        params: { silent_mode: auto }
      });

      return {
        account: Array.isArray(accounts) ? accounts[0] : wallet.account?.address,
        chainId: await getChainId(wallet)
      };
    } catch (error) {
      throw normalizeWalletError(error, this.id);
    }
  }

  async disconnect() {
    try {
      await this.wallet?.request?.({ type: 'wallet_disconnect' });
    } catch (error) {
      if (!isUnsupportedWalletDisconnectError(error)) throw error;
    }
  }
}

class CartridgeConnector {
  constructor(options) {
    this.id = WALLET_IDS.CONTROLLER;
    clearCartridgeControllerDom();
    this.controller = new ControllerProvider(options);
  }

  get wallet() {
    return this.controller;
  }

  async connect({ auto = false } = {}) {
    try {
      const account = auto
        ? await this.controller.probe()
        : await this.controller.connect();

      return {
        account: account?.address || this.controller.account?.address,
        chainId: await getChainId(this.controller)
      };
    } catch (error) {
      throw normalizeWalletError(error, this.id);
    }
  }

  async disconnect() {
    clearCartridgeAccountSubscriptions(this.controller);

    try {
      await this.controller.disconnect();
    } catch (error) {
      if (!isCartridgeDisconnectError(error)) throw error;
    } finally {
      clearCartridgeAccountSubscriptions(this.controller);
      clearCartridgeControllerDom();
      this.controller.account = undefined;
    }
  }
}

export const createWalletConnectors = (
  enabledConnectors = defaultEnabledConnectors,
  { controllerOptions = {}, privyConnector } = {}
) => {
  const enabled = normalizeEnabledConnectors(enabledConnectors);
  const connectors = {};

  if (enabled[WALLET_IDS.PRIVY] && privyConnector) {
    connectors[WALLET_IDS.PRIVY] = privyConnector;
  }

  if (enabled[WALLET_IDS.CONTROLLER]) {
    connectors[WALLET_IDS.CONTROLLER] = new CartridgeConnector({
      lazyload: true,
      propagateSessionErrors: true,
      ...controllerOptions
    });
  }

  if (enabled[WALLET_IDS.ARGENT_X]) {
    connectors[WALLET_IDS.ARGENT_X] = new InjectedWalletConnector(WALLET_IDS.ARGENT_X);
  }

  if (enabled[WALLET_IDS.BRAAVOS]) {
    connectors[WALLET_IDS.BRAAVOS] = new InjectedWalletConnector(WALLET_IDS.BRAAVOS);
  }

  return connectors;
};
