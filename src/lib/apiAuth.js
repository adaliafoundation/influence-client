import useStore from '~/hooks/useStore';

export const getCurrentSessionToken = () => useStore.getState()?.currentSession?.token;

export const getApiAuthHeaders = (token = getCurrentSessionToken()) => (
  token ? { Authorization: `Bearer ${token}` } : {}
);
