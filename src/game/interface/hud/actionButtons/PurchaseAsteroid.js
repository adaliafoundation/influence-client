import { useCallback, useMemo } from 'react';
import { useHistory } from 'react-router-dom';
import { Entity } from '@influenceth/sdk';

import { PurchaseAsteroidIcon } from '~/components/Icons';
import useBuyAsteroid from '~/hooks/actionManagers/useBuyAsteroid';
import ActionButton from './ActionButton';
import useSale from '~/hooks/useSale';

const isVisible = ({ asteroid, lot }) => {
  if (lot) return false;
  return asteroid && !asteroid.Nft?.owner;
};

const PurchaseAsteroid = ({ asteroid, _disabled }) => {
  const history = useHistory();
  const { buying } = useBuyAsteroid(Number(asteroid?.id));
  const saleIsActive = useSale(Entity.IDS.ASTEROID);

  const handleClick = useCallback(() => {
    history.push(`/asteroids/${asteroid?.id}`);
  }, [asteroid?.id]);

  let disabledReason = useMemo(() => {
    if (_disabled) return 'loading...';
    if (!saleIsActive) return 'sale is currently closed';
  }, [_disabled, saleIsActive]);

  return (
    <ActionButton
      label="Purchase Asteroid"
      labelAddendum={disabledReason}
      flags={{
        disabled: disabledReason || buying,
        loading: buying
      }}
      icon={<PurchaseAsteroidIcon />}
      onClick={handleClick} />
  );
};

const actionDefinition = { Component: PurchaseAsteroid, isVisible };

export default actionDefinition;
