import { act, renderHook } from '@testing-library/react';
import { Entity, Extractor, Lot, Prospecting } from '@influenceth/sdk';
import useSamplingEligibility from './useSamplingEligibility';
import api from '~/lib/api';

let mockOrigin, mockTarget, mockCan, mockRecheck;
const mockCrew = { id: 1, label: Entity.IDS.CREW };
jest.mock('~/hooks/useLot', () => (id) => ({ data: id === mockOrigin?.id ? mockOrigin : mockTarget, isLoading: false }), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => () => ({ crew: mockCrew,
  crewCan: mockCan, recheckAuthorization: mockRecheck }), { virtual: true });
jest.mock('~/lib/api', () => ({ getEntities: jest.fn() }), { virtual: true });
const input = { active: true, asteroidId: 1, originIndex: 10, selected: { lot: 11, depth: 0 } };
beforeEach(() => {
  mockOrigin = { id: Lot.toId(1, 10), label: Entity.IDS.LOT };
  mockTarget = { id: Lot.toId(1, 11), label: Entity.IDS.LOT, building: { Extractors: [] } };
  mockCan = jest.fn(() => true);
  mockRecheck = jest.fn(async () => ({ status: 'allowed' }));
  api.getEntities.mockResolvedValue([]);
});

it('checks permission only at the origin and rereads every extractor at the actual target', async () => {
  const { result } = renderHook(() => useSamplingEligibility(input));
  expect(result.current.disabledReason).toBeNull();
  api.getEntities.mockResolvedValue([{ Extractors: [
    { slot: 1, status: Extractor.STATUSES.IDLE },
    { slot: 2, status: Extractor.STATUSES.RUNNING, finishTime: 1 }
  ] }]);
  let reason;
  await act(async () => { reason = await result.current.recheck(); });
  expect(reason).toContain('RUNNING');
  expect(mockRecheck).toHaveBeenCalledWith('can', [mockCrew, mockOrigin, Prospecting.ORIGIN_PERMISSION], [mockCrew, mockOrigin]);
  expect(api.getEntities).toHaveBeenCalledWith({ label: Entity.IDS.BUILDING,
    match: { 'Location.locations.uuid': Entity.formatEntity({ id: mockTarget.id, label: Entity.IDS.LOT }).uuid } });
  expect(mockCan.mock.calls.every(([, target]) => target.id === mockOrigin.id)).toBe(true);
});

it('stops a revoked origin permission before checking the target or accepting a sample', async () => {
  const { result } = renderHook(() => useSamplingEligibility(input));
  mockRecheck.mockResolvedValue({ status: 'denied' });
  await expect(result.current.recheck()).resolves.toContain('starting lot');
  expect(api.getEntities).not.toHaveBeenCalled();
});
