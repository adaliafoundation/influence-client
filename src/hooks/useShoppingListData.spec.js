import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import useShoppingListData from './useShoppingListData';
import useAsteroidBuildings from '~/hooks/useAsteroidBuildings';
import useShoppingListOrders from '~/hooks/useShoppingListOrders';
import api from '~/lib/api';

jest.mock('@influenceth/sdk', () => ({
  Asteroid: {}, Lot: {}, Entity: { IDS: { CREWMATE: 2 } }, Permission: { IDS: { BUY: 1, SELL: 2 } },
  Crew: { getAbilityBonus: () => ({ totalBonus: 1.5 }) }, Crewmate: { ABILITY_IDS: { MARKETPLACE_FEE_ENFORCEMENT: 1 } }
}));
jest.mock('~/hooks/useAsteroidBuildings', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useShoppingListOrders', () => jest.fn(), { virtual: true });
jest.mock('~/lib/api', () => ({ getCrewmatesOfCrews: jest.fn() }), { virtual: true });
jest.mock('~/lib/cacheKey', () => ({ entitiesCacheKey: (label, filter) => ['entities', label, filter] }), { virtual: true });
let client, buildings, orders;
const exchange = (id, crewId) => ({ id, Control: { controller: { id: crewId } } });
const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  buildings = { data: [exchange(1, 10), exchange(2, 20), exchange(3, 10)], isLoading: false, dataUpdatedAt: 1, refetch: jest.fn() };
  orders = { data: { 9: { 1: { orders: [], lotId: 1 } } }, isLoading: false, dataUpdatedAt: 1, refetch: jest.fn() };
  useAsteroidBuildings.mockImplementation(() => buildings);
  useShoppingListOrders.mockImplementation(() => orders);
  api.getCrewmatesOfCrews.mockResolvedValue([{ id: 100, Control: { controller: { id: 10 } } }]);
});
afterEach(() => client.clear());

test('render/timestamp changes and reordered exchanges cannot spawn duplicate in-flight fee requests', async () => {
  let resolve;
  api.getCrewmatesOfCrews.mockImplementation(() => new Promise(done => { resolve = done; }));
  const { result, rerender } = renderHook(() => useShoppingListData(1, 0, [9]), { wrapper });
  await waitFor(() => expect(api.getCrewmatesOfCrews).toHaveBeenCalledTimes(1));
  for (let index = 0; index < 25; index++) {
    buildings = { ...buildings, dataUpdatedAt: index + 2, data: [...buildings.data].reverse() };
    rerender();
  }
  expect(api.getCrewmatesOfCrews).toHaveBeenCalledTimes(1);
  expect(api.getCrewmatesOfCrews).toHaveBeenCalledWith([10, 20]);
  await act(async () => resolve([{ id: 100, Control: { controller: { id: 10 } } }]));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  rerender();
  expect(api.getCrewmatesOfCrews).toHaveBeenCalledTimes(1);
  expect(result.current.data[9][0].feeEnforcement).toBe(1.5);
  expect(orders.data[9][1]).not.toHaveProperty('marketplace');
});

test('buy and sell consumers share crew reads; changed controllers fetch the new crew set', async () => {
  const { result, rerender } = renderHook(() => [useShoppingListData(1, 0, [9], 'buy'), useShoppingListData(1, 0, [9], 'sell')], { wrapper });
  await waitFor(() => expect(result.current[0].isLoading).toBe(false));
  expect(api.getCrewmatesOfCrews).toHaveBeenCalledTimes(1);
  buildings = { ...buildings, data: [exchange(1, 30)] };
  rerender();
  await waitFor(() => expect(api.getCrewmatesOfCrews).toHaveBeenLastCalledWith([30]));
  expect(api.getCrewmatesOfCrews).toHaveBeenCalledTimes(2);
});

test('no exchanges means no fee request; explicit refresh includes current crew data', async () => {
  buildings = { ...buildings, data: [] };
  const { result, rerender } = renderHook(() => useShoppingListData(1, 0, [9]), { wrapper });
  expect(api.getCrewmatesOfCrews).not.toHaveBeenCalled();
  buildings = { ...buildings, data: [exchange(1, 10)] };
  rerender();
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  act(() => result.current.refetch());
  await waitFor(() => expect(api.getCrewmatesOfCrews).toHaveBeenCalledTimes(2));
  expect(buildings.refetch).toHaveBeenCalledTimes(1);
  expect(orders.refetch).toHaveBeenCalledTimes(1);
});
