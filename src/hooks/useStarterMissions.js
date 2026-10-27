import api from '~/lib/api';
import { starterMissionsQueryKey } from '~/lib/starterMissions';
import useMissionQuery from './useMissionQuery';

const useStarterMissions = (crewId, { subscribe = false } = {}) => useMissionQuery(crewId, {
  subscribe, queryKey: starterMissionsQueryKey, getSummary: api.getStarterMissions, room: 'Crew'
});
export default useStarterMissions;
