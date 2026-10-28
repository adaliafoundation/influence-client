import { useEffect, useRef, useState } from 'react';
import useStore from '~/hooks/useStore';
import { gameplayGuides, waitingGuidance } from '~/lib/missionGuidance';
import TutorialMessage from './TutorialMessage';
import TutorialBubble from './TutorialBubble';

const GuidanceMessage = ({ guidance, mission, onClose, onDetails, busy }) => {
  const [minimized, setMinimized] = useState(false);
  const bubbleRef = useRef();
  const [page, setPage] = useState(0);
  const messageRef = useRef();
  const topic = gameplayGuides[guidance.topic];
  const actionDialog = useStore(s => s.actionDialog);
  const dispatchCoachmarks = useStore(s => s.dispatchCoachmarks);
  const needsAcceptance = mission && !mission.accepted && !mission.completed && !mission.claimed;
  const pages = [
    ...(needsAcceptance ? ['Accept this mission before starting its objectives. You can preview the guidance now, or return to Mission details to accept it.'] : []),
    ...topic.pages,
    ...(busy ? [<span role="status">{waitingGuidance}</span>] : [])
  ];
  const visiblePage = Math.min(page, pages.length - 1);

  useEffect(() => {
    const previous = document.activeElement;
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);

  useEffect(() => {
    // Existing registered controls determine which highlights can be displayed.
    // No asset IDs or selection actions are supplied by guidance.
    const highlight = topic.highlights[visiblePage - (needsAcceptance ? 1 : 0)];
    dispatchCoachmarks(busy || actionDialog?.type || !highlight ? {} : { [highlight]: true });
    return () => dispatchCoachmarks({});
  }, [topic, visiblePage, needsAcceptance, busy, actionDialog?.type, dispatchCoachmarks]);

  useEffect(() => {
    if (minimized) bubbleRef.current?.focus();
    else messageRef.current?.focus();
  }, [minimized]);

  return <>
    <TutorialBubble crewmateId={6877} isIn={minimized} onClick={() => setMinimized(false)} setRef={bubbleRef} />
    <TutorialMessage
      messageHeight={225}
      messageRef={messageRef}
      role="region"
      aria-label={topic.title}
      tabIndex={-1}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      }}
      crewmateId={6877}
      isIn={!minimized}
      onMinimize={() => setMinimized(true)}
      onClose={onClose}
      step={{ title: topic.title, content: <>
        {pages[visiblePage]}
      </> }}
      leftButton={visiblePage > 0 ? { children: 'Back', onClick: () => setPage(visiblePage - 1) }
        : mission ? { children: 'Mission details', onClick: onDetails } : undefined}
      rightButton={visiblePage < pages.length - 1
        ? { children: 'Next', onClick: () => setPage(visiblePage + 1) }
        : { children: 'Close', onClick: onClose }} />
  </>;
};

export default GuidanceMessage;
