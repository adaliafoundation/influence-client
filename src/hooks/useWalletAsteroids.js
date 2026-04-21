import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import esb from 'elastic-builder';
import { Entity } from '@influenceth/sdk';

import useSession from '~/hooks/useSession';
import useCrewContext from '~/hooks/useCrewContext';
import api from '~/lib/api';
import { entitiesCacheKey } from '~/lib/cacheKey';

const useWalletAsteroids = () => {
  const { accountAddress } = useSession();
  const { accountCrewIds, loading: crewsLoading } = useCrewContext();

  const query = useMemo(() => {
    if (!accountAddress || crewsLoading) return null;

    try {
      const qb = esb.boolQuery();
      qb.should([
        esb.termQuery('Nft.owner', accountAddress),
        esb.termsQuery('Control.controller.id', accountCrewIds),
        // esb.termsQuery('id', [1,12,123,1234,1234,12345,123456])  // TODO: remove this debug line
      ]);
      
      const q = esb.requestBodySearch();
      q.query(qb);
      q.source({ excludes: [ 'AsteroidProof' ]});
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
    queryKey: entitiesCacheKey(Entity.IDS.ASTEROID, { owner: accountAddress, controllerId: accountCrewIds }),
    queryFn: async () => {
      const response = await api.searchAssets('asteroids', query);
      return response?.hits || [];
    },
    enabled: !!query
  });
};

export default useWalletAsteroids;
