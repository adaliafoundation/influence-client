import { useCallback, useContext, useMemo } from 'react';
import { Entity } from '@influenceth/sdk';

import ChainTransactionContext from '~/contexts/ChainTransactionContext';

const useCrewDelegationManager = (crewId) => {
  const { execute, getStatus } = useContext(ChainTransactionContext);

  const caller_crew = useMemo(() => (
    crewId ? { id: crewId, label: Entity.IDS.CREW } : undefined
  ), [crewId]);

  const delegateCrew = useCallback((delegatedTo) => {
    if (!caller_crew || !delegatedTo) return;
    return execute('DelegateCrew', {
      caller_crew,
      delegated_to: delegatedTo
    });
  }, [caller_crew, execute]);

  const getDelegationStatus = useCallback((delegatedTo) => {
    if (!caller_crew || !delegatedTo) return 'ready';
    return getStatus('DelegateCrew', {
      caller_crew,
      delegated_to: delegatedTo
    });
  }, [caller_crew, getStatus]);

  return {
    delegateCrew,
    getDelegationStatus
  };
};

export default useCrewDelegationManager;
