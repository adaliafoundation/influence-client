import { useMemo } from 'react';
import useMarketQuery from './useMarketQuery';

import useAsteroidBuildings from '~/hooks/useAsteroidBuildings';
import api from '~/lib/api';

const useOrderSummaryByExchange = (asteroidId, product) => {
  const { data: exchanges, isLoading: isLoadingBuildings } = useAsteroidBuildings(asteroidId, 'Exchange');

  const { data: orderSummaries, isLoading: isLoadingOrders } = useMarketQuery({
    queryKey: [ 'exchangeOrderSummary', Number(asteroidId), Number(product) ],
    queryFn: () => api.getOrderSummaryByExchange(asteroidId, product),
    enabled: !!asteroidId && !!product
  }, { asteroidId, products: [product] });

  const isLoading = isLoadingBuildings || isLoadingOrders;
  return useMemo(() => {
    if (isLoading) return { data: undefined, isLoading: true };
    return {
      data: exchanges
        // filter to any that allow product OR that still have orphaned (but active) orders on product
        .filter((e) => e.Exchange.allowedProducts.includes(product) || orderSummaries[e.id]?.buy?.orders || orderSummaries[e.id]?.sell?.orders)
        .map((e) => ({
          marketplace: e,
          ...(
            orderSummaries[e.id] || {
              buy: { orders: 0, amount: 0, price: 0 },
              sell: { orders: 0, amount: 0, price: 0 },
            }
          )
        })),
      isLoading
    };
  }, [exchanges, orderSummaries, isLoading, product]);
};

export default useOrderSummaryByExchange;
