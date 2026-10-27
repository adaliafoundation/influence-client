import { STARTER_CAMPAIGN_NAME } from '~/lib/starterCampaign';

import Button from '~/components/ButtonAlt';
import ActionSubmissionProvider from '~/components/ActionSubmissionProvider';
import Loader from '~/components/Loader';
import useCrewContext from '~/hooks/useCrewContext';
import useSession from '~/hooks/useSession';
import useStore from '~/hooks/useStore';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';
import useStarterMissionManager from '~/hooks/actionManagers/useStarterMissionManager';
import useMissionGuidance from '~/hooks/useMissionGuidance';
import { isStarterCampaignVisible } from '~/lib/missionPresentation';
import { Muted } from './MissionStyles';
import MissionCampaign from './MissionCampaign';
import ColonizationMissions from './ColonizationMissions';
import { CampaignList } from './MissionStyles';
import MissionPage, { MissionEmpty as Empty } from './MissionPage';

const StarterMissionsContent = () => {
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
  else if (!crew?.id) content = <Empty><h2>Select your crew</h2><Muted>Select a crew to see its starter missions.</Muted></Empty>;
  else if (!view && isLoading) content = <Empty aria-label="Loading missions"><Loader /></Empty>;
  else if (!view && isError) content = <Empty role="alert"><h2>Unable to load missions</h2><Muted>Please try again.</Muted><Button onClick={() => refetch()}>Retry</Button></Empty>;
  else if (isStarterCampaignVisible(view)) content = <MissionCampaign key={`${view.campaign}:${view.subject.id}`} view={view} manager={manager} onGuide={startGuidance} initiallyExpanded={expandStarter} />;
  else content = <Empty><h2>No starter missions available</h2><Muted>{view?.active ? `This crew is not eligible for ${STARTER_CAMPAIGN_NAME}. Select another crew to check its missions.` : 'There are no active campaigns available right now.'}</Muted></Empty>;
  return <MissionPage title="Missions" description="Find your next objective. Make your mark on Adalia."><CampaignList>{content}{authenticated && !simulation && <ColonizationMissions />}</CampaignList></MissionPage>;
};

const StarterMissions = () => (
  <ActionSubmissionProvider>
    <StarterMissionsContent />
  </ActionSubmissionProvider>
);

export default StarterMissions;
