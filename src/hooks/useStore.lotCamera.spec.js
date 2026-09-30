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


const useStore = require('./useStore').default;

beforeEach(() => {
  useStore.getState().dispatchLotSelected();
  useStore.getState().dispatchActionDialog();
});

test('lot navigation keeps the requested dialog pending until camera arrival', () => {
  const store = useStore.getState();
  store.dispatchLotSelected(100);
  store.dispatchActionDialog('CONSTRUCT', { lotId: 100 });
  expect(useStore.getState().lotCameraTransition).toBe(100);
  expect(useStore.getState().actionDialog.type).toBe('CONSTRUCT');
  store.dispatchLotCameraSettled(100);
  expect(useStore.getState().lotCameraTransition).toBeNull();
  expect(useStore.getState().actionDialog.type).toBe('CONSTRUCT');
});

test('completion of an earlier trip cannot release a later lot transition', () => {
  const store = useStore.getState();
  store.dispatchLotSelected(100);
  store.dispatchLotSelected(200);
  store.dispatchLotCameraSettled(100);
  expect(useStore.getState().lotCameraTransition).toBe(200);
  store.dispatchLotCameraSettled(200);
  expect(useStore.getState().lotCameraTransition).toBeNull();
});

test('recentering the same lot waits again and changing asteroid clears the trip', () => {
  const store = useStore.getState();
  store.dispatchLotSelected(100);
  store.dispatchLotCameraSettled(100);
  store.dispatchRecenterCamera(true);
  store.dispatchRecenterCamera();
  expect(useStore.getState().lotCameraTransition).toBe(100);
  store.dispatchOriginSelected(2);
  expect(useStore.getState().lotCameraTransition).toBeNull();
});
