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
  const { crew, recheckAuthorization } = useCrewContext();
  const { data: ship } = useShip(shipId);
  const { eligibility: ejectionEligibility, recheck } = useShipEjectionEligibility(ship);

  const caller_crew = useMemo(() => ({ id: crew?.id, label: Entity.IDS.CREW }), [crew?.id]);

  const undockShip = useCallback(async (hopperAssisted) => {
    if (!crew?.id || !ship?.Control?.controller?.id || !ship?.Location?.location) return checkingShipEjection;
    const mode = await recheckAuthorization('forceLaunch', [crew, ship], [crew, ship]);
    if (mode.status === 'unresolved') return checkingShipEjection;
    const forced = mode.status === 'allowed';
    if (forced !== isForceLaunch(crew, ship)) return { status: 'blocked', reason: 'Ship controller changed. Review the launch mode.' };
    let launchShip = mode.entities?.find((entity) => entity.label === Entity.IDS.SHIP && Number(entity.id) === Number(ship.id));
    if (!launchShip?.Location?.location) return checkingShipEjection;
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
  }, [caller_crew, crew, execute, recheck, recheckAuthorization, ship]);

  const dockShip = useCallback(async (destination, hopperAssisted, destLotId) => {
    const control = await recheckAuthorization('controls', [crew, ship], [crew, ship]);
    if (control.status !== 'allowed') return control;
    if (destination.label === Entity.IDS.BUILDING) {
      const permission = await recheckAuthorization('spaceportProtection', [crew, ship, destination], [crew, ship, destination]);
      if (permission.status !== 'allowed') return permission;
    }
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
  }, [caller_crew, execute, crew, ship, recheckAuthorization, shipId]);

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
