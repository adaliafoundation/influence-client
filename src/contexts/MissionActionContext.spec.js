const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const React = require('react');
const { renderHook, act } = require('@testing-library/react');
const { Entity } = require('@influenceth/sdk');

jest.mock('~/appConfig', () => ({ appConfig: { get: () => 'api' } }), { virtual: true });
jest.mock('~/hooks/useSession', () => ({ __esModule: true, default: jest.fn(() => ({ chainId: 'sepolia', token: 'token' })) }), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => ({ __esModule: true, default: jest.fn(() => ({ crew: { id: 501 }, pendingTransactions: [] })) }), { virtual: true });
jest.mock('~/hooks/useSimulationEnabled', () => ({ __esModule: true, default: jest.fn(() => false) }), { virtual: true });
jest.mock('~/hooks/useLot', () => ({ __esModule: true, default: () => ({ data: { building: { id: 999 } } }) }), { virtual: true });
jest.mock('~/hooks/useStore', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('~/hooks/useStarterMissions', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('~/hooks/useMissionBindings', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('~/lib/api', () => ({ __esModule: true, default: { getStarterMissions: jest.fn(), getMissionBinding: jest.fn() } }), { virtual: true });
jest.mock('~/lib/starterMissions', () => jest.requireActual('../lib/starterMissions'), { virtual: true });
jest.mock('~/lib/missionBindings', () => jest.requireActual('../lib/missionBindings'), { virtual: true });
const useStore = require('~/hooks/useStore').default;
const useStarterMissions = require('~/hooks/useStarterMissions').default;
const useMissionBindings = require('~/hooks/useMissionBindings').default;
const api = require('~/lib/api').default;
const useSimulationEnabled = require('~/hooks/useSimulationEnabled').default;
const useCrewContext = require('~/hooks/useCrewContext').default;
const useSession = require('~/hooks/useSession').default;
const { MissionActionProvider, useMissionAction, useMissionDeliveryTarget } = require('./MissionActionContext');
const subject = { label: Entity.IDS.CREW, id: '501' };
const building = { label: Entity.IDS.BUILDING, id: '999' };
const view = { active: true, eligible: true, campaign: '123', subject, missions: [{ id: 0, accepted: true, completed: true }, { id: 1, accepted: true }] };
const scope = JSON.stringify(['sepolia', 'api', '123', 501]);
let state;
beforeEach(() => {
  jest.clearAllMocks();
  useSimulationEnabled.mockReturnValue(false);
  useSession.mockReturnValue({ chainId: 'sepolia', token: 'token' });
  useCrewContext.mockReturnValue({ crew: { id: 501 }, pendingTransactions: [] });
  state = { asteroids: {}, missionParticipation: {}, dispatchMissionParticipation: jest.fn() };
  useStore.mockImplementation(selector => selector(state));
  useStarterMissions.mockReturnValue({ data: view, refetch: jest.fn() });
  useMissionBindings.mockReturnValue([]);
  api.getStarterMissions.mockResolvedValue(view);
  api.getMissionBinding.mockResolvedValue({ status: 'unbound' });
});
const setup = (type = 'PROCESS', params = { processorSlot: 2 }) => renderHook(() => useMissionAction(), {
  wrapper: ({ children }) => <MissionActionProvider type={type} params={params}>{children}</MissionActionProvider>
});

test('reopening a bound process restores campaign context and checks both bindings', async () => {
  useMissionBindings.mockReturnValue([{ data: { status: 'matched' } }, { data: { status: 'matched' } }]);
  api.getMissionBinding.mockResolvedValue({ status: 'matched' });
  const { result } = setup();
  expect(result.current.selected).toBe(true);
  expect(useMissionBindings.mock.calls[0][0].map(r => [r.kind, r.slot])).toEqual([['Process', 2], ['Built', undefined]]);
  let prepared;
  await act(async () => { prepared = await result.current.prepare('ProcessProductsFinish', { processor: building, processor_slot: 2 }, {}); });
  expect(prepared.missionAssignment).toEqual({ campaign: '123', subject, mission: 1 });
});

test.each(['unknown', 'mismatched'])('unavailable verification never falls back to native completion: %s', async status => {
  api.getMissionBinding.mockResolvedValue({ status, reason: 'processor_not_running' });
  const { result } = setup();
  let prepared;
  await act(async () => { prepared = await result.current.prepare('ProcessProductsFinish', { processor: building, processor_slot: 2 }, {}); });
  expect(prepared).toBeNull();
  expect(result.current.message).toBeTruthy();
});

test('a retained campaign choice survives unbound indexing responses', async () => {
  state.missionParticipation[scope] = true;
  const { result } = setup();
  let prepared;
  await act(async () => { prepared = await result.current.prepare('ProcessProductsFinish', { processor: building, processor_slot: 2 }, {}); });
  // Fresh submission verification will reject unbound; do not issue an ordinary action.
  expect(prepared.missionAssignment).toBeDefined();
});

test('an ordinary unbound action stays native when the player opts out', async () => {
  state.missionParticipation[scope] = false;
  const { result } = setup();
  const options = { usePaymaster: false };
  let prepared;
  await act(async () => { prepared = await result.current.prepare('ProcessProductsFinish', { processor: building, processor_slot: 2 }, options); });
  expect(prepared).toBe(options);
});

test('accepted missions default to checked without writing a preference', () => {
  const { result } = setup();
  expect(result.current.selected).toBe(true);
  expect(state.dispatchMissionParticipation).not.toHaveBeenCalled();
});

test('construction stays checked after landfall completes before the next mission is accepted', () => {
  useStarterMissions.mockReturnValue({ data: {
    ...view, missions: [{ id: 0, accepted: true, completed: true }, { id: 1, canAccept: true }]
  } });
  useMissionBindings.mockReturnValue([{ data: { status: 'unbound' } }]);
  const { result } = setup('CONSTRUCT', {});
  expect(result.current.selected).toBe(true);
});

test('explicit opt-out remains native even for a bound campaign asset', async () => {
  useMissionBindings.mockReturnValue([{ data: { status: 'matched' } }]);
  const { result, rerender } = setup();
  act(() => result.current.setSelected(false));
  expect(state.dispatchMissionParticipation).toHaveBeenCalledWith(scope, false);
  state.missionParticipation[scope] = false;
  rerender();
  expect(result.current.selected).toBe(false);
  const options = { usePaymaster: false };
  let prepared;
  await act(async () => { prepared = await result.current.prepare('ProcessProductsFinish', { processor: building, processor_slot: 2 }, options); });
  expect(prepared).toBe(options);
  expect(api.getMissionBinding).not.toHaveBeenCalled();
});

test('opted-in unsupported actions stop rather than silently dropping campaign credit', async () => {
  state.missionParticipation[scope] = true;
  const { result } = setup('FEED_CREW', {});
  let prepared;
  await act(async () => { prepared = await result.current.prepare('ResupplyFoodFromExchange', {}, {}); });
  expect(prepared).toBeNull();
  expect(result.current.message).toMatch(/does not support/);
});

test('the provider does not participate in unsupported dialogs', () => {
  const { result } = setup('MARKETPLACE_ORDER', {});
  expect(result.current).toBeNull();
  expect(useStarterMissions).not.toHaveBeenCalled();
});

test('changing campaigns before submission requires reopening the action', async () => {
  state.missionParticipation[scope] = true;
  api.getStarterMissions.mockResolvedValue({ ...view, campaign: '456' });
  const { result } = setup();
  let prepared;
  await act(async () => { prepared = await result.current.prepare('ProcessProductsStart', {}, {}); });
  expect(prepared).toBeNull();
  expect(result.current.message).toMatch(/campaign changed/);
});


test.each([
  { isLoading: true },
  { isError: true }
])('starter state must be available before any action can fall back to ordinary gameplay: %j', async query => {
  useStarterMissions.mockReturnValue({ ...query, refetch: jest.fn() });
  const { result } = setup();
  expect(result.current.ready).toBe(false);
  expect(result.current.visible).toBe(true);
  let prepared;
  await act(async () => { prepared = await result.current.prepare('ProcessProductsFinish', { processor: building, processor_slot: 2 }, {}); });
  expect(prepared).toBeNull();
  expect(api.getMissionBinding).not.toHaveBeenCalled();
});

test('completion indexing does not authorize another process action', async () => {
  state.missionParticipation[scope] = true;
  useMissionBindings.mockReturnValue([{ data: { status: 'unknown', reason: 'processor_not_running' } }, { data: { status: 'matched' } }]);
  api.getMissionBinding.mockResolvedValue({ status: 'unknown', reason: 'processor_not_running' });
  const { result } = setup();
  expect(result.current.unavailable).toBe(true);
  expect(result.current.message).toMatch(/completion is still being reconciled/);
  let prepared;
  await act(async () => { prepared = await result.current.prepare('ProcessProductsFinish', { processor: building, processor_slot: 2 }, {}); });
  expect(prepared).toBeNull();
});

test('closing the dialog cancels an in-flight preparation', async () => {
  state.missionParticipation[scope] = true;
  let resolve;
  api.getStarterMissions.mockReturnValue(new Promise(done => { resolve = done; }));
  const { result, unmount } = setup();
  let preparation;
  act(() => { preparation = result.current.prepare('ProcessProductsStart', {}, {}); });
  unmount();
  resolve(view);
  expect(await preparation).toBeNull();
});

test('switching crews does not submit the old crew’s pending preparation', async () => {
  state.missionParticipation[scope] = true;
  let resolve;
  api.getStarterMissions.mockReturnValue(new Promise(done => { resolve = done; }));
  const { result, rerender } = setup();
  let preparation;
  act(() => { preparation = result.current.prepare('ProcessProductsStart', {}, {}); });
  useCrewContext.mockReturnValue({ crew: { id: 502 }, pendingTransactions: [] });
  useStarterMissions.mockReturnValue({ isLoading: true });
  rerender();
  resolve(view);
  expect(await preparation).toBeNull();
  expect(result.current.ready).toBe(false);
});

test('simulation and signed-out dialogs preserve ordinary gameplay', () => {
  useSimulationEnabled.mockReturnValue(true);
  const simulation = setup();
  expect(simulation.result.current).toBeNull();
  simulation.unmount();
  useSimulationEnabled.mockReturnValue(false);
  useSession.mockReturnValue({ chainId: 'sepolia' });
  const signedOut = setup();
  expect(signedOut.result.current).toBeNull();
  expect(useStarterMissions).not.toHaveBeenCalled();
});

test('transaction-linked deliveries wait for their resolved entity before checking bindings', () => {
  const wrapper = ({ children }) => <MissionActionProvider type="SURFACE_TRANSFER" params={{ txHash: '0xabc' }}>{children}</MissionActionProvider>;
  const { result, rerender } = renderHook(({ deliveryId }) => {
    useMissionDeliveryTarget(deliveryId);
    return useMissionAction();
  }, { wrapper, initialProps: { deliveryId: null } });
  expect(result.current.ready).toBe(false);
  rerender({ deliveryId: 1234 });
  expect(result.current.ready).toBe(true);
  expect(useMissionBindings).toHaveBeenLastCalledWith([expect.objectContaining({ kind: 'Delivery', entity: { label: Entity.IDS.DELIVERY, id: 1234 } })]);
});
