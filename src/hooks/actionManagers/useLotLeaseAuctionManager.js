import { useCallback, useContext, useMemo } from 'react';
import { Entity } from '@influenceth/sdk';

import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useCrewContext from '~/hooks/useCrewContext';
import actionStages from '~/lib/actionStages';

const useLotLeaseAuctionManager = (lotId) => {
  const { crew } = useCrewContext();
  const { execute, getPendingTx } = useContext(ChainTransactionContext);

  const payload = useMemo(() => ({
    lot: { id: lotId, label: Entity.IDS.LOT },
    caller_crew: { id: crew?.id, label: Entity.IDS.CREW }
  }), [crew?.id, lotId]);

  const startAuction = useCallback(
    () => execute('StartPrepaidAgreementAuction', payload, { lotId }),
    [execute, lotId, payload]
  );

  const cancelAuction = useCallback(
    () => execute('CancelPrepaidAgreementAuction', payload, { lotId }),
    [execute, lotId, payload]
  );

  const currentAuctionChange = useMemo(
    () => getPendingTx
      ? getPendingTx('StartPrepaidAgreementAuction', payload) || getPendingTx('CancelPrepaidAgreementAuction', payload)
      : null,
    [getPendingTx, payload]
  );

  return {
    cancelAuction,
    currentAuctionChange,
    startAuction,
    actionStage: currentAuctionChange ? actionStages.STARTING : actionStages.NOT_STARTED,
  };
};

export default useLotLeaseAuctionManager;
