const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const React = require('react');
const { act, renderHook, waitFor } = require('@testing-library/react');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const { Entity } = require('@influenceth/sdk');
jest.mock('~/hooks/useCrewContext', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useSession', () => jest.fn(), { virtual: true });
jest.mock('~/lib/api', () => ({}), { virtual: true });
jest.mock('~/lib/shipEjectionEligibility', () => ({ ...jest.requireActual('../lib/shipEjectionEligibility'), loadShipEjectionEligibility: jest.fn() }), { virtual: true });
const useCrewContext = require('~/hooks/useCrewContext');
const useSession = require('~/hooks/useSession');
const { loadShipEjectionEligibility } = require('~/lib/shipEjectionEligibility');
const useShipEjectionEligibility = require('./useShipEjectionEligibility').default;
let client, ship;
const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  ship = { id: 9, Control: { controller: { id: 2 } }, Location: { location: { label: Entity.IDS.LOT, id: 1 } } };
  useCrewContext.mockReturnValue({ crew: { id: 1 } });
  useSession.mockReturnValue({ accountAddress: '0x123', blockTime: 100 });
  loadShipEjectionEligibility.mockReset().mockResolvedValue({ status: 'allowed', ship });
});
afterEach(() => client.clear());

test('pending policy checks stay checking, and invalidations refresh an open dialog', async () => {
  let resolve;
  loadShipEjectionEligibility.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
  const { result } = renderHook(() => useShipEjectionEligibility(ship), { wrapper });
  expect(result.current.eligibility.status).toBe('checking');
  await act(async () => resolve({ status: 'allowed', ship }));
  await waitFor(() => expect(result.current.eligibility.status).toBe('allowed'));
  loadShipEjectionEligibility.mockResolvedValue({ status: 'blocked', reason: 'Ship has permission to remain' });
  let finishRefresh;
  loadShipEjectionEligibility.mockImplementationOnce(() => new Promise((resolve) => { finishRefresh = resolve; }));
  act(() => { client.invalidateQueries({ queryKey: ['shipEjectionEligibility'] }); });
  await waitFor(() => expect(finishRefresh).toBeDefined());
  expect(result.current.eligibility.status).toBe('allowed');
  await act(async () => finishRefresh({ status: 'blocked' }));
  await waitFor(() => expect(result.current.eligibility.status).toBe('blocked'));
});

test('rechecks protection before submission instead of trusting the displayed result', async () => {
  const { result } = renderHook(() => useShipEjectionEligibility(ship), { wrapper });
  await waitFor(() => expect(result.current.eligibility.status).toBe('allowed'));
  loadShipEjectionEligibility.mockResolvedValue({ status: 'blocked' });
  expect((await result.current.recheck({ shipId: 9, crewId: 1 })).status).toBe('blocked');
});

test('changing selected crew during a pending recheck cannot authorize the old payload', async () => {
  const { result, rerender } = renderHook(() => useShipEjectionEligibility(ship), { wrapper });
  await waitFor(() => expect(result.current.eligibility.status).toBe('allowed'));
  let resolve;
  loadShipEjectionEligibility.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
  const pending = result.current.recheck({ shipId: 9, crewId: 1 });
  useCrewContext.mockReturnValue({ crew: { id: 3 } });
  rerender();
  resolve({ status: 'allowed', ship });
  expect((await pending).status).toBe('checking');
  expect((await result.current.recheck({ shipId: 9, crewId: 1 })).status).toBe('checking');
});

test('blocks defer checks until submission; controller and movement changes refresh eligibility', async () => {
  const { result, rerender } = renderHook(() => useShipEjectionEligibility(ship), { wrapper });
  await waitFor(() => expect(result.current.eligibility.status).toBe('allowed'));
  loadShipEjectionEligibility.mockResolvedValue({ status: 'blocked' });
  useSession.mockReturnValue({ accountAddress: '0x123', blockTime: 101 });
  rerender();
  expect(result.current.eligibility.status).toBe('allowed');
  expect(loadShipEjectionEligibility).toHaveBeenCalledTimes(1);
  expect((await result.current.recheck({ shipId: 9, crewId: 1 })).status).toBe('blocked');
  expect(loadShipEjectionEligibility.mock.calls.at(-1)[0].blockTime).toBe(101);
  loadShipEjectionEligibility.mockResolvedValue({ status: 'allowed' });
  ship = { ...ship, Control: { controller: { id: 3 } }, Location: { location: { label: Entity.IDS.BUILDING, id: 8 } } };
  rerender();
  await waitFor(() => expect(loadShipEjectionEligibility).toHaveBeenCalledTimes(3));
  await waitFor(() => expect(result.current.eligibility.status).toBe('allowed'));
});

test('failed reads remain checking', async () => {
  loadShipEjectionEligibility.mockRejectedValue(new Error('Unavailable'));
  const { result } = renderHook(() => useShipEjectionEligibility(ship), { wrapper });
  await waitFor(() => expect(loadShipEjectionEligibility).toHaveBeenCalled());
  expect(result.current.eligibility.status).toBe('checking');
});
