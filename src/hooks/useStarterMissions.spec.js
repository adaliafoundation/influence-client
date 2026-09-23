const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const React = require('react');
const { renderHook, act } = require('@testing-library/react');
jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn() }));
jest.mock('~/contexts/WebsocketContext', () => ({ __esModule: true, default: require('react').createContext() }), { virtual: true });
jest.mock('~/hooks/useSession', () => ({ __esModule: true, default: () => ({ chainId: 'sepolia', token: 'token' }) }), { virtual: true });
jest.mock('~/hooks/useSimulationEnabled', () => ({ __esModule: true, default: () => false }), { virtual: true });
jest.mock('~/appConfig', () => ({ appConfig: { get: () => 'api' } }), { virtual: true });
jest.mock('~/lib/api', () => ({ __esModule: true, default: { getStarterMissions: jest.fn() } }), { virtual: true });
jest.mock('~/lib/starterMissions', () => jest.requireActual('../lib/starterMissions'), { virtual: true });
const WebsocketContext = require('~/contexts/WebsocketContext').default;
const { useQuery } = require('@tanstack/react-query');
const useStarterMissions = require('./useStarterMissions').default;
let socket, refetch;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  refetch = jest.fn();
  useQuery.mockReturnValue({ refetch });
  socket = { wsReady: true, registerMessageHandler: jest.fn((handler, room) => room || 'global'), unregisterMessageHandler: jest.fn(),
    registerConnectionHandler: jest.fn(() => 'connection'), unregisterConnectionHandler: jest.fn() };
});
afterEach(() => jest.useRealTimers());
const wrapper = ({ children }) => <WebsocketContext.Provider value={socket}>{children}</WebsocketContext.Provider>;

test('dialog consumers share the query without duplicating the background subscription', () => {
  renderHook(() => useStarterMissions(501), { wrapper });
  expect(useQuery.mock.calls[0][0]).toMatchObject({ queryKey: ['starterMissions', 'sepolia', 'api', '501'], enabled: true });
  expect(socket.registerMessageHandler).not.toHaveBeenCalled();
});

test('the background subscriber switches crew rooms and refetches after reconnect and catch-up', () => {
  const { rerender, unmount } = renderHook(({ crewId }) => useStarterMissions(crewId, { subscribe: true }), { wrapper, initialProps: { crewId: 501 } });
  expect(socket.registerMessageHandler).toHaveBeenCalledWith(expect.any(Function), 'Crew::501');
  rerender({ crewId: 502 });
  expect(socket.unregisterMessageHandler.mock.calls.map(([id]) => id)).toContain('Crew::501');
  expect(socket.registerMessageHandler).toHaveBeenCalledWith(expect.any(Function), 'Crew::502');
  expect(useQuery).toHaveBeenLastCalledWith(expect.objectContaining({ queryKey: ['starterMissions', 'sepolia', 'api', '502'] }));
  act(() => socket.registerConnectionHandler.mock.calls[1][0](true));
  expect(refetch).toHaveBeenCalledTimes(1);
  const onMessage = socket.registerMessageHandler.mock.calls[2][0];
  act(() => { onMessage({ type: 'MissionCompleted' }); jest.advanceTimersByTime(500); });
  act(() => onMessage({ type: 'CURRENT_STARKNET_BLOCK_NUMBER' }));
  expect(refetch).toHaveBeenCalledTimes(3);
  unmount();
  expect(socket.unregisterMessageHandler.mock.calls.map(([id]) => id)).toContain('Crew::502');
});
