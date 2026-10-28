import { STARTER_CAMPAIGN_NAME } from '~/lib/starterCampaign';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { ChevronDoubleDownIcon, ChevronDoubleUpIcon, SwayIcon } from '~/components/Icons';
import { getLicensedAssetUrl } from '~/lib/assetUtils';
import { STARTER_MISSION_IMAGES } from '~/lib/starterMissions';
import MissionDialog from './MissionDialog';
import MissionRow from './MissionRow';
import { Eyebrow, Muted, ProgressTrack, Reward, SurfaceButton } from './MissionStyles';

const CampaignButton = styled(SurfaceButton)`
  position: relative;
  box-sizing: border-box;
  background-image: linear-gradient(90deg, #0a131ce8 25%, #0a131c55), url(${p => p.$image});
  background-position: center;
  background-size: cover;
  padding: 28px 30px 22px;
  min-height: 190px;
  & h2 { font-size: 26px; font-weight: 400; margin: 10px 0; }
`;
const CampaignToggle = styled.button`
  position: absolute;
  inset: 0;
  width: 100%;
  background: transparent;
  border: 0;
  cursor: ${p => p.theme.cursors.active};
  &:focus-visible { outline: 2px solid ${p => p.theme.colors.main}; outline-offset: 3px; }
`;
const CampaignHeading = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 14px;
  & > :not(h2) { position: relative; z-index: 1; min-width: 0; max-width: 100%; }
`;
const CampaignBottom = styled.div`
  display: flex;
  align-items: center;
  gap: 20px;
  justify-content: space-between;
  margin-top: 22px;
  color: #b2c0c9;
  font-size: 12px;
  & > svg { height: 18px; width: 18px; color: ${p => p.theme.colors.main}; }
`;
const CampaignContents = styled.div`
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid #29343d;
  border-top: 0;
  padding: 16px;
  @media (max-width: 1100px) { padding: 8px; }
`;
const List = styled.ol`
  padding: 0;
  margin: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 5px;
`;
// Kept separate from account hooks so the campaign view is reusable and testable.
const MissionCampaign = ({ view, manager, onGuide, initiallyExpanded = false, presentation, children, showProgress = true, campaignImage, headerControl, subjectName, heading }) => {
  const name = presentation?.name || STARTER_CAMPAIGN_NAME;
  const images = presentation?.images || STARTER_MISSION_IMAGES;
  const listId = `missions-${view.subject.label}-${view.subject.id}`;
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [selectedId, setSelectedId] = useState(null);
  useEffect(() => { setSelectedId(null); }, [view.campaign, view.subject.id]);
  const selected = view.missions.find((mission) => mission.id === selectedId);
  const completed = view.missions.filter((mission) => mission.completed).length;
  const claimed = view.missions.filter((mission) => mission.claimed).length;
  const total = view.missions.reduce((sum, mission) => sum + mission.reward, 0);
  const ready = view.missions.filter((mission) => mission.claimable).length;

  return (
    <section aria-label={name}>
      <CampaignButton as="div"
        $image={campaignImage || getLicensedAssetUrl(images[2])}
        >
        <CampaignToggle aria-label={`Campaign · ${name}`} aria-expanded={expanded} aria-controls={listId}
          onClick={() => setExpanded(!expanded)} />
        <Eyebrow>Campaign · {view.missions.length} missions</Eyebrow>
        <CampaignHeading><h2>{heading || name}</h2>{headerControl}</CampaignHeading>
        <Muted>{presentation?.description || 'From your first survey to a working industry. Build a future for your crew.'}</Muted>
        <CampaignBottom>
          <Reward><SwayIcon /> {total.toLocaleString()} SWAY</Reward>
          {showProgress && <span>{completed} / {view.missions.length} complete{ready ? ` · ${ready} reward${ready === 1 ? '' : 's'} ready` : claimed === view.missions.length ? ' · All rewards claimed' : ''}</span>}
          {expanded ? <ChevronDoubleUpIcon /> : <ChevronDoubleDownIcon />}
        </CampaignBottom>
      </CampaignButton>
      {showProgress && <ProgressTrack $value={100 * completed / view.missions.length} aria-hidden="true"><div /></ProgressTrack>}
      {expanded && (
        <CampaignContents id={listId}>
          {children}
          <List>
            {view.missions.map((mission) => <MissionRow key={mission.id} mission={mission} pending={manager.getPending(mission.id)}
              eligible={view.eligible} presentation={presentation} image={images[mission.id]}
              detail={!presentation && mission.id === 1 ? `${view.progress?.sampleCount || 0} / 3 samples` : undefined}
              onClick={() => setSelectedId(mission.id)} />)}
          </List>
        </CampaignContents>
      )}
      {selected && createPortal(<MissionDialog key={selected.id} mission={selected} view={view} presentation={presentation} subjectName={subjectName}
        pending={manager.getPending(selected.id)} canManage={manager.canManage}
        onAccept={manager.accept} onComplete={manager.complete}
        onGuide={onGuide ? index => onGuide(selected, index) : undefined}
        onClose={() => setSelectedId(null)} />, document.body)}
    </section>
  );
};

export default MissionCampaign;
