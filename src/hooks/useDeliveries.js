import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Entity } from '@influenceth/sdk';

import api from '~/lib/api';
import { safeEntityId } from '~/lib/utils';
import { entitiesCacheKey } from '~/lib/cacheKey';


// cache by endpoint entity + status, filter before response
// (to avoid redundant cache data)
const useDeliveries = ({ destination, destinationSlot, origin, originSlot, status } = {}) => {

  const cacheKey = useMemo(() => {
    const k = {};
    if (destination) k.destination = safeEntityId(destination);
    if (origin) k.origin = safeEntityId(origin);
    if (status) k.status = status;
    return k;
  }, [ destination, origin, status ]);

  const { data: rawData, isLoading, dataUpdatedAt } = useQuery({
    queryKey: entitiesCacheKey(Entity.IDS.DELIVERY, cacheKey),
    queryFn: () => api.getDeliveries(destination, origin, status),
    enabled: !!(destination || origin)
  });

  return useMemo(() => ({
    data: isLoading ? undefined : (rawData || []).filter((d) => {
      if (destinationSlot && d.Delivery?.destSlot !== destinationSlot) return false;
      if (originSlot && d.Delivery.originSlot !== originSlot) return false;
      return true;
    }),
    isLoading
  }), [rawData, isLoading, dataUpdatedAt, destinationSlot, originSlot]);
};

export default useDeliveries;
