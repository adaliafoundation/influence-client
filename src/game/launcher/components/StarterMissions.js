import { useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';

import Button from '~/components/ButtonAlt';
import { ChevronDoubleDownIcon, ChevronDoubleUpIcon, ForwardIcon, RewardsIcon, SwayIcon } from '~/components/Icons';
import Loader from '~/components/Loader';
import useCrewContext from '~/hooks/useCrewContext';
import useSession from '~/hooks/useSession';
import useStore from '~/hooks/useStore';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';
import useStarterMissionManager from '~/hooks/actionManagers/useStarterMissionManager';
import useMissionGuidance from '~/hooks/useMissionGuidance';
import { getLicensedAssetUrl } from '~/lib/assetUtils';
import { STARTER_MISSION_IMAGES } from '~/lib/starterMissions';
import { getMissionStatus, isStarterCampaignVisible } from '~/lib/missionPresentation';
import MissionDialog from './MissionDialog';
import MissionStatus from './MissionStatus';
import { Eyebrow, Muted, ProgressTrack, Reward, SurfaceButton } from './MissionStyles';

const Page = styled.div`
  padding: 36px 75px 44px 75px;
  margin: auto;
  & h1 { font-weight: 400; font-size: 34px; margin: 10px 0; letter-spacing: 0.02em; }
  @media (max-width: 1100px) { padding: 36px 12px; }
`;
const Header = styled.header`
  margin-bottom: 32px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 24px;
  & > svg { color: ${p => p.theme.colors.main}; width: 56px; height: 56px; flex-shrink: 0; opacity: 0.5; }
`;
const CampaignButton = styled(SurfaceButton)`
  background-image: linear-gradient(90deg, #0a131ce8 25%, #0a131c55), url(${p => p.$image});
  background-position: center;
  background-size: cover;
  padding: 28px 30px 22px;
  min-height: 190px;
  & h2 { font-size: 26px; font-weight: 400; margin: 10px 0; }
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
const List = styled.ol`
  padding: 0;
  margin: 8px 0 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 5px;
`;
const Row = styled(SurfaceButton)`
  align-items: center;
  display: grid;
  grid-template-columns: 30px 100px 1fr auto 28px 16px;
  gap: 18px;
  min-height: 92px;
  padding: 10px 18px;
  background: ${p => p.$active ? '#12232e' : '#0c1218'};
  border-color: ${p => p.$active ? '#3c657c' : '#202d37'};
  & h3 { font-size: 16px; font-weight: 400; margin: 0; }
  @media (max-width: 1100px) {
    grid-template-columns: 22px 70px 1fr auto 24px;
    gap: 10px;
    padding: 10px;
    & > svg:last-child { display: none; }
  }
`;
const Thumb = styled.div`
  height: 64px;
  background: url(${p => p.$image}) center / cover;
  opacity: ${p => p.$locked ? 0.35 : 0.85};
  filter: ${p => p.$locked ? 'grayscale(0.8)' : 'none'};
`;
const RowTitle = styled.div`
  opacity: ${p => p.$locked ? 0.5 : 1};
  & small { display: block; color: #8a9ca9; font-size: 11px; margin-top: 7px; letter-spacing: 0.04em; }
`;
const Empty = styled.div`
  border: 1px solid #25323c;
  background: #0c1319;
  padding: 44px;
  text-align: center;
  min-height: 230px;
  position: relative;
  & h2 { font-size: 20px; font-weight: 400; }
  & button { margin: 20px auto 0; }
`;

// Kept separate from account hooks so the campaign view is reusable and testable.
export const StarterCampaign = ({ view, manager, onGuide, initiallyExpanded = false }) => {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [selectedId, setSelectedId] = useState(null);
  const selected = view.missions.find((mission) => mission.id === selectedId);
  const completed = view.missions.filter((mission) => mission.completed).length;
  const claimed = view.missions.filter((mission) => mission.claimed).length;
  const total = view.missions.reduce((sum, mission) => sum + mission.reward, 0);
  const ready = view.missions.filter((mission) => mission.claimable).length;

  return (
    <section aria-label="Starter campaign">
      <CampaignButton
        $image={getLicensedAssetUrl(STARTER_MISSION_IMAGES[2])}
        aria-expanded={expanded} aria-controls="starter-mission-list"
        onClick={() => setExpanded(!expanded)}>
        <Eyebrow>Campaign · {view.missions.length} missions</Eyebrow>
        <h2>Your Foothold in Adalia</h2>
        <Muted>From your first survey to a working industry. Build a future for your crew.</Muted>
        <CampaignBottom>
          <Reward><SwayIcon /> {total.toLocaleString()} SWAY</Reward>
          <span>{completed} / {view.missions.length} complete{ready ? ` · ${ready} reward${ready === 1 ? '' : 's'} ready` : claimed === view.missions.length ? ' · All rewards claimed' : ''}</span>
          {expanded ? <ChevronDoubleUpIcon /> : <ChevronDoubleDownIcon />}
        </CampaignBottom>
      </CampaignButton>
      <ProgressTrack $value={100 * completed / view.missions.length} aria-hidden="true"><div /></ProgressTrack>
      {expanded && (
        <List id="starter-mission-list">
          {view.missions.map((mission) => {
            const status = getMissionStatus(mission, manager.getPending(mission.id), view.eligible);
            const locked = status.key === 'locked';
            return (
              <li key={mission.id}>
                <Row $active={['active', 'available', 'claimable'].includes(status.key)} onClick={() => setSelectedId(mission.id)} aria-label={`${mission.title}: ${status.label}`}>
                  <Eyebrow style={{ opacity: locked ? 0.4 : 1 }}>{String(mission.id + 1).padStart(2, '0')}</Eyebrow>
                  <Thumb $image={getLicensedAssetUrl(STARTER_MISSION_IMAGES[mission.id])} $locked={locked} />
                  <RowTitle $locked={locked}><h3>{mission.title}</h3>
                    {status.key === 'active' && <small>{mission.id === 1 ? `${view.progress?.sampleCount || 0} / 3 samples` : status.label}</small>}
                    {status.key === 'claimable' && <small>Reward available</small>}
                  </RowTitle>
                  <Reward style={{ opacity: locked || mission.claimed ? 0.45 : 1 }}><SwayIcon /> {mission.reward.toLocaleString()}</Reward>
                  <MissionStatus status={status} />
                  <ForwardIcon />
                </Row>
              </li>
            );
          })}
        </List>
      )}
      {selected && createPortal(<MissionDialog key={selected.id} mission={selected} view={view}
        pending={manager.getPending(selected.id)} canManage={manager.canManage}
        onAccept={manager.accept} onComplete={manager.complete}
        onGuide={onGuide ? index => onGuide(selected, index) : undefined}
        onClose={() => setSelectedId(null)} />, document.body)}
    </section>
  );
};

const StarterMissions = () => {
  const expandStarter = useStore(s => s.launcherSubpage === 'starter');
  const { crew } = useCrewContext();
  const { authenticated, login } = useSession();
  const simulation = useSimulationEnabled();
  const manager = useStarterMissionManager();
  const { data: view, isLoading, isError, refetch } = manager;
  const startGuidance = useMissionGuidance(view?.campaign);
  let content;
  if (!authenticated) content = <Empty><h2>Your next chapter starts here</h2><Muted>Sign in to discover missions for your crew.</Muted><Button onClick={login}>Sign in</Button></Empty>;
  else if (simulation) content = <Empty><h2>Campaigns await in Adalia</h2><Muted>Starter missions are available outside training.</Muted></Empty>;
  else if (!crew?.id) content = <Empty><h2>Select your crew</h2><Muted>Missions and progress belong to a crew. Select one to see available campaigns.</Muted></Empty>;
  else if (isLoading) content = <Empty aria-label="Loading missions"><Loader /></Empty>;
  else if (isError) content = <Empty role="alert"><h2>Unable to load missions</h2><Muted>Please try again.</Muted><Button onClick={() => refetch()}>Retry</Button></Empty>;
  else if (isStarterCampaignVisible(view)) content = <StarterCampaign key={`${view.campaign}:${view.subject.id}`} view={view} manager={manager} onGuide={startGuidance} initiallyExpanded={expandStarter} />;
  else content = <Empty><h2>No available campaigns</h2><Muted>{view?.active ? 'This crew is not eligible for the starter campaign. Select another crew to check its missions.' : 'There are no active campaigns available right now.'}</Muted></Empty>;
  return <Page><Header><RewardsIcon /><div><h1>Missions</h1><Muted>Find your next objective. Make your mark on Adalia.</Muted></div></Header>{content}</Page>;
};

export default StarterMissions;
