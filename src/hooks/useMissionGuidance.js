import { appConfig } from '~/appConfig';
import useCrewContext from '~/hooks/useCrewContext';
import useSession from '~/hooks/useSession';
import useStore from '~/hooks/useStore';
import { getMissionGuide } from '~/lib/missionGuidance';
import { getMissionScope } from '~/lib/missionObjectives';

export const useMissionScope = (campaign) => {
  const { crew } = useCrewContext();
  const { chainId } = useSession();
  return getMissionScope(chainId, appConfig.get('Api.influence'), crew?.id, campaign);
};

const useMissionGuidance = (campaign) => {
  const scope = useMissionScope(campaign);
  const dispatchGuidance = useStore(s => s.dispatchMissionGuidance);
  const setPreferences = useStore(s => s.dispatchObjectivePreferences);
  return (mission, objectiveIndex = 0) => {
    setPreferences(scope, { guidanceOffered: true });
    dispatchGuidance({ scope, topic: getMissionGuide(mission, objectiveIndex), missionId: mission.id, objectiveIndex });
  };
};

export default useMissionGuidance;
