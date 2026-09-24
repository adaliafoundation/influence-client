import { useCallback, useContext } from 'react';

import { useMissionAction } from '~/contexts/MissionActionContext';
import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useCrewContext from '~/hooks/useCrewContext';
import useStarterMissions from '~/hooks/useStarterMissions';
import { getStarterMissionAssignment } from '~/lib/starterMissions';

// Mission-aware dialogs pass a mission ID explicitly, for both starts and finishes.
const useStarterMissionExecution = (missionId) => {
  const context = useMissionAction();
  const { crew } = useCrewContext();
  const { execute } = useContext(ChainTransactionContext);
  const { data } = useStarterMissions(missionId == null ? null : crew?.id);
  return useCallback((key, vars, meta, options = {}) => {
    if (missionId == null) {
      if (!context) return execute(key, vars, meta, options);
      return context.prepare(key, vars, options).then(prepared => {
        if (prepared) return execute(key, vars, meta, prepared);
      });
    }
    if (!data) throw new Error('Starter missions have not loaded.');
    return execute(key, vars, meta, {
      ...options,
      missionAssignment: getStarterMissionAssignment(data, missionId)
    });
  }, [context, data, execute, missionId]);
};

export default useStarterMissionExecution;
