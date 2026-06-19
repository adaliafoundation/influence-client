import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Entity } from '@influenceth/sdk';

import api from '~/lib/api';
import useEntities from '~/hooks/useEntities';

const useCrewOrders = (controllerId) => {
  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: [ 'crewOpenOrders', controllerId ],
    queryFn: () => api.getCrewOpenOrders(controllerId),
    enabled: !!controllerId
  });

  const exchangeIds = useMemo(() => Array.from(new Set((orders || []).map((o) => o.entity.id))), [orders]);
  const { data: exchanges, isLoading: exchangesLoading, dataUpdatedAt } = useEntities({
    ids: exchangeIds,
    label: Entity.IDS.BUILDING
  });

  return useMemo(() => {
    const isLoading = ordersLoading || exchangesLoading;
    return {
      data: isLoading
        ? undefined
        : (orders || []).map((o) => ({
          ...o,
          marketplace: exchanges.find(e => Number(e.id) === Number(o.entity.id))
        })),
      isLoading
    }
  }, [exchanges, exchangesLoading, orders, ordersLoading, dataUpdatedAt]);
};

export default useCrewOrders;
