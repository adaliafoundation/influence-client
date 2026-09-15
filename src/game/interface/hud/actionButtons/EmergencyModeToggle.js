import { useCallback, useMemo } from 'react';
import { Crew, Time } from '@influenceth/sdk';

import { EmergencyModeEnterIcon, EmergencyModeExitIcon } from '~/components/Icons';
import useShip from '~/hooks/useShip';
import useShipEmergencyManager from '~/hooks/actionManagers/useShipEmergencyManager';
import ActionButton, { getCrewDisabledReason } from './ActionButton';
import useReadyAtWatcher from '~/hooks/useReadyAtWatcher';

const isVisible = ({ blockTime, crew, crewedShip, ship }) => {
  if (!crew || !crewedShip || !ship) return false; // invisible if no ship or crew
  if (crewedShip.Control?.controller?.id !== crew.id) return false; // invisible if not my ship
  if (crew && ship && crew._location.shipId === ship.id) {
    // if already in emode, show so can toggle off
    if (ship.Ship.emergencyAt > 0) return true;

    // hide if food is not low
    if (blockTime > 0 && crew) {
      const lastFedAgo = Time.toGameDuration(blockTime - (crew.Crew?.lastFed || 0), parseInt(crew._timeAcceleration) || 1);
      const foodRatio = Crew.getCurrentFoodRatio(lastFedAgo, crew._foodBonuses?.consumption);
      if (foodRatio > 0.5) return false;
    }

    return true;
  }
  return false;
};

const EmergencyModeToggle = ({ crew, onSetAction, _disabled }) => {
  const manager = useShipEmergencyManager();
  const { data: crewedShip } = useShip(crew?._location?.shipId);
  const ready = useReadyAtWatcher(crewedShip?.Ship?.readyAt);

  const handleClick = useCallback(() => {
    onSetAction('EMERGENCY_MODE_TOGGLE');
  }, [onSetAction]);

  const disabledReason = useMemo(() => {
    if (_disabled) return 'loading...';
    if (!crewedShip) return 'ship is not crewed';
    if (crewedShip?._location.lotId || crewedShip?._location.spaceId) return 'must be in orbit';
    if (!ready) return 'ship is busy';
    if (crew.Crew?.roster?.length < crewedShip.Station?.population) return 'must eject passenger crew';
    return getCrewDisabledReason({ crew });
  }, [_disabled, crewedShip, ready]);

  return (
    <ActionButton
      label={`${crewedShip?.Ship?.emergencyAt > 0 ? 'Exit' : 'Enter'} Emergency Mode`}
      labelAddendum={disabledReason}
      flags={{
        disabled: disabledReason || undefined,
        loading: manager.isActivating || manager.isDeactivating,
      }}
      icon={crewedShip?.Ship?.emergencyAt > 0 ? <EmergencyModeExitIcon /> : <EmergencyModeEnterIcon />}
      onClick={handleClick} />
  );
};

const actionDefinition = { Component: EmergencyModeToggle, isVisible };

export default actionDefinition;
