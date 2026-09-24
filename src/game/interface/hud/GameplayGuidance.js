import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useStore from '~/hooks/useStore';
import useCrewContext from '~/hooks/useCrewContext';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';
import useSession from '~/hooks/useSession';
import useStarterMissionManager from '~/hooks/actionManagers/useStarterMissionManager';
import useMissionGuidance, { useMissionScope } from '~/hooks/useMissionGuidance';
import { gameplayGuides, campaignGuidance, waitingGuidance } from '~/lib/missionGuidance';
import { getMissionObjectives } from '~/lib/missionPresentation';
import MissionDialog from '~/game/launcher/components/MissionDialog';
import TutorialMessage from './TutorialMessage';

const GuidanceMessage = ({ guidance, mission, view, onClose, onDetails, busy }) => {
  const [page, setPage] = useState(0);
  const messageRef = useRef();
  const topic = gameplayGuides[guidance.topic];
  const actionDialog = useStore(s => s.actionDialog);
  const dispatchCoachmarks = useStore(s => s.dispatchCoachmarks);
  const requirement = mission && getMissionObjectives(mission, view.progress)[guidance.objectiveIndex];
  const pages = [
    ...(mission ? [<>{campaignGuidance}<br /><br /><strong>{requirement?.label}</strong></>] : []),
    ...topic.pages,
    ...(mission?.key === 'CLOSE_THE_PRODUCTION_LOOP'
      ? ['[DRAFT] Choose an approved route in Mission details. Market orders do not qualify; use or complete a delivery of the final output. [DRAFT]'] : []),
    ...(busy ? [<span role="status">{waitingGuidance}</span>] : [])
  ];
  const visiblePage = Math.min(page, pages.length - 1);

  useEffect(() => {
    const previous = document.activeElement;
    messageRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);

  useEffect(() => {
    // Existing registered controls determine which highlights can be displayed.
    // No asset IDs or selection actions are supplied by guidance.
    const highlight = topic.highlights[visiblePage - (mission ? 1 : 0)];
    dispatchCoachmarks(busy || actionDialog?.type || !highlight ? {} : { [highlight]: true });
    return () => dispatchCoachmarks({});
  }, [topic, visiblePage, mission, busy, actionDialog?.type, dispatchCoachmarks]);

  return <TutorialMessage
    messageHeight={225}
    messageRef={messageRef}
    role="region"
    aria-label={topic.title}
    tabIndex={-1}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    }}
    crewmateId={6877}
    isIn
    onClose={onClose}
    step={{ title: topic.title, content: <>
      {pages[visiblePage]}
    </> }}
    leftButton={visiblePage > 0 ? { children: 'Back', onClick: () => setPage(visiblePage - 1) }
      : mission ? { children: 'Mission details', onClick: onDetails } : undefined}
    rightButton={visiblePage < pages.length - 1
      ? { children: 'Next', onClick: () => setPage(visiblePage + 1) }
      : { children: 'Close', onClick: onClose }} />;
};

const GameplayGuidance = () => {
  const manager = useStarterMissionManager();
  const view = manager.data;
  const scope = useMissionScope(view?.campaign);
  const generalScope = useMissionScope();
  const startGuidance = useMissionGuidance(view?.campaign);
  const simulation = useSimulationEnabled();
  const { authenticated, blockTime } = useSession();
  const { crew } = useCrewContext();
  const guidance = useStore(s => s.missionGuidance);
  const details = useStore(s => s.missionDetails);
  const preferences = useStore(s => s.objectivePreferences[scope]);
  const launcherPage = useStore(s => s.launcherPage);
  const interfaceHidden = useStore(s => s.graphics.hideInterface);
  const actionDialog = useStore(s => s.actionDialog);
  const setGuidance = useStore(s => s.dispatchMissionGuidance);
  const setDetails = useStore(s => s.dispatchMissionDetails);
  const setPreferences = useStore(s => s.dispatchObjectivePreferences);

  useEffect(() => {
    if (guidance && guidance.scope !== (guidance.missionId == null ? generalScope : scope)) setGuidance(null);
    if (details && details.scope !== scope) setDetails(null);
  }, [scope, generalScope, guidance, details, setGuidance, setDetails]);

  if (simulation || interfaceHidden) return null;
  const mission = guidance?.scope === scope && view?.missions.find(m => m.id === guidance.missionId);
  const selected = details?.scope === scope && view?.missions.find(m => m.id === details.id);
  const first = view?.missions[0];
  const offer = authenticated && view?.eligible && first?.accepted && !first.completed && !preferences?.guidanceOffered;
  const closeOffer = () => setPreferences(scope, { guidanceOffered: true });

  if (selected) return createPortal(<MissionDialog key={`${scope}:${selected.id}`} mission={selected} view={view}
    pending={manager.getPending(selected.id)} canManage={manager.canManage}
    onAccept={manager.accept} onComplete={manager.complete}
    onGuide={index => startGuidance(selected, index)} onClose={() => setDetails(null)} />, document.body);
  if (launcherPage) return null;
  if (guidance && gameplayGuides[guidance.topic] && (mission || guidance.scope === generalScope)) {
    return <GuidanceMessage key={`${guidance.scope}:${guidance.topic}:${guidance.objectiveIndex}`}
      guidance={guidance} mission={mission} view={view} busy={crew?.Crew?.readyAt > blockTime}
      onClose={() => setGuidance(null)} onDetails={() => setDetails({ scope, id: mission.id })} />;
  }
  if (!offer || actionDialog?.type) return null;
  return <TutorialMessage messageHeight={225} crewmateId={6877} isIn onClose={closeOffer}
    step={{ title: 'Your first mission', content: '[DRAFT] Lea here. Your starter campaign is underway. Would you like a little guidance for your first requirement? [DRAFT]' }}
    leftButton={{ children: 'No thanks', onClick: closeOffer }}
    rightButton={{ children: 'Show me how', onClick: () => { closeOffer(); startGuidance(first); } }} />;
};

export default GameplayGuidance;
