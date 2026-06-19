import esb from 'elastic-builder';
import { Building, Entity } from '@influenceth/sdk';

import useSession from '~/hooks/useSession';
import useCrewContext from '~/hooks/useCrewContext';
import api from '~/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { entitiesCacheKey } from '~/lib/cacheKey';

export const statuses = [
  Building.CONSTRUCTION_STATUSES.PLANNED,
  Building.CONSTRUCTION_STATUSES.UNDER_CONSTRUCTION,
  Building.CONSTRUCTION_STATUSES.OPERATIONAL,
];

const useWalletBuildings = () => {
  const { accountAddress } = useSession();
  const { accountCrewIds, loading: crewsLoading } = useCrewContext();

  const query = useMemo(() => {
    if (!accountAddress || crewsLoading) return null;

    try {
      const qb = esb.boolQuery();
      qb.filter(esb.termsQuery('Control.controller.id', accountCrewIds));
      qb.mustNot(esb.termQuery('Building.status', Building.CONSTRUCTION_STATUSES.UNPLANNED));
      
      const q = esb.requestBodySearch();
      q.query(qb);
      q.from(0);
      q.size(10000);
      q.trackTotalHits(true);

      return q.toJSON();
    } catch (e) {
      console.error(e);
    }

    return null;
  }, [accountAddress, accountCrewIds, crewsLoading]);

  return useQuery({
    queryKey: entitiesCacheKey(Entity.IDS.BUILDING, { controllerId: accountCrewIds, status: statuses }),
    queryFn: async () => {
      const response = await api.searchAssets('buildings', query);
      return response?.hits || [];
    },
    enabled: !!query
  });
};

export default useWalletBuildings;
