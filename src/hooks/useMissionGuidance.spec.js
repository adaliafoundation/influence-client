import { renderHook } from '@testing-library/react';
import useMissionGuidance, { useMissionScope } from './useMissionGuidance';
import useStore from '~/hooks/useStore';
import useSession from '~/hooks/useSession';

jest.mock('~/appConfig', () => ({ appConfig: { get: () => 'api' } }), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => () => ({ crew: { id: 99 } }), { virtual: true });
jest.mock('~/hooks/useSession', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useStore', () => jest.fn(), { virtual: true });
jest.mock('~/lib/missionGuidance', () => jest.requireActual('../lib/missionGuidance'), { virtual: true });
jest.mock('~/lib/missionObjectives', () => jest.requireActual('../lib/missionObjectives'), { virtual: true });

test('colony scope distinguishes asteroids from crews, networks, and other asteroids', () => {
  useSession.mockReturnValue({ chainId: 'sepolia' });
  const { result, rerender } = renderHook(({ subject }) => useMissionScope('123', subject), { initialProps: { subject: { label: 1, id: 99 } } });
  const asteroidScope = result.current;
  rerender({ subject: undefined });
  expect(result.current).not.toBe(asteroidScope);
  rerender({ subject: { label: 1, id: 100 } });
  expect(result.current).not.toBe(asteroidScope);
  useSession.mockReturnValue({ chainId: 'mainnet' });
  rerender({ subject: { label: 1, id: 99 } });
  expect(result.current).not.toBe(asteroidScope);
});

test('starting colony guidance preserves its subject and resolves the requested objective', () => {
  useSession.mockReturnValue({ chainId: 'sepolia' });
  const dispatch = jest.fn();
  useStore.mockImplementation(selector => selector({ dispatchMissionGuidance: dispatch, dispatchObjectivePreferences: jest.fn() }));
  const context = { kind: 'colonization', subject: { label: 1, id: '99' }, subjectName: 'My colony' };
  const { result } = renderHook(() => useMissionGuidance('123', context));
  result.current({ id: 3, key: 'ESTABLISH_COMMERCE' }, 1);
  expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ ...context, campaign: '123', topic: 'trade_at_marketplace', missionId: 3, objectiveIndex: 1 }));
});
