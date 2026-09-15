import { useCallback, useContext, useMemo } from 'react';
import { Entity } from '@influenceth/sdk';

import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useCrewContext from '~/hooks/useCrewContext';
import actionStages from '~/lib/actionStages';
import { getStarterFoodSupplySource } from '~/lib/starterPacks';

const useFeedCrewManager = () => {
  const { crew, isLoading } = useCrewContext();
  const { execute, getPendingTx } = useContext(ChainTransactionContext);

  const caller_crew = useMemo(() => ({ id: crew?.id, label: Entity.IDS.CREW }), [crew?.id]);

  const feedCrew = useCallback(
    ({ origin, originSlot, amount, _orderPath, ...fillProps }) => {
      if (_orderPath) {
        execute('ResupplyFoodFromExchange', {
          seller_account: fillProps.sellerAccount,
          exchange_owner_account: fillProps.exchangeOwnerAccount,
          seller_crew: fillProps.crew,
          exchange: fillProps.entity,
          amount: fillProps.fillAmount,
          payments: fillProps.paymentsUnscaled,
          price: fillProps.price,
          product: fillProps.product,
          storage: fillProps.storage,
          storage_slot: fillProps.storageSlot,  
          caller_crew
        });
      } else {
        const source = origin || getStarterFoodSupplySource(crew);
        if (!source) return;

        execute('ResupplyFood', {
          origin: { id: source.id, label: source.label },
          origin_slot: originSlot ?? source.slot,
          food: amount,
          caller_crew
        });
      }
    },
    [caller_crew, crew, execute]
  );

  const currentFeeding = useMemo(
    () => {
      if (getPendingTx) {
        return getPendingTx('ResupplyFood', { caller_crew })
          || getPendingTx('ResupplyFoodFromExchange', { caller_crew })
      }
      return null;
    },
    [caller_crew, getPendingTx]
  );

  return {
    isLoading,
    feedCrew,
    currentFeeding,
    actionStage: currentFeeding ? actionStages.STARTING : actionStages.NOT_STARTED,
  };
};

export default useFeedCrewManager;
