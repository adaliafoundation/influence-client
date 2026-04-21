import { useQuery } from '@tanstack/react-query';
import { Order } from '@influenceth/sdk';

import api from '~/lib/api';
import { locationsArrToObj } from '~/lib/utils';

const useShoppingListOrders = (asteroidId, productIds, mode = 'buy') => {
  // TODO: ideally could somehow partion this by productId in cache keys
  return useQuery({
    queryKey: [ 'shoppingOrderList', Number(asteroidId), productIds, mode ],
    queryFn: async () => {
      const empties = productIds.reduce((a, p) => ({ ...a, [p]: {} }), {});

      const amountKey = mode === 'buy' ? 'supply' : 'demand';
      const orders = await api.getOrdersByProduct(asteroidId, productIds, mode === 'buy' ? Order.IDS.LIMIT_SELL : Order.IDS.LIMIT_BUY);
      return orders.reduce((acc, o) => {
        const loc = locationsArrToObj(o.locations || []);
        if (!acc[o.product][loc.buildingId]) {
          acc[o.product][loc.buildingId] = {
            lotId: loc.lotId,
            buildingId: loc.buildingId,
            [amountKey]: 0,
            orders: [],
          };
        }
        acc[o.product][loc.buildingId][amountKey] += o.amount;
        acc[o.product][loc.buildingId].orders.push(o);

        return acc;
      }, empties);
    },
    enabled: !!asteroidId && !!productIds?.length
  });
}

export default useShoppingListOrders;
