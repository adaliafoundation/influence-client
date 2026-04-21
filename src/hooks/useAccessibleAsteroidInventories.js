import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Entity, Permission, Ship } from '@influenceth/sdk';

import useCrewContext from '~/hooks/useCrewContext';
import api from '~/lib/api';
import { entitiesCacheKey } from '~/lib/cacheKey';

const useAccessibleAsteroidInventories = (asteroidId, isSourcing) => {
  const { crew } = useCrewContext();
  const permission = isSourcing ? Permission.IDS.REMOVE_PRODUCTS : Permission.IDS.ADD_PRODUCTS;

  const permissionCrewId = crew?.id;
  const permissionCrewSiblingIds = crew?._siblingCrewIds || [];
  const permissionAccount = crew?.Crew?.delegatedTo;
  
  const { data: buildings, isLoading: buildingsLoading, dataUpdatedAt: buildingsUpdatedAt } = useQuery({
    queryKey: entitiesCacheKey(Entity.IDS.BUILDING, { asteroidId: Number(asteroidId), hasComponent: 'Inventories', hasPermission: permission, permissionCrewId, permissionAccount }),
    queryFn: () => api.getAsteroidBuildingsWithAccessibleInventories(asteroidId, permissionCrewId, permissionCrewSiblingIds, permissionAccount, permission),
    enabled: !!(asteroidId && permission && permissionCrewId && permissionAccount)
  });

  const { data: ships, isLoading: shipsLoading, dataUpdatedAt: shipsUpdatedAt } = useQuery({
    queryKey: entitiesCacheKey(Entity.IDS.SHIP, { asteroidId: Number(asteroidId), hasComponent: 'Inventories', hasPermission: permission, permissionCrewId, permissionAccount, isOnSurface: true, status: Ship.STATUSES.AVAILABLE }),
    queryFn: () => api.getAsteroidShipsWithAccessibleInventories(asteroidId, permissionCrewId, permissionCrewSiblingIds, permissionAccount, permission),
    enabled: !!(asteroidId && permission && permissionCrewId && permissionAccount)
  });

  return useMemo(() => ({
    data: buildingsLoading || shipsLoading
      ? undefined
      : [...(buildings || []), ...(ships || [])],
    isLoading: buildingsLoading || shipsLoading
  }), [buildings, ships, buildingsLoading, shipsLoading, buildingsUpdatedAt, shipsUpdatedAt])
};

export default useAccessibleAsteroidInventories;
