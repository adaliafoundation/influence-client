import { useContext, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import WebsocketContext from '~/contexts/WebsocketContext';
import { appConfig } from '~/appConfig';
import useSession from '~/hooks/useSession';
import useStore from '~/hooks/useStore';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';
import { recoverQueries } from '../lib/queryRecovery';
import { canonicalEntityId, isMissionTransactionIndexed } from '~/lib/starterMissions';

const useMissionQuery = (subjectId, { subscribe = false, queryKey: makeQueryKey, getSummary, room, refetchInterval = false }) => {
  const queryClient = useQueryClient();
  const { chainId, token } = useSession();
  const simulationEnabled = useSimulationEnabled();
  const id = subjectId == null ? null : canonicalEntityId(subjectId);
  const { wsReady, registerMessageHandler, unregisterMessageHandler, registerConnectionHandler, unregisterConnectionHandler } = useContext(WebsocketContext);
  const enabled = !!(id && token && !simulationEnabled);
  const query = useQuery({
    queryKey: makeQueryKey(chainId, appConfig.get('Api.influence'), id),
    queryFn: () => getSummary(id),
    enabled,
    staleTime: 0,
    refetchInterval
  });
  const pendingTransactions = useStore(s => s.pendingTransactions);
  const completeTransaction = useStore(s => s.dispatchPendingTransactionComplete);
  useEffect(() => {
    pendingTransactions.forEach(tx => {
      if (isMissionTransactionIndexed(tx, query.data)) completeTransaction(tx.txHash);
    });
  }, [pendingTransactions, query.data, completeTransaction]);

  const { refetch } = query;
  useEffect(() => {
    if (!subscribe || !enabled || !wsReady) return;
    let timer;
    let dirty = false;
    const refresh = () => { dirty = false; refetch(); };
    const onMessage = ({ type, body }) => {
      if (type === 'MissionRewardClaimed') {
        queryClient.invalidateQueries({ queryKey: ['walletBalance', 'sway'] });
      }
      const relevant = ['ComponentUpdated_Mission', 'MissionAccepted', 'MissionCompleted', 'MissionRewardClaimed', 'ComponentUpdated_Crew', 'ComponentUpdated_Crew_V1', 'ComponentUpdated_Building', 'ComponentUpdated_Celestial', 'ComponentUpdated_Nft'].includes(type)
        || (type === 'ConstantRegistered' && ['STARTER_MISSION_CAMPAIGN', 'STARTER_MISSION_CUTOFF', 'COLONIZATION_CAMPAIGN'].includes(body?.event?.returnValues?.name));
      if (relevant) {
        dirty = true;
        clearTimeout(timer);
        // Keep dirty until catch-up, even if the debounced request sees a partial transaction.
        timer = setTimeout(() => refetch(), 500);
      } else if (type === 'CURRENT_STARKNET_BLOCK_NUMBER' && dirty) {
        clearTimeout(timer);
        refresh();
      }
    };
    const registrations = [registerMessageHandler(onMessage), registerMessageHandler(onMessage, `${room}::${id}`)];
    const connection = registerConnectionHandler((connected) => {
      if (connected) {
        dirty = false;
        clearTimeout(timer);
        recoverQueries(queryClient, { queryKey: makeQueryKey(chainId, appConfig.get('Api.influence'), id), exact: true });
      }
    });
    return () => {
      clearTimeout(timer);
      registrations.forEach(unregisterMessageHandler);
      unregisterConnectionHandler(connection);
    };
  }, [subscribe, enabled, id, chainId, room, makeQueryKey, wsReady, refetch, queryClient, registerMessageHandler, unregisterMessageHandler, registerConnectionHandler, unregisterConnectionHandler]);
  return query;
};

export default useMissionQuery;
