import { useQuery } from '@tanstack/react-query';
import { Entity } from '@influenceth/sdk';

import api from '~/lib/api';
import { entitiesCacheKey } from '~/lib/cacheKey';

const useOwnedCrews = (accountAddress) => {
  return useQuery({
    queryKey: entitiesCacheKey(Entity.IDS.CREW, { owner: accountAddress }),
    queryFn: () => api.getOwnedCrews(accountAddress),
    enabled: !!accountAddress
  });
};

export default useOwnedCrews;
