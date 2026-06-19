import { useQuery } from '@tanstack/react-query';
import { Entity } from '@influenceth/sdk';

import api from '~/lib/api';
import { entitiesCacheKey } from '~/lib/cacheKey';

const useCrewmates = (ids) => {
  return useQuery({
    queryKey: entitiesCacheKey(Entity.IDS.CREWMATE, ids?.join(',')), // TODO: joined key
    queryFn: async () => {
      const crewmates = await api.getCrewmates(ids);
      return ids.map((id) => crewmates.find((c) => c.id === id)); // sort by order of ids
    },
    enabled: ids?.length > 0
  });
};

export default useCrewmates;
