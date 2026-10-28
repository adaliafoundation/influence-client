import useSession from '~/hooks/useSession';
import useColonizationMissions from '~/hooks/useColonizationMissions';
import { canManageColony, getColonizationAssignment } from '~/lib/colonizationMissions';
import useMissionManager from './useMissionManager';

const useColonizationMissionManager = (asteroidId) => {
  const query = useColonizationMissions(asteroidId);
  const { accountAddress } = useSession();
  return useMissionManager(query, canManageColony(query.data, accountAddress), getColonizationAssignment);
};
export default useColonizationMissionManager;
