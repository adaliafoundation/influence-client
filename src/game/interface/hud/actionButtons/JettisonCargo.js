import { useCallback, useMemo } from 'react';
import { Inventory, Permission } from '@influenceth/sdk';

import { JettisonCargoIcon } from '~/components/Icons';
import useJettisonCargoManager from '~/hooks/actionManagers/useJettisonCargoManager';
import theme from '~/theme';
import ActionButton, { getCrewDisabledReason } from './ActionButton';

const isVisible = ({ crew, lot, ship }) => false;
/* IF WANT TO EXPOSE IN MAIN TRAY: {
  const entity = ship || lot?.surfaceShip || lot?.building;
  return crew && ((entity?.Inventories || []).find((i) => i.status === Inventory.STATUSES.AVAILABLE));
};*/

const JettisonCargo = ({ asteroid, blockTime, crew, lot, ship, onSetAction, dialogProps = {}, _disabled, _disabledReason }) => {
  const origin = useMemo(() => ship || lot?.surfaceShip || lot?.building, [ship, lot]);
  const { currentJettison } = useJettisonCargoManager(origin);

  const handleClick = useCallback(() => {
    onSetAction('JETTISON_CARGO', { origin, ...dialogProps });
  }, [dialogProps, origin]);

  const disabledReason = useMemo(() => {
    if (_disabledReason) return _disabledReason;
    if (_disabled) return 'loading...';
    if (currentJettison) return 'jettisoning...';
    
    const hasMass = (origin.Inventories || []).find((i) => i.status === Inventory.STATUSES.AVAILABLE && i.mass > 0);
    if (!hasMass) return 'inventory empty';

    return getCrewDisabledReason({
      asteroid,
      blockTime,
      crew,
      permission: Permission.IDS.REMOVE_PRODUCTS,
      permissionTarget: origin,
      requireReady: false
    });
  }, [asteroid, blockTime, crew, _disabled, _disabledReason, currentJettison]);

  return (
    <ActionButton
      label="Jettison Selected"
      labelAddendum={disabledReason}
      flags={{
        disabled: _disabled || disabledReason,
        loading: currentJettison
      }}
      icon={<JettisonCargoIcon />}
      onClick={handleClick}
      overrideColor={theme.colors.red} />
  );
};

const actionDefinition = { Component: JettisonCargo, isVisible };

export default actionDefinition;