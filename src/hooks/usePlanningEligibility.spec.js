import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import usePlanningEligibility from './usePlanningEligibility';
import useCrewContext from '~/hooks/useCrewContext';
import useSession from '~/hooks/useSession';
import { loadPlanningEligibility } from '~/lib/planningEligibility';

jest.mock('~/hooks/useCrewContext', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useSession', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useConstants', () => () => ({ data: 0 }), { virtual: true });
jest.mock('~/lib/api', () => ({}), { virtual: true });
jest.mock('~/lib/planningEligibility', () => ({
  checkingPlanning: { status: 'checking', reason: 'Checking USE_LOT permission' },
  loadPlanningEligibility: jest.fn()
}), { virtual: true });

let client, lot;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  lot = { id: 1, _permissionTargets: { lot: { UseLot: { tenant: null } }, asteroid: {} } };
  useCrewContext.mockReturnValue({ crew: { id: 1 } });
  useSession.mockReturnValue({ blockTime: 100, accountAddress: '0x123' });
  loadPlanningEligibility.mockReset().mockResolvedValue({ status: 'allowed', reason: null });
});
afterEach(() => client.clear());
const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

test('pending policy checks disable planning and refresh on invalidation while open', async () => {
  let resolve;
  loadPlanningEligibility.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
  const { result } = renderHook(() => usePlanningEligibility(lot), { wrapper });
  expect(result.current.eligibility.status).toBe('checking');
  await act(async () => resolve({ status: 'allowed', reason: null }));
  await waitFor(() => expect(result.current.eligibility.status).toBe('allowed'));
  loadPlanningEligibility.mockResolvedValue({ status: 'blocked', reason: 'USE_LOT permission required' });
  let finishRefresh;
  loadPlanningEligibility.mockImplementationOnce(() => new Promise((resolve) => { finishRefresh = resolve; }));
  act(() => { client.invalidateQueries({ queryKey: ['planningEligibility'] }); });
  await waitFor(() => expect(finishRefresh).toBeDefined());
  expect(result.current.eligibility.status).toBe('allowed');
  await act(async () => finishRefresh({ status: 'blocked' }));
  await waitFor(() => expect(result.current.eligibility.status).toBe('blocked'));
});

test('submission bypasses the displayed snapshot and catches revoked grants', async () => {
  const { result } = renderHook(() => usePlanningEligibility(lot), { wrapper });
  await waitFor(() => expect(result.current.eligibility.status).toBe('allowed'));
  loadPlanningEligibility.mockResolvedValue({ status: 'blocked', reason: 'USE_LOT permission required' });
  const outcome = await result.current.recheck({ lotId: 1, crewId: 1 });
  expect(outcome.status).toBe('blocked');
  expect(loadPlanningEligibility.mock.calls.at(-1)[0]).not.toHaveProperty('snapshot');
});

test('crew changes during submission cannot authorize the old payload', async () => {
  const { result, rerender } = renderHook(() => usePlanningEligibility(lot), { wrapper });
  await waitFor(() => expect(result.current.eligibility.status).toBe('allowed'));
  let resolve;
  loadPlanningEligibility.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
  const pending = result.current.recheck({ lotId: 1, crewId: 1 });
  useCrewContext.mockReturnValue({ crew: { id: 2 } });
  rerender();
  resolve({ status: 'allowed' });
  expect((await pending).status).toBe('checking');
  expect((await result.current.recheck({ lotId: 1, crewId: 1 })).status).toBe('checking');
});

test('block updates preserve display and defer expiry checks until submission', async () => {
  const { result, rerender } = renderHook(() => usePlanningEligibility(lot), { wrapper });
  await waitFor(() => expect(result.current.eligibility.status).toBe('allowed'));
  loadPlanningEligibility.mockResolvedValue({ status: 'blocked', reason: 'USE_LOT permission required' });
  useSession.mockReturnValue({ blockTime: 101, accountAddress: '0x123' });
  rerender();
  expect(result.current.eligibility.status).toBe('allowed');
  expect(loadPlanningEligibility).toHaveBeenCalledTimes(1);
  expect((await result.current.recheck({ lotId: 1, crewId: 1 })).status).toBe('blocked');
  expect(loadPlanningEligibility.mock.calls.at(-1)[0].blockTime).toBe(101);
});


test('asteroid permission changes recompute the open dialog', async () => {
  const { result, rerender } = renderHook(() => usePlanningEligibility(lot), { wrapper });
  await waitFor(() => expect(result.current.eligibility.status).toBe('allowed'));
  loadPlanningEligibility.mockResolvedValue({ status: 'blocked', reason: 'USE_LOT permission required' });
  lot = { ...lot, _permissionTargets: { ...lot._permissionTargets, asteroid: { PublicPolicies: [] } } };
  rerender();
  await waitFor(() => expect(result.current.eligibility.status).toBe('blocked'));
});

test('tutorial rechecks use mock state rather than live crew and lot reads', async () => {
  useCrewContext.mockReturnValue({ crew: { id: 1, _isSimulation: true } });
  const { result } = renderHook(() => usePlanningEligibility(lot), { wrapper });
  await waitFor(() => expect(result.current.eligibility.status).toBe('allowed'));
  await result.current.recheck({ lotId: 1, crewId: 1 });
  expect(loadPlanningEligibility.mock.calls.at(-1)[0].snapshot.lot).toEqual(lot._permissionTargets.lot);
});
