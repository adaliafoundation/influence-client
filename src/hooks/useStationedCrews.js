import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Entity } from '@influenceth/sdk';

import api from '~/lib/api';
import { entitiesCacheKey } from '~/lib/cacheKey';
import { locationsArrToObj } from '~/lib/utils';

const useStationedCrews = (entityId) => {
  const entityUuid = useMemo(() => entityId ? Entity.packEntity(entityId) : undefined, [entityId]);
  const { data: stationedCrews, isLoading: crewsLoading, dataUpdatedAt: crewsUpdatedAt } = useQuery({
    queryKey: entitiesCacheKey(Entity.IDS.CREW, { stationUuid: entityUuid }),
    queryFn: () => api.getEntities({ match: { 'Location.location.uuid': entityUuid }, label: Entity.IDS.CREW }),
    enabled: !!entityUuid
  });

  return useMemo(() => {
    if (crewsLoading) {
      return { data: undefined, isLoading: true };
    }

    return { 
      data: (stationedCrews || []).map((c) => ({
        ...c,
        _location: locationsArrToObj(c?.Location?.locations || [])
      })),
      isLoading: false
    }
  }, [crewsLoading, stationedCrews, crewsUpdatedAt]);
};

export default useStationedCrews;
