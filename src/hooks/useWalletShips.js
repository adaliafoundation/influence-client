import esb from 'elastic-builder';
import { Entity } from '@influenceth/sdk';

import useSession from '~/hooks/useSession';
import useCrewContext from '~/hooks/useCrewContext';
import api from '~/lib/api';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { entitiesCacheKey } from '~/lib/cacheKey';

// TODO: should we filter out disabled ships? not a thing yet
//  what about under_construction ships?

const useWalletShips = () => {
  const { accountAddress } = useSession();
  const { accountCrewIds, loading: crewsLoading } = useCrewContext();

  const query = useMemo(() => {
    if (!accountAddress || crewsLoading) return null;

    try {
      const qb = esb.boolQuery();
      qb.should([
        esb.termQuery('Nft.owner', accountAddress),
        esb.termsQuery('Control.controller.id', accountCrewIds),
      ]);
      
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
    queryKey: entitiesCacheKey(Entity.IDS.SHIP, { owner: accountAddress, controllerId: accountCrewIds }),
    queryFn: async () => {
      const response = await api.searchAssets('ships', query);
      return response?.hits || [];
    },
    enabled: !!query
  });
};

export default useWalletShips;
