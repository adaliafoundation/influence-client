import { useQuery } from '@tanstack/react-query';

import api from '~/lib/api';

const useOrderList = (exchangeId, productId) => {
  return useQuery({
    queryKey: [ 'orderList', Number(exchangeId), Number(productId) ],
    queryFn: () => api.getOrderList(exchangeId, productId),
    enabled: !!exchangeId && !!productId
  });
};

export default useOrderList;
