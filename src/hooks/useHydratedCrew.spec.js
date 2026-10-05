import { renderHook } from '@testing-library/react';
import useHydratedCrew from './useHydratedCrew';
import useBlockTime from '~/hooks/useBlockTime';
import useCrew from '~/hooks/useCrew';
import useCrewmates from '~/hooks/useCrewmates';

jest.mock('@influenceth/sdk', () => ({ Crewmate: { ABILITY_IDS: {} } }));
jest.mock('~/hooks/useBlockTime', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useCrew', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useCrewmates', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useConstants', () => () => ({ data: 10 }), { virtual: true });
jest.mock('~/hooks/useOwnedCrews', () => {
  const data = [{ id: 1 }];
  return () => ({ data });
}, { virtual: true });
jest.mock('~/lib/utils', () => ({ getCrewAbilityBonuses: () => ({}), locationsArrToObj: () => ({}) }), { virtual: true });

test('foreign crew roster references survive clock updates and refresh when crewmate data changes', () => {
  useCrew.mockReturnValue({ data: { id: 1, Crew: { readyAt: 200 }, Location: {} } });
  useCrewmates.mockReturnValue({ data: [{ id: 10, Crewmate: { class: 1 } }] });
  useBlockTime.mockReturnValue(100);
  const { result, rerender } = renderHook(() => useHydratedCrew(1));
  const previous = result.current.data;
  useBlockTime.mockReturnValue(200);
  rerender();
  expect(result.current.data._crewmates).toBe(previous._crewmates);
  expect(result.current.data._ready).toBe(true);
  expect(previous._ready).toBe(false);

  useCrewmates.mockReturnValue({ data: [{ id: 10, Crewmate: { class: 2 } }] });
  rerender();
  expect(result.current.data._crewmates[0].Crewmate.class).toBe(2);
  expect(previous._crewmates[0].Crewmate.class).toBe(1);
});
