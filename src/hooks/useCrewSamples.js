import { useQuery } from '@tanstack/react-query';
import { Entity } from '@influenceth/sdk';

import api from '~/lib/api';
import useCrewContext from './useCrewContext';
import { entitiesCacheKey } from '~/lib/cacheKey';

const useCrewSamples = () => {
  const { crew } = useCrewContext();

  const controllerId = crew?.id;
  return useQuery({
    queryKey: entitiesCacheKey(Entity.IDS.DEPOSIT, { controllerId, isDepleted: false }),
    queryFn: () => api.getCrewSamples(controllerId),
    enabled: !!controllerId
  });
};

export default useCrewSamples;
