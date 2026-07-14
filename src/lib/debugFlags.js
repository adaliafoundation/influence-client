import { appConfig } from '~/appConfig';

const WEBSOCKET_LOGS_KEY = 'influence.debug.websocketLogs';

const debugStorage = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      // no-op: debug flags should never break runtime behavior
    }
  }
};

const areWebsocketLogsEnabled = () => (
  !!appConfig.get('App.enableDevTools') && debugStorage.get(WEBSOCKET_LOGS_KEY) === '1'
);

const setWebsocketLogsEnabled = (enabled) => {
  debugStorage.set(WEBSOCKET_LOGS_KEY, enabled ? '1' : '0');
};

export {
  areWebsocketLogsEnabled,
  setWebsocketLogsEnabled,
  WEBSOCKET_LOGS_KEY,
};
