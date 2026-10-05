import { useCallback, useMemo } from 'react';

import { LaunchShipIcon } from '~/components/Icons';
import ActionButton from './ActionButton';
import useShipDockingManager from '~/hooks/actionManagers/useShipDockingManager';
import theme from '~/theme';
import { isForceLaunch, isLandedShip } from '~/lib/shipEjectionEligibility';

const isVisible = ({ crew, ship }) => isForceLaunch(crew, ship) && isLandedShip(ship);

const EjectShip = ({ ship, onSetAction, _disabled }) => {
  const { currentUndockingAction, ejectionEligibility } = useShipDockingManager(ship?.id);
  const handleClick = useCallback(() => {
    onSetAction('LAUNCH_SHIP', { shipId: ship?.id });
  }, [onSetAction, ship?.id]);

  const disabledReason = useMemo(() => {
    if (_disabled) return 'loading...';
    return ejectionEligibility.status === 'allowed' ? null : ejectionEligibility.status === 'checking' || ejectionEligibility.reason;
  }, [_disabled, ejectionEligibility]);

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