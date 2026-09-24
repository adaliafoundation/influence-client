const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const React = require('react');
const { renderHook, act } = require('@testing-library/react');
const { Entity } = require('@influenceth/sdk');
jest.mock('@tanstack/react-query', () => ({ useQueries: jest.fn(() => []), useQueryClient: jest.fn() }));
jest.mock('~/contexts/WebsocketContext', () => ({ __esModule: true, default: require('react').createContext() }), { virtual: true });
jest.mock('~/hooks/useSession', () => ({ __esModule: true, default: () => ({ chainId: 'sepolia', token: 'token' }) }), { virtual: true });
jest.mock('~/hooks/useSimulationEnabled', () => ({ __esModule: true, default: () => false }), { virtual: true });
jest.mock('~/appConfig', () => ({ appConfig: { get: () => 'api' } }), { virtual: true });
jest.mock('~/lib/api', () => ({ __esModule: true, default: { getMissionBinding: jest.fn() } }), { virtual: true });
jest.mock('~/lib/starterMissions', () => jest.requireActual('../lib/starterMissions'), { virtual: true });
jest.mock('~/lib/missionBindings', () => jest.requireActual('../lib/missionBindings'), { virtual: true });
const WebsocketContext = require('~/contexts/WebsocketContext').default;
const { useQueries, useQueryClient } = require('@tanstack/react-query');
const useMissionBindings = require('./useMissionBindings').default;
const request = { campaign: '123', subject: { label: Entity.IDS.CREW, id: '501' }, kind: 'Process', entity: { label: Entity.IDS.BUILDING, id: '999' }, slot: 2 };
const api = require('~/lib/api').default;
let socket, invalidateQueries, getQueryData;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  invalidateQueries = jest.fn();
  getQueryData = jest.fn();
  useQueryClient.mockReturnValue({ invalidateQueries, getQueryData });
  socket = { wsReady: true, registerMessageHandler: jest.fn((handler, room) => room || 'global'), unregisterMessageHandler: jest.fn(),
    registerConnectionHandler: jest.fn(() => 'connection'), unregisterConnectionHandler: jest.fn() };
});
afterEach(() => jest.useRealTimers());
const wrapper = ({ children }) => <WebsocketContext.Provider value={socket}>{children}</WebsocketContext.Provider>;

test('subscribes to the crew and target, reconciles component updates through catch-up, and cleans up', () => {
  const { unmount } = renderHook(() => useMissionBindings([request]), { wrapper });
  expect(socket.registerMessageHandler.mock.calls.map(call => call[1])).toEqual([undefined, 'Crew::501', 'Building::999']);
  const onMessage = socket.registerMessageHandler.mock.calls[0][0];
  act(() => { onMessage({ type: 'ComponentUpdated_Processor' }); jest.advanceTimersByTime(500); });
  expect(invalidateQueries).toHaveBeenCalledTimes(1);
  act(() => onMessage({ type: 'CURRENT_STARKNET_BLOCK_NUMBER' }));
  expect(invalidateQueries).toHaveBeenCalledTimes(2);
  unmount();
  expect(socket.unregisterMessageHandler).toHaveBeenCalledTimes(3);
  expect(socket.unregisterConnectionHandler).toHaveBeenCalledWith('connection');
});

test('polls unbound and unknown evidence without treating either as transaction failure', () => {
  renderHook(() => useMissionBindings([request]), { wrapper });
  const query = useQueries.mock.calls[0][0].queries[0];
  expect(query.queryKey).toEqual(['missionBindings', 'sepolia', 'api', '123', String(Entity.packEntity(request.subject)), 'Process', String(Entity.packEntity(request.entity)), 2]);
  expect(query.refetchInterval({ status: 'unknown' })).toBe(5000);
  expect(query.refetchInterval({ status: 'unbound' })).toBe(5000);
  expect(query.refetchInterval({ status: 'matched' })).toBe(false);
  expect(query.refetchInterval({ status: 'mismatched' })).toBe(false);
});


test('completion reconciliation refreshes starter progress even when socket updates were missed', async () => {
  getQueryData.mockReturnValue({ status: 'unknown', reason: 'processor_not_running', value: '123456789012345678901234567890' });
  const cleared = { status: 'unbound', reason: null, value: '0' };
  api.getMissionBinding.mockResolvedValue(cleared);
  renderHook(() => useMissionBindings([request]), { wrapper });
  const query = useQueries.mock.calls[0][0].queries[0];
  expect(await query.queryFn()).toBe(cleared);
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['starterMissions', 'sepolia', 'api', '501'] });
});

test('unchanged bindings do not repeatedly refetch starter progress', async () => {
  const matched = { status: 'matched', reason: null, value: '123456789012345678901234567890' };
  getQueryData.mockReturnValue(matched);
  api.getMissionBinding.mockResolvedValue(matched);
  renderHook(() => useMissionBindings([request]), { wrapper });
  await useQueries.mock.calls[0][0].queries[0].queryFn();
  expect(invalidateQueries).not.toHaveBeenCalled();
});

test('refresh invalidates the queried target rather than every campaign binding', () => {
  renderHook(() => useMissionBindings([request]), { wrapper });
  act(() => socket.registerConnectionHandler.mock.calls[0][0](true));
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: useQueries.mock.calls[0][0].queries[0].queryKey, exact: true });
});
