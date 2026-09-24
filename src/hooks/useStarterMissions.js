import { useContext, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import WebsocketContext from '~/contexts/WebsocketContext';
import { appConfig } from '~/appConfig';
import useSession from '~/hooks/useSession';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';
import api from '~/lib/api';
import { canonicalCrewId, starterMissionsQueryKey } from '~/lib/starterMissions';

const useStarterMissions = (crewId, { subscribe = false } = {}) => {
  const queryClient = useQueryClient();
  const { chainId, token } = useSession();
  const simulationEnabled = useSimulationEnabled();
  const id = crewId == null ? null : canonicalCrewId(crewId);
  const { wsReady, registerMessageHandler, unregisterMessageHandler, registerConnectionHandler, unregisterConnectionHandler } = useContext(WebsocketContext);
  const enabled = !!(id && token && !simulationEnabled);
  const query = useQuery({
    queryKey: starterMissionsQueryKey(chainId, appConfig.get('Api.influence'), id),
    queryFn: () => api.getStarterMissions(id),
    enabled,
    staleTime: 0
  });
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
      const relevant = ['ComponentUpdated_Mission', 'MissionAccepted', 'MissionCompleted', 'MissionRewardClaimed', 'ComponentUpdated_Crew', 'ComponentUpdated_Crew_V1'].includes(type)
        || (type === 'ConstantRegistered' && ['STARTER_MISSION_CAMPAIGN', 'STARTER_MISSION_CUTOFF'].includes(body?.event?.returnValues?.name));
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
    const registrations = [registerMessageHandler(onMessage), registerMessageHandler(onMessage, `Crew::${id}`)];
    const connection = registerConnectionHandler((connected) => { if (connected) refresh(); });
    return () => {
      clearTimeout(timer);
      registrations.forEach(unregisterMessageHandler);
      unregisterConnectionHandler(connection);
    };
  }, [subscribe, enabled, id, wsReady, refetch, queryClient, registerMessageHandler, unregisterMessageHandler, registerConnectionHandler, unregisterConnectionHandler]);
  return query;
};

export default useStarterMissions;
