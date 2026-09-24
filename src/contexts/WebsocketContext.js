import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

import { appConfig } from '~/appConfig';
import useSession from '~/hooks/useSession';
import { areWebsocketLogsEnabled } from '~/lib/debugFlags';

const WebsocketContext = createContext();

const DEFAULT_ROOM = '_';

let wsUuid = 1;

// NOTE: could maybe roll this back into ActivitiesContext if there was a reason to combine them
export function WebsocketProvider({ children }) {
  const { token } = useSession();

  const socket = useRef();
  const connectionHandlers = useRef({});
  const messageHandlers = useRef({});

  const [wsReady, setWsReady] = useState(false);

  const handleMessage = useCallback((messageLabel, payload) => {
    // for consistency, set type from messageLabel if not set
    if (messageLabel && !payload.type) payload.type = messageLabel;

    // NOTES:
    // - messageLabel can be "event" or "NameChanged" or anything... we do not use the value currently
    // - payload also contains type, most of which are ignored (i.e. CURRENT_STARKNET_BLOCK_NUMBER, ActionItem, etc.)
    // - for all but CURRENT_STARKNET_BLOCK_NUMBER, body contains { event }
    const { type, body, room, ...others } = payload;

    // shape ws emitted activity-events to look like activities (id will not be correct, but nbd)
    // (skip any messages that are not activities)
    if (body?.event && !body.id) {
      body.id = body.event.id;
    }

    const roomKey = (room || '').includes('::') ? room : DEFAULT_ROOM;
    Object.values(messageHandlers.current).forEach((handler) => {
      if (handler.room === roomKey) {
        if (areWebsocketLogsEnabled()) console.log('handleMessage', roomKey, { type, body, ...others });
        handler.callback({ type, body, ...others });
      }
    });
  }, []);

  const handleConnection = useCallback((isConnected) => {
    Object.values(connectionHandlers.current).forEach((callback) => callback(isConnected));
  }, []);

  const registerMessageHandler = useCallback((callback, room = null) => {
    if (!socket.current) return;

    const regId = wsUuid++;
    if (room) {
      const [type, id] = room.split('::');
      if (type && id) {
        if (!Object.values(messageHandlers.current).some((handler) => handler.room === room)) {
          socket.current.emit('join-room-request', { type, id });
        }
        messageHandlers.current[regId] = { room, callback };
      } else {
        console.error('Invalid websocket room! (join)', room);
      }
    } else {
      messageHandlers.current[regId] = { room: DEFAULT_ROOM, callback };
    }
    return regId;
  }, []);

  const unregisterMessageHandler = useCallback((regId) => {
    if (!socket.current) return;
    const handler = messageHandlers.current[regId];
    if (handler) {
      delete messageHandlers.current[regId];
      if (handler.room !== DEFAULT_ROOM && !Object.values(messageHandlers.current).some((other) => other.room === handler.room)) {
        const [type, id] = handler.room.split('::');
        if (type && id) {
          socket.current.emit('leave-room-request', { type, id });
        }
      }
      delete messageHandlers.current[regId];
    }
  }, []);

  const registerConnectionHandler = useCallback((callback) => {
    const regId = wsUuid++;
    connectionHandlers.current[regId] = callback;
    return regId;
  }, []);

  const unregisterConnectionHandler = useCallback((regId) => {
    delete connectionHandlers.current[regId];
  }, []);

  useEffect(() => {
    const config = {};
    config.transports = [ 'websocket' ];
    if (token) config.query = `token=${token}`;

    socket.current = new io(appConfig.get('Api.influence'), config);
    socket.current.onAny(handleMessage);
    socket.current.on('connect', () => {
      new Set(Object.values(messageHandlers.current).map((handler) => handler.room)).forEach((room) => {
        if (room === DEFAULT_ROOM) return;
        const [type, id] = room.split('::');
        socket.current.emit('join-room-request', { type, id });
      });
      handleConnection(true);
    });
    socket.current.on('disconnect', () => handleConnection(false));
    setWsReady(true);

    return () => {
      if (socket.current) {
        console.log('disconnect socket');
        socket.current.disconnect();
        socket.current.off(); // removes all listeners for all events
      }
      setWsReady(false);
    }
  }, [token]);

  const emitMessage = useCallback(async (eventName, eventArgs, timeout = 5000) => {
    try {
      if (!socket.current) throw new Error('no websocket connection');
      return await socket.current?.timeout(timeout).emitWithAck(eventName, eventArgs);
    } catch (e) {
      console.warn(e);
    }
  }, []);

  return (
    <WebsocketContext.Provider value={{
      emitMessage,
      registerMessageHandler,
      unregisterMessageHandler,
      registerConnectionHandler,
      unregisterConnectionHandler,
      wsReady
    }}>
      {children}
    </WebsocketContext.Provider>
  );
}

export default WebsocketContext;
