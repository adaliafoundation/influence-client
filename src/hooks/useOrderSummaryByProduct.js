import { useQuery } from '@tanstack/react-query';

import api from '~/lib/api';

const useOrderSummaryByProduct = (entity) => {
  return useQuery({
    queryKey: [ 'productOrderSummary', entity.label, Number(entity.id) ],
    queryFn: () => api.getOrderSummaryByProduct(entity),
    enabled: !!entity
  });
};

export default useOrderSummaryByProduct;
