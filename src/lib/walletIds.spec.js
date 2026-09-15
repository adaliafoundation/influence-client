import { normalizeConnectorId, WALLET_IDS } from './walletIds';

test('normalizes legacy Ready web wallet IDs to Cartridge', () => {
  expect(normalizeConnectorId('argentWebWallet')).toBe(WALLET_IDS.CONTROLLER);
  expect(normalizeConnectorId('webWallet')).toBe(WALLET_IDS.CONTROLLER);
});

test('normalizes Cartridge aliases to the canonical controller ID', () => {
  expect(normalizeConnectorId('cartridge')).toBe(WALLET_IDS.CONTROLLER);
  expect(normalizeConnectorId('controller-keychain')).toBe(WALLET_IDS.CONTROLLER);
});

test('preserves supported extension wallet IDs', () => {
  expect(normalizeConnectorId(WALLET_IDS.PRIVY)).toBe(WALLET_IDS.PRIVY);
  expect(normalizeConnectorId(WALLET_IDS.ARGENT_X)).toBe(WALLET_IDS.ARGENT_X);
  expect(normalizeConnectorId(WALLET_IDS.BRAAVOS)).toBe(WALLET_IDS.BRAAVOS);
});
