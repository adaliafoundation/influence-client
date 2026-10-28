import { useQuery } from '@tanstack/react-query';
import { appConfig } from '~/appConfig';
import api from '~/lib/api';
import useSession from '~/hooks/useSession';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';

const campaigns = [
  { key: 'starter', constant: 'STARTER_MISSION_CAMPAIGN', missionCount: 8 },
  { key: 'colonization', constant: 'COLONIZATION_CAMPAIGN', missionCount: 5 }
];

const useMissionCampaigns = () => {
  const { chainId, token } = useSession();
  const simulation = useSimulationEnabled();
  return useQuery({
    queryKey: ['missionCampaigns', chainId, appConfig.get('Api.influence')],
    enabled: !!token && !simulation,
    staleTime: 0,
    queryFn: async () => {
      const constants = await api.getConstants([...campaigns.map(c => c.constant), 'STARTER_MISSION_CUTOFF']);
      const entries = await Promise.all(campaigns.map(async ({ key, constant, missionCount }) => {
        const id = constants[constant];
        if (!id || BigInt(id) === 0n) return [key, false];
        const definition = await api.getMissionCampaign(id);
        const active = definition?.missionCount === missionCount
          && (key !== 'starter' || constants.STARTER_MISSION_CUTOFF != null);
        return [key, active];
      }));
      return Object.fromEntries(entries);
    }
  });
};

export default useMissionCampaigns;
