jest.mock('~/appConfig/features', () => ({ features: { privy: true } }), { virtual: true });

jest.mock('@cartridge/controller', () => ({
  __esModule: true,
  default: jest.fn()
}), { virtual: true });

const { isUnsupportedWalletDisconnectError } = require('./walletErrors');
const {
  clearPendingAuthWalletId,
  createWalletConnectors,
  getPendingAuthWalletId,
  getCartridgeChainOptions,
  getPrimaryNewPlayerLoginOptions,
  setPendingAuthWalletId,
  WALLET_IDS
} = require('./wallets');
const ControllerProvider = require('@cartridge/controller').default;

beforeEach(() => {
  jest.clearAllMocks();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

test('uses Cartridge native RPCs for Starknet session execution', () => {
  expect(getCartridgeChainOptions({
    chainId: '0x534e5f5345504f4c4941',
    rpcUrl: 'https://generic-sepolia.example'
  })).toEqual({
    defaultChainId: '0x534e5f5345504f4c4941'
  });

  expect(getCartridgeChainOptions({
    chainId: '0x534e5f4d41494e',
    rpcUrl: 'https://generic-mainnet.example'
  })).toEqual({
    defaultChainId: '0x534e5f4d41494e'
  });
});

test('keeps the configured RPC for custom Cartridge chains', () => {
  expect(getCartridgeChainOptions({
    chainId: '0x1234',
    rpcUrl: 'https://custom-chain.example'
  })).toEqual({
    defaultChainId: '0x1234',
    chains: [{
      chainId: '0x1234',
      rpcUrl: 'https://custom-chain.example'
    }]
  });
});

test('uses Privy as the guided new-player login', () => {
  expect(getPrimaryNewPlayerLoginOptions()).toEqual({
    [WALLET_IDS.PRIVY]: true
  });
});

test('includes the Privy connector when enabled', () => {
  const privyConnector = { id: WALLET_IDS.PRIVY };
  const connectors = createWalletConnectors({
    [WALLET_IDS.PRIVY]: true,
    [WALLET_IDS.CONTROLLER]: false,
    [WALLET_IDS.ARGENT_X]: false,
    [WALLET_IDS.BRAAVOS]: false
  }, { privyConnector });

  expect(connectors).toEqual({
    [WALLET_IDS.PRIVY]: privyConnector
  });
});

test('stores pending auth wallet only for the current browser session', () => {
  setPendingAuthWalletId(WALLET_IDS.PRIVY);
  expect(getPendingAuthWalletId()).toBe(WALLET_IDS.PRIVY);

  clearPendingAuthWalletId();
  expect(getPendingAuthWalletId()).toBeNull();
});

test('identifies injected wallets that do not support wallet_disconnect', () => {
  expect(isUnsupportedWalletDisconnectError(
    new Error('Unknown request type: wallet_disconnect')
  )).toBe(true);

  expect(isUnsupportedWalletDisconnectError(
    'Unknown request type: wallet_disconnect'
  )).toBe(true);
});

test('does not hide unrelated disconnect errors', () => {
  expect(isUnsupportedWalletDisconnectError(
    new Error('Wallet transport failed')
  )).toBe(false);
});

test('cleans stale Cartridge controller state on disconnect', async () => {
  document.body.innerHTML = '<div id="controller"></div>';
  document.head.innerHTML = '<meta id="controller-viewport" />';

  const disconnect = jest.fn().mockRejectedValue(
    new TypeError("Cannot read properties of undefined (reading 'toLowerCase')")
  );

  ControllerProvider.mockImplementation(function mockControllerProvider() {
    this.account = { address: '0x1' };
    this.disconnect = disconnect;
    this.subscriptions = [
      { type: 'accountsChanged', handler: jest.fn() },
      { type: 'networkChanged', handler: jest.fn() }
    ];
  });

  const connectors = createWalletConnectors({
    [WALLET_IDS.CONTROLLER]: true,
    [WALLET_IDS.ARGENT_X]: false,
    [WALLET_IDS.BRAAVOS]: false
  });
  const controller = ControllerProvider.mock.instances[0];

  expect(document.getElementById('controller')).toBeNull();
  expect(document.getElementById('controller-viewport')).toBeNull();

  document.body.innerHTML = '<div id="controller"></div>';
  document.head.innerHTML = '<meta id="controller-viewport" />';

  await expect(connectors[WALLET_IDS.CONTROLLER].disconnect()).resolves.toBeUndefined();

  expect(disconnect).toHaveBeenCalledTimes(1);
  expect(controller.account).toBeUndefined();
  expect(controller.subscriptions).toHaveLength(1);
  expect(controller.subscriptions[0].type).toBe('networkChanged');
  expect(document.getElementById('controller')).toBeNull();
  expect(document.getElementById('controller-viewport')).toBeNull();
});


test('makes Ready the default and omits Privy when unconfigured, including a remembered Privy login', () => {
  jest.isolateModules(() => {
    const { features } = require('~/appConfig/features');
    features.privy = false;
    const wallets = require('./wallets');
    expect(wallets.getPrimaryNewPlayerLoginOptions()).toEqual({ [wallets.WALLET_IDS.ARGENT_X]: true });
    expect(wallets.getLoginWalletOptions(wallets.WALLET_IDS.PRIVY)).toEqual([
      wallets.WALLET_IDS.ARGENT_X, wallets.WALLET_IDS.CONTROLLER, wallets.WALLET_IDS.BRAAVOS
    ]);
    expect(wallets.normalizeEnabledConnectors({ privy: true, argentX: true })).toEqual({ argentX: true });
    features.privy = true;
  });
});
