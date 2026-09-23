import React from 'react';
import { act, renderHook } from '@testing-library/react';
import WebsocketContext, { WebsocketProvider } from './WebsocketContext';
import { io } from 'socket.io-client';

jest.mock('socket.io-client', () => ({ io: jest.fn() }));
jest.mock('~/hooks/useSession', () => ({ __esModule: true, default: () => ({ token: 'test' }) }), { virtual: true });
jest.mock('~/appConfig', () => ({ appConfig: { get: () => 'https://api.test' } }), { virtual: true });
jest.mock('~/lib/debugFlags', () => ({ areWebsocketLogsEnabled: () => false }), { virtual: true });

test('shared crew listeners leave only after the last subscriber and rejoin after reconnect', () => {
  const handlers = {};
  const socket = { onAny: jest.fn(), on: jest.fn((name, cb) => { handlers[name] = cb; }), emit: jest.fn(), disconnect: jest.fn(), off: jest.fn() };
  io.mockImplementation(() => socket);
  const { result, unmount } = renderHook(() => React.useContext(WebsocketContext), { wrapper: WebsocketProvider });
  let a; let b;
  act(() => { a = result.current.registerMessageHandler(() => {}, 'Crew::501'); b = result.current.registerMessageHandler(() => {}, 'Crew::501'); });
  expect(socket.emit).toHaveBeenCalledTimes(1);
  act(() => result.current.unregisterMessageHandler(a));
  expect(socket.emit).not.toHaveBeenCalledWith('leave-room-request', expect.anything());
  act(() => handlers.connect());
  expect(socket.emit).toHaveBeenLastCalledWith('join-room-request', { type: 'Crew', id: '501' });
  act(() => result.current.unregisterMessageHandler(b));
  expect(socket.emit).toHaveBeenLastCalledWith('leave-room-request', { type: 'Crew', id: '501' });
  unmount();
});
