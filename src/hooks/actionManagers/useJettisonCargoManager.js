import { useCallback, useContext, useMemo } from 'react';
import { Entity } from '@influenceth/sdk';

import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useCrewContext from '~/hooks/useCrewContext';
import actionStages from '~/lib/actionStages';

const useJettisonCargoManager = (origin) => {
  const { crew, isLoading } = useCrewContext();
  const { execute, getPendingTx } = useContext(ChainTransactionContext);

  const payload = useMemo(() => ({
    origin: { id: origin?.id, label: origin?.label },
    caller_crew: { id: crew?.id, label: Entity.IDS.CREW }
  }), [crew?.id, origin])

  const jettisonCargo = useCallback(
    (originSlot, products, meta) => {
      if (payload.origin?.id && payload.caller_crew?.id) {
        return execute('DumpDelivery', {
          products: Object.keys(products).map((product) => ({ product, amount: Math.floor(products[product]) })),
          origin_slot: originSlot,
          ...payload
        }, meta);
      }
    },
    [execute, payload]
  );

  const currentJettison = useMemo(
    () => getPendingTx ? getPendingTx('DumpDelivery', { ...payload }) : null,
    [getPendingTx, payload]
  );

  return {
    isLoading,
    jettisonCargo,
    currentJettison,
    actionStage: currentJettison ? actionStages.STARTING : actionStages.NOT_STARTED,
  };
};

export default useJettisonCargoManager;
