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


const { default: useStore, STORE_NAME } = require('./useStore');

const initialState = useStore.getState();
beforeEach(() => {
  useStore.setState(initialState, true);
  localStorage.clear();
});

test.each(['zooming-out', 'zooming-in', 'out', 'in'])(
  'starts at the belt instead of restoring saved %s navigation', async (zoomStatus) => {
    const saved = {
      asteroids: { ...initialState.asteroids, origin: 1, lot: 123, zoomStatus, zoomScene: { type: 'LOT' } },
      actionDialog: { type: 'CONSTRUCT' }, lotCameraTransition: 123,
      cameraNeedsHighAltitude: true, cameraNeedsReorientation: true, cameraNeedsRecenter: true,
      launcherPage: 'store', openHudMenu: 'RESOURCES', canvasStack: ['old-canvas'],
      graphics: { ...initialState.graphics, pixelRatio: 0.5, hideInterface: true, showDevTools: true },
      selectedCrewId: 42, currentSession: { token: 'session-token' },
      pendingTransactions: [{ txHash: '0x123' }], simulation: { step: 7 }, simulationEnabled: true
    };
    localStorage.setItem(STORE_NAME, JSON.stringify({ state: saved, version: 9 }));
    await useStore.persist.rehydrate();
    const state = useStore.getState();
    expect(state.asteroids).toEqual(initialState.asteroids);
    for (const key of ['actionDialog', 'lotCameraTransition', 'cameraNeedsHighAltitude',
      'cameraNeedsReorientation', 'cameraNeedsRecenter', 'launcherPage', 'openHudMenu', 'canvasStack', 'simulationEnabled']) {
      expect(state[key]).toEqual(initialState[key]);
    }
    expect(state.graphics.pixelRatio).toBe(0.5);
    expect(state.graphics.hideInterface).toBeUndefined();
    expect(state.graphics.showDevTools).toBeUndefined();
    expect(state.selectedCrewId).toBe(42);
    expect(state.currentSession).toEqual(saved.currentSession);
    expect(state.pendingTransactions).toEqual(saved.pendingTransactions);
    expect(state.simulation.step).toBe(7);
    expect(typeof state.dispatchZoomStatusChanged).toBe('function');
    const stored = JSON.parse(localStorage.getItem(STORE_NAME)).state;
    expect(stored.asteroids).toBeUndefined();
    expect(stored.actionDialog).toBeUndefined();
    expect(stored.cameraNeedsHighAltitude).toBeUndefined();
  }
);

test.each([0, 1, 2, 3, 4, 5, 6, 7, 8])('migrates version %s while preserving account work', async (version) => {
  const saved = {
    ...initialState, currentSession: { token: 'keep-token' }, selectedCrewId: 42,
    pendingTransactions: [{ txHash: '0x123' }], starterPackCheckout: { purchaseId: 'legacy' }
  };
  localStorage.setItem(STORE_NAME, JSON.stringify({ state: saved, version }));
  await useStore.persist.rehydrate();
  expect(useStore.getState().currentSession).toEqual(saved.currentSession);
  expect(useStore.getState().selectedCrewId).toBe(42);
  expect(useStore.getState().pendingTransactions).toEqual(saved.pendingTransactions);
  expect(useStore.getState().starterPackCheckout).toBeNull();
  expect(JSON.parse(localStorage.getItem(STORE_NAME)).version).toBe(9);
});

test('live navigation still animates but is not persisted', () => {
  useStore.getState().dispatchOriginSelected(1);
  useStore.getState().dispatchZoomStatusChanged('zooming-in');
  expect(useStore.getState().asteroids.origin).toBe(1);
  expect(useStore.getState().asteroids.zoomStatus).toBe('zooming-in');
  expect(JSON.parse(localStorage.getItem(STORE_NAME)).state.asteroids).toBeUndefined();
});
