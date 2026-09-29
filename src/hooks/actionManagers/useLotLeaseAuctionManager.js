import { useCallback, useContext, useMemo } from 'react';
import { Entity, Lot, Permission } from '@influenceth/sdk';

import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useCrewContext from '~/hooks/useCrewContext';
import useLot from '~/hooks/useLot';
import actionStages from '~/lib/actionStages';

const useLotLeaseAuctionManager = (lotId) => {
  const { crew, authorize } = useCrewContext();
  const { data: lot } = useLot(lotId);
  const tenant = lot?._permissionTargets?.lot?.UseLot?.tenant;
  const asteroid = lotId ? { label: Entity.IDS.ASTEROID, id: Lot.toPosition(lotId).asteroidId } : null;
  const controlAccess = authorize('controls', [crew, asteroid], [crew, asteroid]);
  const tenantAccess = authorize('can', [tenant, lot, Permission.IDS.USE_LOT], [tenant, lot]);
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
    tenantAccess,
    controlAccess,
    currentAuctionChange,
    startAuction,
    actionStage: currentAuctionChange ? actionStages.STARTING : actionStages.NOT_STARTED,
  };
};

export default useLotLeaseAuctionManager;
