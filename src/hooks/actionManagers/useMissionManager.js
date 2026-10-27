import { useCallback, useContext } from 'react';
import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useStore from '~/hooks/useStore';
import { findPendingMissionTransaction, getMissionValidationArguments } from '~/lib/starterMissions';

const useMissionManager = (query, canManage, getAssignment) => {
  const { execute } = useContext(ChainTransactionContext);
  const pendingTransactions = useStore(s => s.pendingTransactions);
  const view = query.data;
  const submit = useCallback((system, missionId, delivery) => {
    if (!view) throw new Error('Missions have not loaded.');
    return execute(system, { assignment: getAssignment(view, missionId),
      ...(system === 'MissionValidate' ? { arguments: getMissionValidationArguments(delivery) } : {}) });
  }, [execute, view, getAssignment]);
  const accept = useCallback(id => submit('AcceptMission', id), [submit]);
  const claim = useCallback(id => submit('ClaimMissionReward', id), [submit]);
  const validate = useCallback((id, delivery) => submit('MissionValidate', id, delivery), [submit]);
  const complete = useCallback(id => submit(
    view?.missions.find(m => m.id === id)?.claimable ? 'ClaimMissionReward' : 'CompleteMission', id
  ), [submit, view]);
  const getPending = useCallback(id => view?.campaign
    ? findPendingMissionTransaction(pendingTransactions, getAssignment(view, id)) : null,
  [pendingTransactions, view, getAssignment]);
  return { ...query, canManage, accept, claim, validate, complete, getPending };
};
export default useMissionManager;
