import useCrewContext from '~/hooks/useCrewContext';
import useStarterMissions from '~/hooks/useStarterMissions';

// One subscription keeps every mission query consumer current, even with dialogs closed.
const StarterMissionSync = () => {
  const { crew } = useCrewContext();
  useStarterMissions(crew?.id, { subscribe: true });
  return null;
};

export default StarterMissionSync;
