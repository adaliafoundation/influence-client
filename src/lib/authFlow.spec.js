import { AUTH_PHASES, getAuthPhaseLabel, getReconnectMessage } from './authFlow';

test('labels known auth phases for login UI', () => {
  expect(getAuthPhaseLabel(AUTH_PHASES.CONNECTING_WALLET)).toBe('Connecting wallet');
  expect(getAuthPhaseLabel(AUTH_PHASES.VERIFYING_WALLET)).toBe('Verifying wallet');
  expect(getAuthPhaseLabel(AUTH_PHASES.SIGNING_IN)).toBe('Signing in');
  expect(getAuthPhaseLabel(AUTH_PHASES.PREPARING_SESSION)).toBe('Preparing session');
});

test('falls back to login label for unknown auth phases', () => {
  expect(getAuthPhaseLabel('unknown')).toBe('Log in');
});

test('formats reconnect messages with wallet context', () => {
  expect(getReconnectMessage({
    phase: AUTH_PHASES.VERIFYING_WALLET,
    walletName: 'Cartridge Controller'
  })).toBe('Verifying Cartridge Controller...');
});

test('formats session preparation message', () => {
  expect(getReconnectMessage({ phase: AUTH_PHASES.PREPARING_SESSION })).toBe('Preparing secure session...');
});
