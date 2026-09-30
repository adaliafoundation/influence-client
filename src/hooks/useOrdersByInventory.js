import useEntity from './useEntity';
import { asteroidOf } from '../lib/marketSubscriptions';
import useMarketQuery from './useMarketQuery';

import api from '~/lib/api';

const useOrdersByInventory = (inventory) => {
  const { data: storage } = useEntity(inventory);
  return useMarketQuery({
    queryKey: [ 'inventoryOrders', inventory?.label, Number(inventory?.id) ],
    queryFn: () => api.getOrdersByInventory(inventory),
    enabled: !!inventory
  }, { asteroidId: asteroidOf(storage), storage: inventory && { id: inventory.id, label: inventory.label } });
};

export default useOrdersByInventory;
