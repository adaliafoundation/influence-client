import useFailureReporter from '../useFailureReporter';
import useConstants from '~/hooks/useConstants';
import { useCallback, useContext, useMemo } from 'react';
import { Entity, Lot } from '@influenceth/sdk';

import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useAsteroid from '~/hooks/useAsteroid';
import useBlockTime from '~/hooks/useBlockTime';
import useCrewContext from '~/hooks/useCrewContext';
import useLot from '~/hooks/useLot';
import actionStages from '~/lib/actionStages';
import { getLotLeaseAuctionStatus } from '~/lib/leaseUtils';

const useRepoManager = (lotId) => {
  const reportBlocked = useFailureReporter();
  const { crew, isLoading, authorize, recheckAuthorization, recheckActingCrew } = useCrewContext();
  const { execute, getPendingTx } = useContext(ChainTransactionContext);
  const { data: lot } = useLot(lotId);
  const blockTime = useBlockTime();
  const { data: asteroid } = useAsteroid(lotId ? Lot.toPosition(lotId)?.asteroidId : undefined);

  const isAuctionActive = useMemo(
    () => getLotLeaseAuctionStatus({ asteroid, lot, blockTime }).isAuctionActive,
    [asteroid, blockTime, lot]
  );

  const { data: gracePeriod } = useConstants('CONSTRUCTION_GRACE_PERIOD');
  const authorization = authorize('repossession', [crew, lot?.building, gracePeriod], [crew, lot?.building]);
  const takeoverType = authorization.status === 'allowed'
    ? (authorization.reason === 'planned-site-cleanup' ? 'expired' : 'squatted') : null;

  const payload = useMemo(() => ({
    building: { id: lot?.building?.id, label: Entity.IDS.BUILDING },
    lot: { id: lot?.id, label: Entity.IDS.LOT },
    caller_crew: { id: crew?.id, label: Entity.IDS.CREW }
  }), [crew?.id, lot?.building?.id, lot?.id]);

  const repoBuilding = useCallback(
    async () => {
      const prerequisites = await recheckActingCrew({ asteroidId: asteroid?.id });
      if (prerequisites.status !== 'allowed') return reportBlocked(prerequisites);
      const decision = await recheckAuthorization('repossession', [crew, lot?.building, gracePeriod], [crew, lot?.building]);
      if (decision.status !== 'allowed') return reportBlocked(decision);
      return execute(isAuctionActive ? 'RepossessBuildingAndCancelAuction' : 'RepossessBuilding', payload, { lotId });
    },
    [reportBlocked, recheckActingCrew, asteroid?.id, execute, isAuctionActive, lotId, payload, recheckAuthorization, crew, lot?.building, gracePeriod]
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
    authorization,
    actionStage: currentRepo ? actionStages.STARTING : actionStages.NOT_STARTED,
  };
};

export default useRepoManager;
