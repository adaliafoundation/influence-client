import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Entity, Permission, Ship } from '@influenceth/sdk';

import useCrewContext from '~/hooks/useCrewContext';
import api from '~/lib/api';
import useStore from './useStore';
import { reportFailure } from '../lib/errorReporting';
import { entitiesCacheKey } from '~/lib/cacheKey';
import { inventoryCandidateAffected, inventoryTypesForSelection, selectInventoryCandidates } from '../lib/inventoryCandidates';

const useAccessibleAsteroidInventories = (asteroidId, options) => {
  const { crew, authorize } = useCrewContext();
  const queryClient = useQueryClient();
  const notify = useStore(state => state.dispatchAlertLogged);
  const { isSourcing, limitToPrimary, limitToControlled, crewedShip, productIds: requestedProductIds, excludeSites, itemIds, itemIdsRequireAllAllowed, otherEntity, otherInvSlot } = options;
  const productIds = useMemo(() => [...new Set((requestedProductIds || []).map(Number))].sort((a, b) => a - b), [requestedProductIds]);
  const inventoryTypes = useMemo(() => inventoryTypesForSelection({ excludeSites, itemIds, itemIdsRequireAllAllowed }),
    [excludeSites, itemIds, itemIdsRequireAllAllowed]);
  const search = { inventoryTypes, productIds, isSourcing: !!isSourcing };
  const enabled = !!asteroidId && !limitToPrimary && inventoryTypes.length > 0;
  const meta = label => ({ affectsEntity: change => inventoryCandidateAffected(change, label, asteroidId,
    queryClient.getQueryData(['entity', change.label, Number(change.id)])) });
  const buildingsQuery = useQuery({
    queryKey: [...entitiesCacheKey(Entity.IDS.BUILDING, { asteroidId: Number(asteroidId), hasComponent: 'Inventories' }), search],
    queryFn: () => api.getAsteroidBuildingInventoryCandidates(asteroidId, search),
    enabled,
    meta: meta(Entity.IDS.BUILDING)
  });
  const shipsQuery = useQuery({
    queryKey: [...entitiesCacheKey(Entity.IDS.SHIP, { asteroidId: Number(asteroidId), hasComponent: 'Inventories', isOnSurface: true, status: Ship.STATUSES.AVAILABLE }), search],
    queryFn: () => api.getAsteroidShipInventoryCandidates(asteroidId, search),
    enabled,
    meta: meta(Entity.IDS.SHIP)
  });
  const error = enabled && (buildingsQuery.error || shipsQuery.error);
  useEffect(() => {
    if (error) reportFailure(notify, error, { message: 'inventoryLoadFailed' });
  }, [error, notify]);
  const candidates = useMemo(() => selectInventoryCandidates(
    limitToPrimary ? [limitToPrimary] : [...(enabled ? buildingsQuery.data || [] : []), ...(enabled ? shipsQuery.data || [] : []), ...(crewedShip ? [crewedShip] : [])],
    { inventoryTypes, productIds, isSourcing, otherEntity, otherInvSlot }
  ), [limitToPrimary, enabled, buildingsQuery.data, shipsQuery.data, crewedShip, inventoryTypes, productIds, isSourcing, otherEntity, otherInvSlot]);
  const permission = isSourcing ? Permission.IDS.REMOVE_PRODUCTS : Permission.IDS.ADD_PRODUCTS;
  return useMemo(() => {
    let checking = false;
    const data = [];
    candidates.forEach(entity => {
      const control = authorize('controls', [crew, entity], [crew, entity]);
      if (limitToControlled && control.status === 'denied') return;
      const access = authorize('can', [crew, entity, permission], [crew, entity]);
      if (access.status === 'denied') return;
      if (access.status !== 'allowed' || control.status === 'unresolved') {
        checking = true;
        return;
      }
      data.push({ ...entity, _authorization: access, _controlAuthorization: control });
    });
    return { data, checking, isLoading: enabled && (buildingsQuery.isLoading || shipsQuery.isLoading),
      isError: enabled && (buildingsQuery.isError || shipsQuery.isError) };
  }, [candidates, authorize, crew, permission, limitToControlled, enabled, buildingsQuery.isLoading, shipsQuery.isLoading, buildingsQuery.isError, shipsQuery.isError]);
};

export default useAccessibleAsteroidInventories;
