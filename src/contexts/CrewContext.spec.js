import React, { useContext, useMemo } from 'react';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CrewContext, { CrewProvider } from './CrewContext';
import useWalletCrews from '~/hooks/useWalletCrews';
import api from '~/lib/api';
import useStore from '~/hooks/useStore';

jest.mock('~/lib/actingCrewAuthorization', () => ({ recheckActingCrew: jest.fn() }), { virtual: true });
jest.mock('@influenceth/sdk', () => ({
  Crewmate: { ABILITY_IDS: {}, COLLECTION_IDS: {} }, Entity: { IDS: { CREW: 1, CREWMATE: 2 } }, RandomEvent: {},
}));
jest.mock('~/appConfig', () => ({ appConfig: { get: () => undefined } }), { virtual: true });
jest.mock('~/hooks/useAuthorizationService', () => () => ({}), { virtual: true });
jest.mock('~/hooks/useConstants', () => () => ({ data: { CREW_SCHEDULE_BUFFER: 10, TIME_ACCELERATION: 1 } }), { virtual: true });
jest.mock('~/hooks/useMissedBlockRecovery', () => () => {}, { virtual: true });
jest.mock('~/hooks/useEntity', () => () => ({}), { virtual: true });
jest.mock('~/hooks/useSession', () => () => ({ accountAddress: 'owner', authenticated: true, blockTime: 100, token: 'token' }), { virtual: true });
jest.mock('~/hooks/useSimulationState', () => () => null, { virtual: true });
jest.mock('~/hooks/useOwnedCrews', () => () => ({}), { virtual: true });
jest.mock('~/hooks/useWalletCrews', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useStore', () => {
  const state = { pendingTransactions: [], selectedCrewId: 1, dispatchCrewSelected: jest.fn() };
  return selector => selector(state);
}, { virtual: true });
jest.mock('~/lib/api', () => ({ getCrewmates: jest.fn(), getAccountCrewmates: jest.fn(), getEntityById: jest.fn() }), { virtual: true });
jest.mock('~/lib/utils', () => ({
  getCrewAbilityBonuses: () => ({}), locationsArrToObj: () => ({}), openAccessJSTime: 1000,
}), { virtual: true });
jest.mock('~/lib/cacheKey', () => ({ entitiesCacheKey: (label, filter) => ['entities', label, filter] }), { virtual: true });
jest.mock('~/simulation/simulationConfig', () => ({}), { virtual: true });

let client, rawCrew, context, minerCount;
const crewKey = ['entities', 1, { owner: 'owner' }];
const rosterKey = ['entities', 2, '10,11'];
const Probe = () => {
  const value = useContext(CrewContext);
  context = value;
  // Mirrors the action dialogs' memoized bonus calculation.
  minerCount = useMemo(() => value.crew._crewmates.filter(c => c.Crewmate.class === 2).length, [value.crew]);
  return null;
};
const tree = () => <QueryClientProvider client={client}><CrewProvider><Probe /></CrewProvider></QueryClientProvider>;
beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  rawCrew = Object.freeze({ id: 1, Location: { location: { id: 2, label: 5 } }, Crew: Object.freeze({ roster: [10, 11], lastFed: 0, readyAt: 0 }) });
  client.setQueryData(crewKey, [rawCrew]);
  client.setQueryData(rosterKey, [{ id: 10, Crewmate: { class: 1 } }, { id: 11, Crewmate: { class: 0 } }]);
  client.setQueryData(['entities', 2, { owner: 'owner' }], []);
  useWalletCrews.mockReturnValue({ data: [rawCrew], dataUpdatedAt: 1, isLoading: false });
});
afterEach(() => client.clear());

test('publishes a new selected crew when crewmate details change without a roster change', async () => {
  const { rerender } = render(tree());
  const previous = context.crew;
  expect(minerCount).toBe(0);
  await act(async () => {
    client.setQueryData(rosterKey, [{ id: 10, Crewmate: { class: 1 } }, { id: 11, Crewmate: { class: 2 } }]);
  });
  rerender(tree());
  expect(context.crew).not.toBe(previous);
  expect(minerCount).toBe(1);
  expect(useStore(s => s.dispatchCrewSelected)).not.toHaveBeenCalled();
  expect(previous._crewmates[1].Crewmate.class).toBe(0);
  expect(rawCrew._crewmates).toBeUndefined();
  expect(rawCrew.Crew.lastFed).toBe(0);
});

test('refreshReadyAt replaces cached state without mutating the previous snapshot or roster', async () => {
  render(tree());
  const previous = client.getQueryData(crewKey)[0];
  api.getEntityById.mockResolvedValue({ id: 1, Crew: { readyAt: 200, lastFed: 50, actionRound: 20 } });
  await act(async () => { await context.refreshReadyAt(); });
  const updated = client.getQueryData(crewKey)[0];
  expect(updated).not.toBe(previous);
  expect(updated.Crew.readyAt).toBe(200);
  expect(updated.Crew.roster).toEqual([10, 11]);
  expect(previous.Crew.readyAt).toBe(0);
  expect(previous.Crew.lastFed).toBe(0);
});
