import { appConfig } from '~/appConfig';
import LauncherDialog from './components/LauncherDialog';
import StarterMissions from './components/StarterMissions';
import RewardQuests from './components/RewardQuests';

const panes = [
  { label: 'Missions', pane: <StarterMissions /> },
  appConfig.get('Url.socialQuests') && { label: 'Social Quests', pane: <RewardQuests /> }
].filter(Boolean);

const Missions = () => <LauncherDialog panes={panes} singlePane={panes.length === 1 ? <StarterMissions /> : undefined} />;

export default Missions;
