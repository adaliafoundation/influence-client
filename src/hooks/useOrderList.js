import { Entity } from '@influenceth/sdk';
import useEntity from './useEntity';
import { asteroidOf } from '../lib/marketSubscriptions';
import useMarketQuery from './useMarketQuery';

import api from '~/lib/api';

const useOrderList = (exchangeId, productId) => {
  const { data: exchange } = useEntity({ label: Entity.IDS.BUILDING, id: exchangeId });
  return useMarketQuery({
    queryKey: [ 'orderList', Number(exchangeId), Number(productId) ],
    queryFn: () => api.getOrderList(exchangeId, productId),
    enabled: !!exchangeId && !!productId
  }, { asteroidId: asteroidOf(exchange), exchangeId, products: [productId] });
};

export default useOrderList;
