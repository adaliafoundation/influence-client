const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const React = require('react');
const { renderHook, waitFor } = require('@testing-library/react');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const { Entity, Inventory } = require('@influenceth/sdk');
jest.mock('./useStore', () => selector => selector({ dispatchAlertLogged: jest.fn() }));
jest.mock('../lib/errorReporting', () => ({ reportFailure: jest.fn() }));
jest.mock('~/hooks/useCrewContext', () => jest.fn(), { virtual: true });
jest.mock('~/lib/api', () => ({ getAsteroidBuildingInventoryCandidates: jest.fn(), getAsteroidShipInventoryCandidates: jest.fn() }), { virtual: true });
jest.mock('~/lib/cacheKey', () => ({ entitiesCacheKey: (label, filters) => ['entities', label, filters] }), { virtual: true });
const api = require('~/lib/api');
const useCrewContext = require('~/hooks/useCrewContext');
const useInventories = require('./useAccessibleAsteroidInventories').default;
const type = Number(Object.keys(Inventory.TYPES).find(id => Number(id) > 0 && !Inventory.TYPES[id].productConstraints));
const entity = (id, contents = [{ product: 7, amount: 1 }]) => ({ id, label: Entity.IDS.BUILDING,
  Inventories: [{ inventoryType: type, status: Inventory.STATUSES.AVAILABLE, slot: 1, mass: 1, contents }] });
let authorize;
beforeEach(() => {
  jest.clearAllMocks();
  authorize = jest.fn(() => ({ status: 'allowed' }));
  useCrewContext.mockReturnValue({ crew: { id: 1, label: Entity.IDS.CREW }, authorize });
  api.getAsteroidBuildingInventoryCandidates.mockResolvedValue([]);
  api.getAsteroidShipInventoryCandidates.mockResolvedValue([]);
});
const setup = options => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useInventories(1, options), { wrapper });
};
test('fixed inventory selection never starts asteroid discovery', () => {
  const { result } = setup({ limitToPrimary: entity(1) });
  expect(result.current.data).toHaveLength(1);
  expect(result.current.isLoading).toBe(false);
  expect(api.getAsteroidBuildingInventoryCandidates).not.toHaveBeenCalled();
  expect(api.getAsteroidShipInventoryCandidates).not.toHaveBeenCalled();
});
test('irrelevant inventories never enter authorization and unresolved rows remain hidden', async () => {
  api.getAsteroidBuildingInventoryCandidates.mockResolvedValue([entity(1), entity(2, []), entity(3)]);
  authorize.mockImplementation((method, [, target]) => ({ status: target.id === 3 ? 'unresolved' : 'allowed' }));
  const { result } = setup({ isSourcing: true, productIds: [7] });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.data.map(e => e.id)).toEqual([1]);
  expect(result.current.checking).toBe(true);
  expect(authorize.mock.calls.some(([, args]) => args[1].id === 2)).toBe(false);
  expect(api.getAsteroidBuildingInventoryCandidates.mock.calls[0][1]).toMatchObject({ productIds: [7], isSourcing: true });
});
test('denied access is omitted without being mistaken for unresolved access', async () => {
  api.getAsteroidBuildingInventoryCandidates.mockResolvedValue([entity(1)]);
  authorize.mockReturnValue({ status: 'denied' });
  const { result } = setup({});
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.data).toEqual([]);
  expect(result.current.checking).toBe(false);
});

test('a large irrelevant inventory list does not fan out permission checks', async () => {
  api.getAsteroidBuildingInventoryCandidates.mockResolvedValue([
    ...Array.from({ length: 5000 }, (_, id) => entity(id + 10, [{ product: 8, amount: 1 }])), entity(1)
  ]);
  const { result } = setup({ isSourcing: true, productIds: [7] });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.data.map(e => e.id)).toEqual([1]);
  expect(new Set(authorize.mock.calls.map(([, args]) => args[1].id))).toEqual(new Set([1]));
});

test.each(['public-policy', 'account-grant', 'contract-policy'])('accessible foreign inventories remain eligible through %s', async reason => {
  api.getAsteroidBuildingInventoryCandidates.mockResolvedValue([entity(1)]);
  authorize.mockImplementation(method => ({ status: method === 'controls' ? 'denied' : 'allowed', reason }));
  const { result } = setup({ isSourcing: true, productIds: [7] });
  await waitFor(() => expect(result.current.data).toHaveLength(1));
  expect(result.current.data[0]._authorization.reason).toBe(reason);
});

test('controller-only selection skips access checks for known foreign inventories', async () => {
  api.getAsteroidBuildingInventoryCandidates.mockResolvedValue([entity(1)]);
  authorize.mockReturnValue({ status: 'denied' });
  const { result } = setup({ limitToControlled: true });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(authorize.mock.calls.every(([method]) => method === 'controls')).toBe(true);
});
