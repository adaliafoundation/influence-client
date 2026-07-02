import { useCallback, useContext, useMemo } from 'react';
import { Entity, Lot } from '@influenceth/sdk';

import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useConstructionManager from '~/hooks/actionManagers/useConstructionManager';
import useAsteroid from '~/hooks/useAsteroid';
import useBlockTime from '~/hooks/useBlockTime';
import useCrewContext from '~/hooks/useCrewContext';
import useLot from '~/hooks/useLot';
import actionStages from '~/lib/actionStages';
import { getLotLeaseAuctionStatus } from '~/lib/leaseUtils';

const useRepoManager = (lotId) => {
  const { crew, isLoading } = useCrewContext();
  const { execute, getPendingTx } = useContext(ChainTransactionContext);
  const { isAtRisk } = useConstructionManager(lotId);
  const { data: lot } = useLot(lotId);
  const blockTime = useBlockTime();
  const { data: asteroid } = useAsteroid(lotId ? Lot.toPosition(lotId)?.asteroidId : undefined);

  const isAuctionActive = useMemo(
    () => getLotLeaseAuctionStatus({ asteroid, lot, blockTime }).isAuctionActive,
    [asteroid, blockTime, lot]
  );

  const takeoverType = useMemo(() => {
    // if i'm not in control of the building...
    if (crew?.id !== lot?.building?.Control?.controller?.id) {
      // ... but i am in control of the lot, then i can takeover from squatter
      if (crew?.id === lot?.Control?.controller?.id) return 'squatted';
      // ... or if is on expired site, then i can takeover from anyone
      if (isAtRisk) return 'expired';
    }
    return null;
  }, [crew?.id, isAtRisk, lot?.building?.Control?.controller?.id, lot?.Control?.controller?.id]);

  const payload = useMemo(() => ({
    building: { id: lot?.building?.id, label: Entity.IDS.BUILDING },
    lot: { id: lot?.id, label: Entity.IDS.LOT },
    caller_crew: { id: crew?.id, label: Entity.IDS.CREW }
  }), [crew?.id, lot?.building?.id, lot?.id]);

  const repoBuilding = useCallback(
    () => execute(isAuctionActive ? 'RepossessBuildingAndCancelAuction' : 'RepossessBuilding', payload, { lotId }),
    [execute, isAuctionActive, lotId, payload]
  );

  const currentRepo = useMemo(
    () => getPendingTx
      ? getPendingTx('RepossessBuilding', payload) || getPendingTx('RepossessBuildingAndCancelAuction', payload)
      : null,
    [getPendingTx, payload]
  );

  return {
    isLoading,
    repoBuilding,

    currentRepo,
    takeoverType,
    actionStage: currentRepo ? actionStages.STARTING : actionStages.NOT_STARTED,
  };
};

export default useRepoManager;
