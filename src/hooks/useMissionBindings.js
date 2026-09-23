import { useContext, useEffect } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { Entity } from '@influenceth/sdk';

import WebsocketContext from '~/contexts/WebsocketContext';
import useSession from '~/hooks/useSession';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';
import { appConfig } from '~/appConfig';
import api from '~/lib/api';
import { starterMissionsQueryKey } from '~/lib/starterMissions';
import { missionBindingKey } from '~/lib/missionBindings';

const useMissionBindings = (requests) => {
  const { chainId, token } = useSession();
  const simulation = useSimulationEnabled();
  const queryClient = useQueryClient();
  const { wsReady, registerMessageHandler, unregisterMessageHandler, registerConnectionHandler, unregisterConnectionHandler } = useContext(WebsocketContext);
  const enabled = !!token && !simulation;
  const apiUrl = appConfig.get('Api.influence');
  const queries = useQueries({ queries: requests.map(request => {
    const queryKey = missionBindingKey(chainId, apiUrl, request);
    return {
      queryKey,
      queryFn: async () => {
        const previous = queryClient.getQueryData(queryKey);
        const binding = await api.getMissionBinding(request);
        if (previous && (previous.status !== binding.status || previous.value !== binding.value || previous.reason !== binding.reason)) {
          queryClient.invalidateQueries({ queryKey: starterMissionsQueryKey(chainId, apiUrl, request.subject.id) });
        }
        return binding;
      },
      enabled,
      staleTime: 0,
      retry: false,
      // An idle processor can temporarily retain evidence while completion is indexed.
      refetchInterval: data => data?.status === 'matched' || data?.status === 'mismatched' ? false : 5000
    };
  }) });
  const subscriptionKey = JSON.stringify(requests.map(r => missionBindingKey(chainId, apiUrl, r)));
  useEffect(() => {
    if (!enabled || !wsReady || !requests.length) return;
    let timer;
    let dirty = false;
    const refresh = () => requests.forEach(request => {
      queryClient.invalidateQueries({ queryKey: missionBindingKey(chainId, apiUrl, request), exact: true });
    });
    const onMessage = ({ type }) => {
      if (/^(ComponentUpdated_(Mission|Crew|Building|Deposit|Extractor|Processor|Delivery)(_|$)|Mission)/.test(type)) {
        dirty = true;
        clearTimeout(timer);
        timer = setTimeout(refresh, 500);
      } else if (type === 'CURRENT_STARKNET_BLOCK_NUMBER' && dirty) {
        dirty = false;
        clearTimeout(timer);
        refresh();
      }
    };
    const rooms = new Set(requests.flatMap(r => [
      `Crew::${r.subject.id}`, `${Entity.TYPES[r.entity.label].label.toLowerCase().replace(/^./, c => c.toUpperCase())}::${r.entity.id}`
    ]));
    const subscriptions = [registerMessageHandler(onMessage), ...[...rooms].map(room => registerMessageHandler(onMessage, room))];
    const connection = registerConnectionHandler(connected => { if (connected) refresh(); });
    return () => {
      clearTimeout(timer);
      subscriptions.forEach(unregisterMessageHandler);
      unregisterConnectionHandler(connection);
    };
  // Requests are represented by their stable subscription identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptionKey, enabled, wsReady, chainId, apiUrl, queryClient, registerMessageHandler, unregisterMessageHandler, registerConnectionHandler, unregisterConnectionHandler]);
  return queries;
};

export default useMissionBindings;
