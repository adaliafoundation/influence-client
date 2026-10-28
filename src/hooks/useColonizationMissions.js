import api from '~/lib/api';
import { colonizationMissionsQueryKey } from '~/lib/colonizationMissions';
import useMissionQuery from './useMissionQuery';

const useColonizationMissions = asteroidId => useMissionQuery(asteroidId, {
  subscribe: true, queryKey: colonizationMissionsQueryKey, getSummary: api.getColonizationMissions,
  room: 'Asteroid', refetchInterval: 15000
});
export default useColonizationMissions;
