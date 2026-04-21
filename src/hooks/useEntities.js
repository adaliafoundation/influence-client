import { useQuery } from '@tanstack/react-query';

import api from '~/lib/api';
import { entitiesCacheKey } from '~/lib/cacheKey';

const useEntities = (props) => {
  const { label, ids } = props || {};
  return useQuery({
    queryKey: entitiesCacheKey(label, ids?.join(',')),
    queryFn: () => api.getEntities({ label, ids }),
    enabled: !!(label && ids?.length > 0)
  });
};

export default useEntities;
