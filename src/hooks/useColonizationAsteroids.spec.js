import { renderHook } from '@testing-library/react';
import { useQueries } from '@tanstack/react-query';
import useSession from '~/hooks/useSession';
import api from '~/lib/api';
import useColonizationAsteroids from './useColonizationAsteroids';

jest.mock('@tanstack/react-query', () => ({ useQueries: jest.fn() }));
jest.mock('~/appConfig', () => ({ appConfig: { get: () => 'api-url' } }), { virtual: true });
jest.mock('~/lib/api', () => ({ getColonizationMissions: jest.fn() }), { virtual: true });
jest.mock('~/lib/colonizationMissions', () => ({
  colonizationMissionsQueryKey: (chain, apiUrl, id) => ['colonizationMissions', chain, apiUrl, id]
}), { virtual: true });
jest.mock('~/hooks/useSession', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useSimulationEnabled', () => () => false, { virtual: true });

beforeEach(() => {
  useSession.mockReturnValue({ chainId: 'sepolia', token: 'token' });
  jest.clearAllMocks();
});

test('requests each asteroid and retains enrollable and already enrolled campaigns, including completed ones', async () => {
  const asteroids = ['1', '2', '3', '4'].map(id => ({ id }));
  useQueries.mockReturnValue([
    { data: { canEnroll: true, enrolled: false } },
    { data: { canEnroll: false, enrolled: true } },
    { data: { canEnroll: false, enrolled: false } },
    { data: { enrolled: true, missions: [{ claimed: true }] } }
  ]);
  const { result } = renderHook(() => useColonizationAsteroids(asteroids));
  expect(result.current.data.map(a => a.id)).toEqual(['1', '2', '4']);
  const { queries } = useQueries.mock.calls[0][0];
  expect(queries).toHaveLength(4);
  for (const [index, query] of queries.entries()) {
    expect(query.queryKey).toEqual(['colonizationMissions', 'sepolia', 'api-url', asteroids[index].id]);
    expect(query.enabled).toBe(true);
    await query.queryFn();
    expect(api.getColonizationMissions).toHaveBeenLastCalledWith(asteroids[index].id);
  }
});

test('keeps confirmed choices during partial loading or failure and retries failed requests', async () => {
  const retry = jest.fn();
  useQueries.mockReturnValue([{ data: { enrolled: true } }, { isLoading: true }, { isError: true, refetch: retry }]);
  const { result } = renderHook(() => useColonizationAsteroids([{ id: '1' }, { id: '2' }, { id: '3' }]));
  expect(result.current.data).toEqual([{ id: '1' }]);
  expect(result.current.isLoading).toBe(true);
  expect(result.current.isError).toBe(true);
  await result.current.refetch();
  expect(retry).toHaveBeenCalledTimes(1);
});

test('does not request eligibility without a session', () => {
  useSession.mockReturnValue({ chainId: 'sepolia' });
  useQueries.mockReturnValue([{ isLoading: true }]);
  const { result } = renderHook(() => useColonizationAsteroids([{ id: '1' }]));
  expect(useQueries.mock.calls[0][0].queries[0].enabled).toBe(false);
  expect(result.current.isLoading).toBe(false);
});
