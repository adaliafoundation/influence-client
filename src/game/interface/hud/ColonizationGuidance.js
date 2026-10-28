import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ColonizationMission } from '@influenceth/sdk';
import useStore from '~/hooks/useStore';
import useSession from '~/hooks/useSession';
import useCrewContext from '~/hooks/useCrewContext';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';
import useColonizationMissionManager from '~/hooks/actionManagers/useColonizationMissionManager';
import useMissionGuidance, { useMissionScope } from '~/hooks/useMissionGuidance';
import { colonizationPresentation } from '~/lib/colonizationMissions';
import { gameplayGuides } from '~/lib/missionGuidance';
import MissionDialog from '~/game/launcher/components/MissionDialog';
import GuidanceMessage from './GuidanceMessage';

const ColonizationGuidance = ({ context }) => {
  const manager = useColonizationMissionManager(context.subject.id);
  const scope = useMissionScope(context.campaign, context.subject);
  const startGuidance = useMissionGuidance(context.campaign, {
    kind: 'colonization', subject: context.subject, subjectName: context.subjectName
  });
  const guidance = useStore(s => s.missionGuidance);
  const details = useStore(s => s.missionDetails);
  const launcherPage = useStore(s => s.launcherPage);
  const interfaceHidden = useStore(s => s.graphics.hideInterface);
  const setGuidance = useStore(s => s.dispatchMissionGuidance);
  const setDetails = useStore(s => s.dispatchMissionDetails);
  const simulation = useSimulationEnabled();
  const { authenticated, blockTime } = useSession();
  const { crew } = useCrewContext();
  const changed = scope !== context.scope || (manager.data && manager.data.campaign !== context.campaign);
  useEffect(() => {
    if (changed || !authenticated) {
      setGuidance(null);
      setDetails(null);
    }
  }, [changed, authenticated, setGuidance, setDetails]);

  if (changed || !authenticated || simulation || interfaceHidden) return null;
  const view = manager.data?.active ? { ...manager.data, eligible: true } : {
    subject: context.subject, eligible: true, progress: { selectedBuildings: [] },
    missions: Object.values(ColonizationMission.TYPES)
  };
  const mission = view.missions.find(m => m.id === (details ? details.id : guidance?.missionId));
  if (!mission) return null;
  if (details) return createPortal(<MissionDialog mission={mission} view={view}
    presentation={colonizationPresentation} subjectName={context.subjectName}
    pending={manager.getPending(mission.id)} canManage={!!manager.data?.active && !manager.isError && manager.canManage}
    onAccept={manager.accept} onComplete={manager.complete}
    onGuide={index => startGuidance(mission, index)} onClose={() => setDetails(null)} />, document.body);
  if (launcherPage || !gameplayGuides[guidance?.topic]) return null;
  return <GuidanceMessage key={`${scope}:${guidance.topic}:${guidance.objectiveIndex}`}
    guidance={guidance} mission={mission} busy={crew?.Crew?.readyAt > blockTime}
    onClose={() => setGuidance(null)} onDetails={() => setDetails({
      kind: 'colonization', scope, campaign: context.campaign, subject: context.subject,
      subjectName: context.subjectName, id: mission.id
    })} />;
};

export default ColonizationGuidance;
