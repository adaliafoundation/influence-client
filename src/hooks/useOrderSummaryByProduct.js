import { Entity } from '@influenceth/sdk';
import useEntity from './useEntity';
import { asteroidOf } from '../lib/marketSubscriptions';
import useMarketQuery from './useMarketQuery';

import api from '~/lib/api';

const useOrderSummaryByProduct = (entity) => {
  const { data: target } = useEntity([Entity.IDS.BUILDING, Entity.IDS.SHIP].includes(entity?.label) ? entity : undefined);
  return useMarketQuery({
    queryKey: [ 'productOrderSummary', entity?.label, Number(entity?.id) ],
    queryFn: () => api.getOrderSummaryByProduct(entity),
    enabled: !!entity
  }, { asteroidId: asteroidOf(target || entity), lotId: entity?.label === Entity.IDS.LOT ? entity.id : undefined, exchangeId: entity?.label === Entity.IDS.BUILDING ? entity.id : undefined });
};

export default useOrderSummaryByProduct;
