import { useCallback, useMemo } from 'react';
import { Address } from '@influenceth/sdk';

import { PurchaseEntityIcon } from '~/components/Icons';
import useNftSaleManager from '~/hooks/actionManagers/useNftSaleManager';
import ActionButton from './ActionButton';

const isVisible = ({ account, ship }) => {
  return account && ship?.Nft?.owner
    && !Address.areEqual(account, ship.Nft.owner)
    && ship.Nft.price > 0;
};

const PurchaseEntity = ({ ship, onSetAction, _disabled }) => {
  const { isPendingPurchase } = useNftSaleManager(ship);

  const handleClick = useCallback(() => {
    onSetAction('PURCHASE_ENTITY', { entity: ship });
  }, []);

  let disabledReason = useMemo(() => {
    if (_disabled || isPendingPurchase) return 'loading...';
  }, [_disabled, isPendingPurchase]);

  return (
    <ActionButton
      label="Purchase Ship"
      labelAddendum={disabledReason}
      flags={{
        attention: !disabledReason && !isPendingPurchase,
        disabled: disabledReason,
        loading: isPendingPurchase
      }}
      icon={<PurchaseEntityIcon />}
      onClick={handleClick} />
  );
};

const actionDefinition = { Component: PurchaseEntity, isVisible };

export default actionDefinition;
