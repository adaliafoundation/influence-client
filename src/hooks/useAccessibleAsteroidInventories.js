import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Entity, Permission, Ship } from '@influenceth/sdk';

import useCrewContext from '~/hooks/useCrewContext';
import api from '~/lib/api';
import { entitiesCacheKey } from '~/lib/cacheKey';

const useAccessibleAsteroidInventories = (asteroidId, isSourcing) => {
  const { crew, authorize } = useCrewContext();
  const permission = isSourcing ? Permission.IDS.REMOVE_PRODUCTS : Permission.IDS.ADD_PRODUCTS;

  const { data: buildings, isLoading: buildingsLoading, dataUpdatedAt: buildingsUpdatedAt } = useQuery({
    queryKey: entitiesCacheKey(Entity.IDS.BUILDING, { asteroidId: Number(asteroidId), hasComponent: 'Inventories' }),
    queryFn: () => api.getAsteroidBuildingInventoryCandidates(asteroidId),
    enabled: !!asteroidId
  });

  const { data: ships, isLoading: shipsLoading, dataUpdatedAt: shipsUpdatedAt } = useQuery({
    queryKey: entitiesCacheKey(Entity.IDS.SHIP, { asteroidId: Number(asteroidId), hasComponent: 'Inventories', isOnSurface: true, status: Ship.STATUSES.AVAILABLE }),
    queryFn: () => api.getAsteroidShipInventoryCandidates(asteroidId),
    enabled: !!asteroidId
  });

  return useMemo(() => ({
    data: buildingsLoading || shipsLoading ? undefined : [...(buildings || []), ...(ships || [])].map((entity) => ({
      ...entity,
      _authorization: authorize('can', [crew, entity, permission], [crew, entity]),
      _controlAuthorization: authorize('controls', [crew, entity], [crew, entity])
    })).filter((entity) => entity._authorization.status !== 'denied'),
    isLoading: buildingsLoading || shipsLoading
  }), [buildings, ships, buildingsLoading, shipsLoading, buildingsUpdatedAt, shipsUpdatedAt, authorize, crew, permission]);
};

export default useAccessibleAsteroidInventories;
