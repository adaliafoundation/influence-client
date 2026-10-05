import { renderHook } from '@testing-library/react';
import useActionCrew from './useActionCrew';
import useCrewContext from '~/hooks/useCrewContext';

jest.mock('@influenceth/sdk', () => ({ Crewmate: { ABILITY_IDS: {} } }));
jest.mock('~/hooks/useCrewContext', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useEntity', () => () => ({}), { virtual: true });
jest.mock('./useOwnedCrews', () => {
  const data = [{ id: 1 }, { id: 2 }];
  return () => ({ data });
});
jest.mock('~/lib/utils', () => ({ getCrewAbilityBonuses: () => ({}), locationsArrToObj: () => ({}) }), { virtual: true });

test('historical action crews do not rebuild on live crew ticks, but do update with action data', () => {
  const live = { id: 1, _timeAcceleration: 10, _ready: false };
  useCrewContext.mockReturnValue({ crew: live });
  const action = { startTime: 100, _cachedData: { crew: { id: 1, Crew: {}, Location: {} }, crewmates: [{ id: 10 }] } };
  const { result, rerender } = renderHook(({ current }) => useActionCrew(current), { initialProps: { current: action } });
  const previous = result.current;
  useCrewContext.mockReturnValue({ crew: { ...live, _ready: true } });
  rerender({ current: { ...action } });
  expect(result.current).toBe(previous);
  expect(result.current._now).toBe(100);

  const updated = { ...action, _cachedData: { ...action._cachedData, crewmates: [{ id: 11 }] } };
  rerender({ current: updated });
  expect(result.current._crewmates).toEqual([{ id: 11 }]);
  expect(previous._crewmates).toEqual([{ id: 10 }]);

  const nextLive = { ...live, _ready: true };
  useCrewContext.mockReturnValue({ crew: nextLive });
  rerender({ current: null });
  expect(result.current).toBe(nextLive);
});
