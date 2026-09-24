import { useCallback, useContext } from 'react';
import { Address } from '@influenceth/sdk';

import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useCrewContext from '~/hooks/useCrewContext';
import useSession from '~/hooks/useSession';
import useStarterMissions from '~/hooks/useStarterMissions';
import { findPendingMissionTransaction, getStarterMissionAssignment, getMissionValidationArguments } from '~/lib/starterMissions';

const useStarterMissionManager = () => {
  const { crew, pendingTransactions } = useCrewContext();
  const { accountAddress } = useSession();
  const { execute } = useContext(ChainTransactionContext);
  const query = useStarterMissions(crew?.id);
  const view = query.data;
  const canManage = !!(accountAddress && view?.recipient && Address.areEqual(accountAddress, view.recipient));

  const submit = useCallback((system, missionId, delivery) => {
    if (!view) throw new Error('Starter missions have not loaded.');
    const assignment = getStarterMissionAssignment(view, missionId);
    return execute(system, {
      assignment,
      ...(system === 'MissionValidate' ? { arguments: getMissionValidationArguments(delivery) } : {})
    });
  }, [execute, view]);

  const accept = useCallback((missionId) => submit('AcceptMission', missionId), [submit]);
  const claim = useCallback((missionId) => submit('ClaimMissionReward', missionId), [submit]);
  const validate = useCallback((missionId, delivery) => submit('MissionValidate', missionId, delivery), [submit]);
  const complete = useCallback((missionId) => submit(
    view?.missions.find(mission => mission.id === missionId)?.claimable ? 'ClaimMissionReward' : 'CompleteStarterMission',
    missionId
  ), [submit, view]);
  const getPending = useCallback((missionId) => {
    if (!view?.campaign) return null;
    return findPendingMissionTransaction(pendingTransactions, getStarterMissionAssignment(view, missionId));
  }, [pendingTransactions, view]);

  return { ...query, canManage, accept, claim, validate, complete, getPending };
};

export default useStarterMissionManager;
