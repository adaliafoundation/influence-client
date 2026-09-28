import { useCallback, useContext, useMemo } from 'react';
import { Entity } from '@influenceth/sdk';

import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useCrewContext from '~/hooks/useCrewContext';
import actionStages from '~/lib/actionStages';
import useShip from '~/hooks/useShip';
import useShipEjectionEligibility from '~/hooks/useShipEjectionEligibility';
import { checkingShipEjection, isForceLaunch } from '~/lib/shipEjectionEligibility';

const useShipDockingManager = (shipId) => {
  const { execute, getPendingTx } = useContext(ChainTransactionContext);
  const { crew } = useCrewContext();
  const { data: ship } = useShip(shipId);
  const { eligibility: ejectionEligibility, recheck } = useShipEjectionEligibility(ship);

  const caller_crew = useMemo(() => ({ id: crew?.id, label: Entity.IDS.CREW }), [crew?.id]);

  const undockShip = useCallback(async (hopperAssisted) => {
    if (!crew?.id || !ship?.Control?.controller?.id || !ship?.Location?.location) return checkingShipEjection;
    const forced = isForceLaunch(crew, ship);
    let launchShip = ship;
    if (forced) {
      const eligibility = await recheck({ shipId: ship?.id, crewId: crew?.id });
      if (eligibility.status !== 'allowed') return eligibility;
      launchShip = eligibility.ship;
    }
    return execute(
      'UndockShip',
      {
        ship: launchShip,
        powered: forced ? false : !hopperAssisted,
        caller_crew
      },
      {
        asteroidId: launchShip?.Location?.locations?.find((e) => e.label === Entity.IDS.ASTEROID)?.id,
        lotId: launchShip?.Location?.locations?.find((e) => e.label === Entity.IDS.LOT)?.id,
      }
    );
  }, [caller_crew, crew, execute, recheck, ship]);

  const dockShip = useCallback((destination, hopperAssisted, destLotId) => {
    execute(
      'DockShip',
      {
        target: destination,
        powered: !hopperAssisted,
        caller_crew
      },
      {
        asteroidId: ship?._location?.asteroidId,
        lotId: destLotId,
        shipId
      }
    );
  }, [caller_crew, execute]);

  const currentDockingAction = useMemo(
    () => getPendingTx ? getPendingTx('DockShip', { caller_crew }) : null,
    [caller_crew, getPendingTx]
  );

  const currentUndockingAction = useMemo(
    () => getPendingTx ? getPendingTx('UndockShip', { caller_crew }) : null,
    [caller_crew, getPendingTx]
  );

  return {
    ejectionEligibility,
    undockShip,
    dockShip,

    currentDockingAction,
    currentUndockingAction,
    actionStage: (currentDockingAction || currentUndockingAction) ? actionStages.STARTING : actionStages.NOT_STARTED,
  };
};

export default useShipDockingManager;
