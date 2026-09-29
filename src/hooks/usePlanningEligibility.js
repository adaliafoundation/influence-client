import { useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import useCrewContext from '~/hooks/useCrewContext';
import useSession from '~/hooks/useSession';
import useConstants from '~/hooks/useConstants';
import api from '~/lib/api';
import { checkingPlanning, loadPlanningEligibility } from '~/lib/planningEligibility';

const usePlanningEligibility = (lot) => {
  const lotId = lot?.id;
  const queryClient = useQueryClient();
  const { data: launchTime } = useConstants('LAUNCH_TIME');
  const { crew } = useCrewContext();
  const { provider, blockTime, blockNumber, accountAddress } = useSession();
  const current = useRef();
  const snapshot = {
    ...lot?._permissionTargets,
    crew,
    occupants: lot?._planningOccupants,
    constants: { LAUNCH_TIME: launchTime }
  };
  const planningApi = crew?._isSimulation ? {
    ...api,
    getEntityById: ({ label, id }) => Promise.resolve(queryClient.getQueryData(['entity', label, Number(id)]))
  } : api;
  const params = { api: planningApi, provider, lotId, crewId: crew?.id, blockTime, blockNumber, accountAddress };
  // Tutorial transactions operate entirely on the existing mock state.
  current.current = crew?._isSimulation ? { ...params, snapshot } : params;
  const query = useQuery({
    queryKey: ['planningEligibility', Number(lotId), crew?.id, accountAddress, blockTime, blockNumber, lot?._permissionTargets, lot?._planningOccupants, crew?.Crew, crew?.Location, launchTime],
    queryFn: () => loadPlanningEligibility({ ...params, snapshot }),
    enabled: !!(lotId && crew?.id && blockTime != null && lot?._permissionTargets?.lot && lot?._permissionTargets?.asteroid && launchTime != null),
    retry: false
  });
  const recheck = useCallback(async (expected) => {
    const snapshot = current.current;
    if (expected.lotId !== snapshot.lotId || expected.crewId !== snapshot.crewId) return checkingPlanning;
    const result = await loadPlanningEligibility(snapshot);
    const latest = current.current;
    if (snapshot.crewId !== latest.crewId || snapshot.accountAddress !== latest.accountAddress || snapshot.lotId !== latest.lotId || snapshot.blockTime !== latest.blockTime || snapshot.blockNumber !== latest.blockNumber || snapshot.provider !== latest.provider) return checkingPlanning;
    return result;
  }, []);
  return {
    eligibility: query.isFetching || query.isError ? checkingPlanning : (query.data || checkingPlanning),
    recheck
  };
};

export default usePlanningEligibility;
