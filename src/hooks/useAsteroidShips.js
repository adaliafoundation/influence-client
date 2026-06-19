import { useQuery } from '@tanstack/react-query';
import { Entity, Ship } from '@influenceth/sdk';

import api from '~/lib/api';
import { entitiesCacheKey } from '~/lib/cacheKey';

const useAsteroidShips = (asteroidId) => {
  return useQuery({
    queryKey: entitiesCacheKey(Entity.IDS.SHIP, { asteroidId: Number(asteroidId), status: Ship.STATUSES.AVAILABLE }),
    queryFn: () => api.getAsteroidShips(asteroidId),
    enabled: !!asteroidId
  });
};

export default useAsteroidShips;
