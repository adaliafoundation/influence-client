import { useCallback, useMemo } from 'react';
import { Entity } from '@influenceth/sdk';

import { LaunchShipIcon } from '~/components/Icons';
import useCrewContext from '~/hooks/useCrewContext';
import useStationedCrews from '~/hooks/useStationedCrews';
import useReadyAtWatcher from '~/hooks/useReadyAtWatcher';
import useDeliveryManager from '~/hooks/actionManagers/useDeliveryManager';
import useShipDockingManager from '~/hooks/actionManagers/useShipDockingManager';
import ActionButton, { getCrewDisabledReason } from './ActionButton';
import useCoachmarkRefSetter from '~/hooks/useCoachmarkRefSetter';
import { COACHMARK_IDS } from '~/contexts/CoachmarkContext';

const isVisible = ({ crew, ship }) => {
  return crew && ship
    && ship.Control?.controller?.id === crew.id // i am the designated flight crew
    && ship._location.lotId  // on surface
};

const LaunchShip = ({ asteroid, blockTime, lot, onSetAction, _disabled, simulation, simulationActions, ...props }) => {
  const { crew } = useCrewContext();
  const setCoachmarkRef = useCoachmarkRefSetter();

  const crewedShip = useMemo(() => lot?.ships?.find((s) => s.id === crew?._location?.shipId), [crew?._location?.shipId]);
  const ship = useMemo(() => props.ship || crewedShip, [crewedShip, props.ship]);

  const { data: shipCrews } = useStationedCrews(ship);

  const { currentUndockingAction } = useShipDockingManager(ship?.id);
  const { currentDeliveries } = useDeliveryManager(ship?.id ? { destination: { label: Entity.IDS.SHIP, id: ship?.id } } : {});
  const shipReady = useReadyAtWatcher(ship?.Ship?.readyAt);

  const handleClick = useCallback(() => {
    onSetAction('LAUNCH_SHIP', { shipId: ship?.id });
  }, [ship?.id]);

  const disabledReason = useMemo(() => {
    if (_disabled) return 'loading...';
    if (ship?.id !== crewedShip?.id) return 'ship is not crewed';
    if (!shipReady) return 'ship is busy';

    // disable if waiting on delivery
    const invReserved = (ship?.Inventories || []).find((i) => i.reservedMass > 0)
      || currentDeliveries?.length > 0;
    if (invReserved) return 'delivery or order pending';

    // check if any guest crews busy
    if ((shipCrews || []).some((c) => c.id !== ship?.Control?.controller?.id && c.Crew?.readyAt > blockTime)) {
      return 'guest crews busy';
    }

    return getCrewDisabledReason({ asteroid, crew, isAllowedInSimulation: simulationActions.includes('LaunchShip') });
  }, [_disabled, blockTime, crew, crewedShip, currentDeliveries, ship, shipCrews, shipReady, simulationActions]);

  return (
    <ActionButton
      ref={setCoachmarkRef(COACHMARK_IDS.actionButtonLaunchShip)}
      label="Launch Ship"
      labelAddendum={disabledReason}
      flags={{
        attention: simulation && !disabledReason,
        disabled: disabledReason,
        loading: !!currentUndockingAction,
      }}
      icon={<LaunchShipIcon />}
      onClick={handleClick} />
  );
};

const actionDefinition = { Component: LaunchShip, isVisible };

export default actionDefinition;