import { useState } from 'react';
import styled from 'styled-components';
import { ColonizationMission, Entity } from '@influenceth/sdk';
import AsteroidsHeroImage from '~/assets/images/sales/asteroids_hero.png';
import Button from '~/components/ButtonAlt';
import Dropdown from '~/components/Dropdown';
import Loader from '~/components/Loader';
import useStore from '~/hooks/useStore';
import useColonizationAsteroids from '~/hooks/useColonizationAsteroids';
import useMissionGuidance from '~/hooks/useMissionGuidance';
import useWalletAsteroids from '~/hooks/useWalletAsteroids';
import useColonizationMissionManager from '~/hooks/actionManagers/useColonizationMissionManager';
import { colonizationPresentation } from '~/lib/colonizationMissions';
import MissionCampaign from './MissionCampaign';
import { Muted } from './MissionStyles';
const AsteroidTrigger = styled.button`
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 100%;
  color: #e4eef3;
  background: rgba(255, 255, 255, 0.04);
  border: 0;
  border-bottom: 1px solid #89959e;
  border-radius: 0;
  padding: 6px 8px;
  font: inherit;
  font-size: 22px;
  cursor: ${p => p.theme.cursors.active};
  & label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: inherit; }
  &:focus-visible { outline: 2px solid ${p => p.theme.colors.main}; outline-offset: 3px; }
`;

const campaignPreview = {
  subject: { label: Entity.IDS.ASTEROID, id: null },
  eligible: true,
  progress: { selectedBuildings: [] },
  missions: Object.values(ColonizationMission.TYPES)
};

const ColonizationMissions = () => {
  const { data: asteroids = [], isLoading, isError, refetch } = useWalletAsteroids();
  const selectedAsteroid = useStore(s => s.asteroids.origin);
  const initiallyExpanded = useStore(s => s.launcherSubpage === 'colonization');
  const [selection, setSelection] = useState(() => sessionStorage.getItem('colonizationAsteroid') || '');
  const candidates = asteroids.map(asteroid => ({ id: String(asteroid.id), name: asteroid.Name?.name ? `${asteroid.Name.name} (#${asteroid.id})` : `Asteroid #${asteroid.id}` }));
  if (selectedAsteroid && !candidates.some(a => a.id === String(selectedAsteroid))) {
    candidates.unshift({ id: String(selectedAsteroid), name: `Selected asteroid #${selectedAsteroid}` });
  }
  const eligibility = useColonizationAsteroids(candidates);
  const choices = eligibility.data;
  const asteroidId = choices.some(a => a.id === selection) ? selection : undefined;
  const manager = useColonizationMissionManager(asteroidId);
  const showProgress = !!(asteroidId && manager.data?.active && !manager.isError);
  const subjectName = choices.find(asteroid => asteroid.id === asteroidId)?.name;
  const startGuidance = useMissionGuidance(manager.data?.campaign, {
    kind: 'colonization', subject: { label: Entity.IDS.ASTEROID, id: asteroidId || null }, subjectName
  });
  const headerControl = <Dropdown aria-label="Colony asteroid" initialSelection={asteroidId || ''}
    options={[{ id: '', name: 'Select asteroid' }, ...choices]} labelKey="name" valueKey="id"
    triggerComponent={AsteroidTrigger} menuZIndex={10002}
    onChange={option => {
      setSelection(option.id);
      sessionStorage.setItem('colonizationAsteroid', option.id);
    }} />;
  return <MissionCampaign onGuide={startGuidance} heading="Colonization of" headerControl={headerControl} subjectName={subjectName} view={showProgress ? { ...manager.data, eligible: true } : campaignPreview}
    manager={{ ...manager, canManage: showProgress && manager.canManage }} campaignImage={AsteroidsHeroImage} presentation={colonizationPresentation} initiallyExpanded={initiallyExpanded} showProgress={showProgress}>
    {(isLoading || eligibility.isLoading) && <Loader />}
    {eligibility.isError && <div role="alert"><Muted>Unable to check eligibility for some asteroids.</Muted><Button onClick={eligibility.refetch}>Retry</Button></div>}
    {isError && <div role="alert"><Muted>Unable to load your asteroids.</Muted><Button onClick={() => refetch()}>Retry</Button></div>}
    {asteroidId && <>
      {manager.isLoading && <Loader />}
      {manager.isError && <div role="alert"><Muted>Unable to load colony missions.</Muted><Button onClick={() => manager.refetch()}>Retry</Button></div>}
      {!manager.isLoading && !manager.isError && !manager.data?.active && <Muted>No colonization campaign is active on this network.</Muted>}
    </>}
  </MissionCampaign>;
};
export default ColonizationMissions;
