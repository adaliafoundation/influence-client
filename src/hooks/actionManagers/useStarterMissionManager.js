import { Address } from '@influenceth/sdk';

import useCrewContext from '~/hooks/useCrewContext';
import useSession from '~/hooks/useSession';
import useStarterMissions from '~/hooks/useStarterMissions';
import { getStarterMissionAssignment } from '~/lib/starterMissions';
import useMissionManager from './useMissionManager';

const useStarterMissionManager = () => {
  const { crew } = useCrewContext();
  const { accountAddress } = useSession();
  const query = useStarterMissions(crew?.id);
  const view = query.data;
  const canManage = !!(accountAddress && view?.recipient && Address.areEqual(accountAddress, view.recipient));

  return useMissionManager(query, canManage, getStarterMissionAssignment);
};

export default useStarterMissionManager;
