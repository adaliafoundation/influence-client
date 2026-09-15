import { useCallback, useMemo } from 'react';
import { Inventory, Permission } from '@influenceth/sdk';

import { MultiSellIcon } from '~/components/Icons';
import useMarketplaceManager from '~/hooks/actionManagers/useMarketplaceManager';
import ActionButton, { getCrewDisabledReason } from './ActionButton';
import useCrewContext from '~/hooks/useCrewContext';

const isVisible = ({ crew, lot, ship }) => false;

const MultiSell = ({ asteroid, blockTime, crew, lot, ship, onSetAction, dialogProps = {}, _disabled, _disabledReason }) => {
  const { pendingTransactions } = useCrewContext();
  const origin = useMemo(() => ship || lot?.surfaceShip || lot?.building, [ship, lot]);
  const pendingAction = useMemo(() => {
    return !!(pendingTransactions || []).find((tx) => tx.key === 'EscrowWithdrawalAndFillBuyOrders' && tx.meta?.originLotId === lot?.id);
  }, [lot?.id, pendingTransactions]);

  const handleClick = useCallback(() => {
    onSetAction('SELLING_LIST', { origin, ...dialogProps }); // originSlot (if not set, use primary)
  }, [dialogProps, origin]);

  const disabledReason = useMemo(() => {
    if (_disabledReason) return _disabledReason;
    if (_disabled) return 'loading...';
    if (pendingAction) return 'transacting...';
    
    const hasMass = (origin.Inventories || []).find((i) => i.status === Inventory.STATUSES.AVAILABLE && i.mass > 0);
    if (!hasMass) return 'inventory empty';

    return getCrewDisabledReason({
      asteroid, blockTime, crew, permission: Permission.IDS.REMOVE_PRODUCTS, permissionTarget: origin, requireReady: false
    });
  }, [asteroid, blockTime, crew, _disabled, _disabledReason, pendingAction]);

  return (
    <ActionButton
      label="Market Sell Selected"
      labelAddendum={disabledReason}
      flags={{
        disabled: _disabled || disabledReason,
        loading: pendingAction
      }}
      icon={<MultiSellIcon />}
      onClick={handleClick} />
  );
};

const actionDefinition = { Component: MultiSell, isVisible };

export default actionDefinition;