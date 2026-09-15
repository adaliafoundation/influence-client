import { useCallback, useMemo } from 'react';
import { Permission } from '@influenceth/sdk';

import { LaunchShipIcon } from '~/components/Icons';
import ActionButton, { getCrewDisabledReason } from './ActionButton';
import useShipDockingManager from '~/hooks/actionManagers/useShipDockingManager';
import theme from '~/theme';
import useHydratedCrew from '~/hooks/useHydratedCrew';

const isVisible = ({ accountCrewIds, building, lot, ship }) => {
  if (ship && !accountCrewIds?.includes(ship?.Control?.controller?.id)) {
    // if someone else's ship is in my building...
    if (ship.Location?.location?.uuid === building?.uuid && accountCrewIds?.includes(building?.Control?.controller?.id)) {
      return true;
    }
    // if someone else's ship is on my lot...
    if (ship.Location?.location?.uuid === lot?.uuid && accountCrewIds?.includes(lot?.Control?.controller?.id)) {
      return true;
    }
  }
  return false;
};

const EjectShip = ({ asteroid, blockTime, crew, lot, ship, onSetAction, _disabled }) => {
  const { currentUndockingAction } = useShipDockingManager(ship?.id);
  const handleClick = useCallback(() => {
    onSetAction('LAUNCH_SHIP', { shipId: ship?.id });
  }, [onSetAction, ship?.id]);

  const { data: shipController } = useHydratedCrew(ship?.Control?.controller?.id);

  const disabledReason = useMemo(() => {
    if (_disabled) return 'loading...';
    if (lot?.building) {
      // cannot force eject if ship has permission to be there
      // NOTE: do not need to check on lot perms since done implicitly by lot controller check
      const perm = Permission.getPolicyDetails(lot?.building, shipController, blockTime)[Permission.IDS.DOCK_SHIP];
      if (perm.crewStatus === 'controller' || perm.crewStatus === 'granted') return 'access restricted';
    }
    return getCrewDisabledReason({ asteroid, crew, requireSurface: false });
  }, [_disabled, asteroid, blockTime, crew, shipController]);

  return (
    <ActionButton
      label="Force Launch Ship"
      overrideColor={theme.colors.error}
      overrideBgColor={theme.colors.backgroundRed}
      labelAddendum={disabledReason}
      flags={{
        disabled: disabledReason,
        loading: !!currentUndockingAction,
      }}
      icon={<LaunchShipIcon />}
      onClick={handleClick} />
  );
};

const actionDefinition = { Component: EjectShip, isVisible };

export default actionDefinition;