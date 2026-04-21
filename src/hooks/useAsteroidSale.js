import { useQuery } from '@tanstack/react-query';

import api from '~/lib/api';

const useAsteroidSale = () => {
  return useQuery({
    queryKey: ['asteroidSale'],
    queryFn: () => api.getAsteroidSale(),
  });
};

export default useAsteroidSale;
