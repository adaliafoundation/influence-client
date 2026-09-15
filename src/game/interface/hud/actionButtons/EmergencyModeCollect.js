import { useCallback, useEffect, useMemo, useState } from 'react';
import { Inventory, Product, Ship, Time } from '@influenceth/sdk';

import { EmergencyModeCollectIcon } from '~/components/Icons';
import useShip from '~/hooks/useShip';
import ActionButton, { getCrewDisabledReason } from './ActionButton';

const resourceId = Product.IDS.HYDROGEN_PROPELLANT;

const isVisible = ({ crew, ship }) => {
  if (!ship && crew?.Ship?.emergencyAt > 0) return true;
  if (ship && crew?._location?.shipId === ship.id && ship.Ship?.emergencyAt > 0) return true;
  return false;
};

const EmergencyModeCollect = ({ crew, onSetAction, _disabled }) => {
  const { data: maybeShip } = useShip(crew?._location?.shipId);

  const ship = useMemo(() => {
    return (!maybeShip && crew?.Ship?.emergencyAt > 0) ? crew : maybeShip;
  }, [maybeShip]);

  const handleClick = useCallback(() => {
    onSetAction('EMERGENCY_MODE_COLLECT');
  }, [onSetAction]);

  const [hasGeneratedMax, setHasGeneratedMax] = useState();

  const {
    hasCollectedMax,
    finishTime,
  } = useMemo(() => {
    const shipConfig = Ship.TYPES[ship.Ship.shipType];
    const propellantInventory = ship.Inventories.find((i) => i.slot === shipConfig.propellantSlot);
    const propellantInventoryConfig = Inventory.getType(propellantInventory.inventoryType, crew?._inventoryBonuses);
    const startingAmount = propellantInventory.mass / Product.TYPES[resourceId].massPerUnit;
    const maxTankAmount = propellantInventoryConfig.massConstraint / Product.TYPES[resourceId].massPerUnit;
    const maxEmergencyAmount = shipConfig.emergencyPropellantCap * maxTankAmount;
    const finishTime = (ship?.Ship?.emergencyAt || 0)
      + Time.toRealDuration(Ship.Entity.getTimeUntilEmergencyPropellantFull(ship), crew?._inventoryBonuses);
    return {
      hasCollectedMax: startingAmount >= maxEmergencyAmount,
      finishTime,
    };
  }, [crew, resourceId, ship]);

  useEffect(() => {
    const now = Date.now() / 1000;
    if (finishTime > now) {
      setHasGeneratedMax(false);
      const to = setTimeout(() => {
        setHasGeneratedMax(true);
      }, 1000 * (finishTime - now));
      return () => clearTimeout(to);
    } else {
      setHasGeneratedMax(true);
    }
  }, [finishTime]);

  const disabledReason = useMemo(() => {
    if (_disabled) return 'loading...';
    if (!ship) return 'ship is not crewed';
    if (ship.Ship?.transitDestination) return 'ship is in flight';
    if (hasCollectedMax) return 'max reached';
    return getCrewDisabledReason({ crew });
  }, [_disabled, crew, hasCollectedMax, ship]);

  return (
    <ActionButton
      label="Collect Emergency Propellant"
      labelAddendum={disabledReason || (hasGeneratedMax ? undefined : 'generating...')}
      flags={{
        attention: hasGeneratedMax && !hasCollectedMax,
        disabled: disabledReason,
        loading: (!disabledReason && !hasGeneratedMax),
        finishTime
      }}
      icon={<EmergencyModeCollectIcon />}
      onClick={handleClick} />
  );
};

const actionDefinition = { Component: EmergencyModeCollect, isVisible };

export default actionDefinition;