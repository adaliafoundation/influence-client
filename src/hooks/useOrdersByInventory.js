import { useQuery } from '@tanstack/react-query';

import api from '~/lib/api';

const useOrdersByInventory = (inventory) => {
  return useQuery({
    queryKey: [ 'inventoryOrders', inventory?.label, Number(inventory?.id) ],
    queryFn: () => api.getOrdersByInventory(inventory),
    enabled: !!inventory
  });
};

export default useOrdersByInventory;
