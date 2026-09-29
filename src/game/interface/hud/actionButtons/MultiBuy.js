import useCrewContext from '~/hooks/useCrewContext';
import { useCallback, useMemo } from 'react';
import { Permission } from '@influenceth/sdk';

import { MultiBuyIcon } from '~/components/Icons';
import useMarketplaceManager from '~/hooks/actionManagers/useMarketplaceManager';
import ActionButton, { getCrewDisabledReason } from './ActionButton';

const isVisible = () => false;

const MultiBuy = ({ asteroid, blockTime, crew, lot, ship, onSetAction, dialogProps = {}, _disabled, _disabledReason }) => {
  const { crewAuthorization } = useCrewContext();
  const destination = useMemo(() => ship || lot?.surfaceShip || lot?.building, [ship, lot]);
  const { pendingAction } = useMarketplaceManager(destination.id);

  const handleClick = useCallback(() => {
    onSetAction('SHOPPING_LIST', { destination, ...dialogProps }); // TODO: destinationSlot (if not set, use primary)
  }, [crewAuthorization, destination, dialogProps]);

  const disabledReason = useMemo(() => {
    if (_disabledReason) return _disabledReason;
    if (_disabled) return 'loading...';
    if (pendingAction) return 'transacting...';

    return getCrewDisabledReason({ crewAuthorization,
      asteroid, blockTime, crew, permission: Permission.IDS.ADD_PRODUCTS, permissionTarget: destination, requireReady: false
    });
  }, [crewAuthorization, asteroid, blockTime, crew, _disabled, _disabledReason, pendingAction]);

  return (
    <ActionButton
      label="Market Buy Here"
      labelAddendum={disabledReason}
      flags={{
        disabled: _disabled || disabledReason,
        loading: pendingAction
      }}
      icon={<MultiBuyIcon />}
      onClick={handleClick} />
  );
};

const actionDefinition = { Component: MultiBuy, isVisible };

export default actionDefinition;