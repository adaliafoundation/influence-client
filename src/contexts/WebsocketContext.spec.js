import { checkMaintenance, isMaintenanceActive, subscribeMaintenance } from '../lib/maintenance';
jest.mock('../lib/maintenance', () => ({ checkMaintenance: jest.fn(), isMaintenanceActive: jest.fn(), subscribeMaintenance: jest.fn(() => jest.fn()) }));
import React from 'react';
import { act, renderHook } from '@testing-library/react';
import WebsocketContext, { WebsocketProvider } from './WebsocketContext';
import { io } from 'socket.io-client';

jest.mock('socket.io-client', () => ({ io: jest.fn() }));
jest.mock('~/hooks/useSession', () => ({ __esModule: true, default: () => ({ token: 'test' }) }), { virtual: true });
jest.mock('~/appConfig', () => ({ appConfig: { get: () => 'https://api.test' } }), { virtual: true });
jest.mock('~/lib/debugFlags', () => ({ areWebsocketLogsEnabled: () => false }), { virtual: true });

beforeEach(() => subscribeMaintenance.mockReturnValue(jest.fn()));

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

test('checks unexpected disconnects and connection failures and reconnects after maintenance', () => {
  const handlers = {};
  const unsubscribe = jest.fn();
  subscribeMaintenance.mockReturnValue(unsubscribe);
  const socket = { onAny: jest.fn(), on: jest.fn((name, cb) => { handlers[name] = cb; }), connect: jest.fn(), disconnect: jest.fn(), off: jest.fn() };
  io.mockImplementation(() => socket);
  const { unmount } = renderHook(() => React.useContext(WebsocketContext), { wrapper: WebsocketProvider });
  act(() => { handlers.disconnect(); handlers.connect_error(); });
  expect(checkMaintenance).toHaveBeenCalledTimes(2);
  const changed = subscribeMaintenance.mock.calls.at(-1)[0];
  isMaintenanceActive.mockReturnValue(true);
  changed();
  expect(socket.connect).not.toHaveBeenCalled();
  isMaintenanceActive.mockReturnValue(false);
  changed();
  expect(socket.connect).toHaveBeenCalledTimes(1);
  unmount();
  expect(unsubscribe).toHaveBeenCalled();
  expect(socket.off).toHaveBeenCalledWith('disconnect');
});
