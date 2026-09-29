import { useCallback, useContext, useMemo } from 'react';
import { Entity } from '@influenceth/sdk';

import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useCrewContext from '~/hooks/useCrewContext';
import useEntity from '~/hooks/useEntity';
import useStationedCrews from '~/hooks/useStationedCrews';
import useStore from '~/hooks/useStore';
import { locationsArrToObj } from '~/lib/utils';


const useEjectCrewManager = (originEntity) => {
  const { crew, isLoading, pendingTransactions, recheckAuthorization, recheckActingCrew } = useCrewContext();
  const { execute } = useContext(ChainTransactionContext);

  const { data: origin } = useEntity(originEntity);
  const { data: originCrews } = useStationedCrews(origin);

  const currentEjections = useMemo(() => {
    return pendingTransactions
      .filter((tx) => {
        if (tx.key === 'EjectCrew') {
          return (originCrews || []).find((c) => c.id === tx.vars.ejected_crew.id);
        }
      });
  }, [originCrews, pendingTransactions]);

  const ejectCrew = useCallback(
    async (id) => {
      const prerequisites = await recheckActingCrew({ requireReady: Number(id) !== Number(crew?.id) });
      if (prerequisites.status !== 'allowed') return prerequisites;
      const guest = { id, label: Entity.IDS.CREW };
      const decision = await recheckAuthorization('crewEviction', [crew, guest], [crew, guest, origin]);
      if (decision.status !== 'allowed') return decision;
      return execute(
        'EjectCrew',
        {
          ejected_crew: { id, label: Entity.IDS.CREW },
          caller_crew: { id: crew?.id, label: Entity.IDS.CREW }
        },
        {
          origin,
          ...locationsArrToObj(origin?.Location?.locations || [])
        }
      );
    },
    [recheckActingCrew, execute, crew, originEntity, origin, recheckAuthorization]
  );

  return {
    isLoading,
    ejectCrew,

    currentEjections,
  };
};

export default useEjectCrewManager;

