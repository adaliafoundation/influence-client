import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import useWebsocket from './useWebsocket';
import api from '~/lib/api';
import { createMarketSubscriptions, marketSubscriptionsByClient } from '../lib/marketSubscriptions';

const subscriptions = marketSubscriptionsByClient;
const useMarketQuery = (options, scope) => {
  const client = useQueryClient();
  const socket = useWebsocket();
  const { registerMessageHandler, unregisterMessageHandler, registerConnectionHandler, unregisterConnectionHandler } = socket;
  const identity = JSON.stringify([options.queryKey, scope]);
  const enabled = options.enabled !== false && !!scope.asteroidId && socket.wsReady;
  useEffect(() => {
    if (!enabled) return undefined;
    if (!subscriptions.has(client)) subscriptions.set(client, createMarketSubscriptions({ client, socket: { registerMessageHandler, unregisterMessageHandler, registerConnectionHandler, unregisterConnectionHandler }, api }));
    const [key, currentScope] = JSON.parse(identity);
    return subscriptions.get(client).acquire(key, currentScope);
  }, [client, enabled, identity, registerMessageHandler, unregisterMessageHandler, registerConnectionHandler, unregisterConnectionHandler]);
  return useQuery(options);
};
export default useMarketQuery;
