import { useCallback, useMemo } from 'react';
import { Inventory } from '@influenceth/sdk';

import { UnplanBuildingIcon } from '~/components/Icons';
import useConstructionManager from '~/hooks/actionManagers/useConstructionManager';
import ActionButton, { getCrewDisabledReason } from './ActionButton';

const labelDict = {
  PLANNED: 'Remove Building Site',
  CANCELING: 'Removing Site...'
};

const isVisible = ({ accountCrewIds, constructionStatus, crew, lot }) => {
  return crew && lot && lot.building
    && accountCrewIds?.includes(lot.building.Control?.controller?.id)
    && ['PLANNED', 'CANCELING'].includes(constructionStatus);
};

const UnplanBuilding = ({ asteroid, crew, lot, onSetAction, _disabled }) => {
  const { constructionStatus } = useConstructionManager(lot?.id);
  const handleClick = useCallback(() => {
    onSetAction('UNPLAN_BUILDING');
  }, [onSetAction]);

  const siteEmpty = useMemo(() => {
    const inv = (lot?.building?.Inventories || []).find((i) => Inventory.TYPES[i.inventoryType].category === Inventory.CATEGORIES.SITE);
    return ((inv?.mass + inv?.reservedMass) === 0);
  }, [lot?.building]);

  const disabledReason = useMemo(() => {
    if (_disabled) return 'loading...';
    if (!siteEmpty) return 'not empty';
    return getCrewDisabledReason({ asteroid, crew, requireReady: false });
  }, [_disabled, asteroid, crew, siteEmpty]);

  return (
    <ActionButton
      label={labelDict[constructionStatus]}
      labelAddendum={disabledReason}
      flags={{
        disabled: disabledReason,
        loading: constructionStatus === 'CANCELING'
      }}
      icon={<UnplanBuildingIcon />}
      onClick={handleClick} />
  );
};

const actionDefinition = { Component: UnplanBuilding, isVisible };

export default actionDefinition;