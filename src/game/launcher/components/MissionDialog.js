import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

import Details from '~/components/DetailsModal';
import HeroLayout from '~/components/HeroLayout';
import { SwayIcon } from '~/components/Icons';
import { getLicensedAssetUrl } from '~/lib/assetUtils';
import { STARTER_MISSION_IMAGES } from '~/lib/starterMissions';
import { getMissionObjectives } from '~/lib/missionPresentation';
import MissionTimeline from './MissionTimeline';
import starterMissionStories from '~/lib/starterMissionStories';
import { Eyebrow, Muted, Reward } from './MissionStyles';

const Content = styled.div`
  height: 100%;
  overflow-y: auto;
  padding: 0 10px 20px 0;
  scrollbar-width: thin;
`;
const Section = styled.section`
  border-top: 1px solid #273039;
  margin-top: 22px;
  padding-top: 18px;
`;
const MissionDialog = ({ mission, view, pending, canManage, onAccept, onComplete, onClose, onGuide }) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState();
  const bodyRef = useRef();
  const story = starterMissionStories[mission.key];
  const objectives = getMissionObjectives(mission, view.progress);

  useEffect(() => {
    const previous = document.activeElement;
    bodyRef.current?.focus();
    return () => previous?.focus();
  }, []);

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    if (event.key !== 'Tab') return;
    const buttons = event.currentTarget.querySelectorAll('button:not(:disabled), a[href], select, summary, [tabindex="0"]');
    if (!buttons.length) { event.preventDefault(); return; }
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === event.currentTarget)) {
      event.preventDefault(); first.focus();
    }
  };

  const submit = async (operation) => {
    setSubmitting(true);
    setError(null);
    try { await operation(mission.id); }
    catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  return (
    <Details
      edgeToEdge
      title="Starter campaign"
      headerProps={{ background: 'true', v2: 'true' }}
      width="1150px"
      onClose={onClose}
      wrapperProps={{ style: { position: 'fixed', zIndex: 10000 } }}
      detailsProps={{ ref: bodyRef, role: 'dialog', 'aria-modal': true, 'aria-label': mission.title, tabIndex: -1, onKeyDown: handleKeyDown, style: { outline: 'none' } }}>
      <HeroLayout
        coverImage={getLicensedAssetUrl(STARTER_MISSION_IMAGES[mission.id])}
        title={mission.title}
        styleOverrides={{ body: { flex: '1 1 0', minWidth: 0 } }}
        subtitle={<Reward><SwayIcon /> {mission.reward.toLocaleString()} SWAY</Reward>}
        rightButton={{ label: 'Close', onClick: onClose }}>
        <Content>
              {!!story.length && <Section aria-label="Mission briefing">
                <Eyebrow>Mission briefing</Eyebrow>
                {story.map((paragraph, index) => <Muted key={index}>{paragraph}</Muted>)}
              </Section>}
              <Section aria-label="Mission progress" aria-live="polite">
                <Eyebrow>Progress</Eyebrow>
                <MissionTimeline mission={mission} objectives={objectives} eligible={view.eligible}
                  disabled={!canManage || !!pending || submitting} pending={!!pending || submitting}
                  onAccept={() => submit(onAccept)} onComplete={() => submit(onComplete)}
                  onGuide={onGuide ? index => { onClose(); onGuide(index); } : undefined} />
                {!view.eligible && <Muted>This crew can no longer progress in the campaign. Completed rewards remain available to claim.</Muted>}
              </Section>
              {!canManage && <Muted>Connect as the current crew delegate to accept missions or claim rewards.</Muted>}
              {error && <Muted role="alert">{error}</Muted>}
        </Content>
      </HeroLayout>
    </Details>
  );
};

export default MissionDialog;
