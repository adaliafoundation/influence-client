const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const { renderHook } = require('@testing-library/react');
jest.mock('@influenceth/sdk', () => ({
  Asteroid: { getLotDistance: jest.fn((asteroidId, sourceLotIndex, destinationLotIndex) => Math.abs(sourceLotIndex - destinationLotIndex)) },
  Entity: { IDS: { LOT: 1 } },
  Lot: { toIndex: id => Number(id || 0) }
}));
jest.mock('./useAccessibleAsteroidInventories', () => jest.fn());
jest.mock('~/hooks/useCrewContext', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useShip', () => jest.fn(), { virtual: true });

const { Asteroid, Entity } = require('@influenceth/sdk');
const useAccessibleAsteroidInventories = require('./useAccessibleAsteroidInventories');
const useCrewContext = require('~/hooks/useCrewContext');
const useShip = require('~/hooks/useShip');
const useClosestAccessibleInventory = require('./useClosestAccessibleInventory').default;

const inventoryEntity = (id, lotId, slot = 1) => ({
  id,
  label: 2,
  Location: { locations: [{ label: Entity.IDS.LOT, id: lotId }] },
  Inventories: [{ slot }]
});

beforeEach(() => {
  jest.clearAllMocks();
  Asteroid.getLotDistance.mockImplementation((asteroidId, sourceLotIndex, destinationLotIndex) => Math.abs(sourceLotIndex - destinationLotIndex));
  useCrewContext.mockReturnValue({ crew: { _location: {} } });
  useShip.mockReturnValue({ data: null, isLoading: false });
  useAccessibleAsteroidInventories.mockReturnValue({ data: [], checking: false, isLoading: false, isError: false });
});

test('selects the source with the shortest lot distance and requests only available product sources', () => {
  const farther = inventoryEntity(1, 30);
  const closest = inventoryEntity(2, 18, 3);
  useAccessibleAsteroidInventories.mockReturnValue({ data: [farther, closest], checking: false, isLoading: false, isError: false });

  const { result } = renderHook(() => useClosestAccessibleInventory(7, 175, { lotIndex: 20 }));

  expect(Asteroid.getLotDistance.mock.results.map(({ value }) => value)).toEqual([10, 2]);
  expect(result.current).toEqual({ id: 2, label: 2, lotIndex: 18, slot: 3 });
  expect(useAccessibleAsteroidInventories).toHaveBeenCalledWith(7, {
    isSourcing: true,
    itemIds: [175],
    productIds: [175],
    crewedShip: null
  });
});

test('returns null once discovery completes without an eligible product source', () => {
  const { result } = renderHook(() => useClosestAccessibleInventory(7, 175, { lotIndex: 20 }));

  expect(result.current).toBeNull();
});

test.each([
  ['inventory discovery', { checking: false, isLoading: true, isError: false }],
  ['permission checks', { checking: true, isLoading: false, isError: false }],
  ['failed discovery', { checking: false, isLoading: false, isError: true }]
])('does not choose a source while %s is unresolved', (label, status) => {
  useAccessibleAsteroidInventories.mockReturnValue({
    data: [inventoryEntity(1, 20)],
    ...status
  });

  const { result } = renderHook(() => useClosestAccessibleInventory(7, 175, { lotIndex: 20 }));

  expect(result.current).toBeUndefined();
});

test('uses the crewed ship as the source candidate for an orbiting destination', () => {
  const crewedShip = inventoryEntity(3, 0, 2);
  useCrewContext.mockReturnValue({ crew: { _location: { shipId: 3 } } });
  useShip.mockReturnValue({ data: crewedShip, isLoading: false });
  useAccessibleAsteroidInventories.mockReturnValue({ data: [crewedShip], checking: false, isLoading: false, isError: false });

  const { result } = renderHook(() => useClosestAccessibleInventory(7, 175, { lotIndex: 0, shipId: 3 }));

  expect(result.current).toEqual({ id: 3, label: 2, lotIndex: 0, slot: 2 });
  expect(useAccessibleAsteroidInventories).toHaveBeenCalledWith(null, expect.objectContaining({ crewedShip }));
});