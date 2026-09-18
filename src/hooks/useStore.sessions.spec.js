const { TextDecoder, TextEncoder } = require('util');
global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

jest.mock('~/lib/priceUtils', () => ({ TOKEN: { SWAY: '0x1', USDC: '0x2' }, TOKEN_SCALE: { '0x1': 1e6 } }), { virtual: true });
jest.mock('~/lib/utils', () => ({ safeBigInt: (value) => BigInt(value || 0) }), { virtual: true });
jest.mock('~/lib/constants', () => jest.requireActual('../lib/constants'), { virtual: true });
jest.mock('~/lib/graphics/quality', () => jest.requireActual('../lib/graphics/quality'), { virtual: true });
jest.mock('~/lib/starterPacks', () => jest.requireActual('../lib/starterPacks'), { virtual: true });
jest.mock('~/lib/crewmatePurchases', () => jest.requireActual('../lib/crewmatePurchases'), { virtual: true });
jest.mock('~/simulation/simulationConfig', () => jest.requireActual('../simulation/simulationConfig'), { virtual: true });
jest.mock('~/appConfig', () => jest.requireActual('../appConfig'), { virtual: true });

const { Address } = require('@influenceth/sdk');
const useStore = require('./useStore').default;
const address = Address.toStandard('0xabc');
const login = { accountAddress: address, walletId: 'argentX', token: 'api-token', isDeployed: true };
const gameplaySession = { expiresAt: 2000000000, sessionKey: { privateKey: '0x123', publicKey: '0x456' } };

beforeEach(() => useStore.setState({ currentSession: {}, sessions: {} }));

test('keeps gameplay authorization with the existing session across suspension and resumption', () => {
  useStore.getState().dispatchSessionStarted({ ...login });
  useStore.getState().dispatchGameplaySessionUpdated('0xabc', 'argentX', gameplaySession);
  expect(useStore.getState().currentSession.gameplaySession).toEqual(gameplaySession);
  expect(useStore.getState().currentSession.token).toBe('api-token');
  useStore.getState().dispatchSessionSuspended();
  expect(useStore.getState().currentSession).toEqual({});
  const saved = useStore.getState().sessions[address];
  expect(saved.gameplaySession).toEqual(gameplaySession);
  useStore.getState().dispatchSessionResumed(saved);
  expect(useStore.getState().currentSession.gameplaySession).toEqual(gameplaySession);
  useStore.getState().dispatchSessionEnded();
  expect(useStore.getState().sessions[address]).toBeUndefined();
  expect(useStore.getState().currentSession).toEqual({});
});

test('ignores approvals for a different wallet, account, or ended session', () => {
  useStore.getState().dispatchSessionStarted({ ...login });
  useStore.getState().dispatchGameplaySessionUpdated('0xabc', 'controller', gameplaySession);
  useStore.getState().dispatchGameplaySessionUpdated('0xdef', 'argentX', gameplaySession);
  expect(useStore.getState().currentSession.gameplaySession).toBeUndefined();
  useStore.getState().dispatchSessionEnded();
  useStore.getState().dispatchGameplaySessionUpdated('0xabc', 'argentX', gameplaySession);
  expect(useStore.getState().sessions).toEqual({});
});

test('invalidating gameplay authorization preserves API authentication', () => {
  useStore.getState().dispatchSessionStarted({ ...login, gameplaySession });
  useStore.getState().dispatchGameplaySessionUpdated('0xabc', 'argentX', null);
  expect(useStore.getState().currentSession.token).toBe('api-token');
  expect(useStore.getState().sessions[address].gameplaySession).toBeNull();
});
