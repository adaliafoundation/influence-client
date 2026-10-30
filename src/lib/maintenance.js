import axios from 'axios';
import { appConfig } from '~/appConfig';

const listeners = new Set();
let active = false;
let pending;
let pollTimer;

export const isMaintenanceActive = () => active;
export const subscribeMaintenance = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const checkStatus = () => {
  if (pending) return pending;
  // Use a separate request so maintenance failures cannot trigger the API interceptor.
  pending = axios.get('/maintenance', {
    baseURL: appConfig.get('Api.influence'),
    timeout: 10000
  }).then(({ data }) => {
    if (typeof data?.active !== 'boolean' || data.active === active) return;
    active = data.active;
    listeners.forEach(listener => listener());
  }).catch(() => {
    // An unreachable endpoint does not establish or clear maintenance.
  }).finally(() => {
    pending = undefined;
    if (active) pollTimer = setTimeout(() => {
      pollTimer = undefined;
      checkStatus();
    }, 60000);
  });
  return pending;
};

export const checkMaintenance = () => {
  if (active || pollTimer) return;
  return checkStatus();
};

