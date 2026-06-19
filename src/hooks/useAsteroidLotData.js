import { useQuery } from '@tanstack/react-query';

import api from '~/lib/api';

const useAsteroidLotData = (asteroidId) => {
  return useQuery({
    queryKey: [ 'asteroidPackedLotData', Number(asteroidId) ],
    queryFn: () => api.getAsteroidLotData(asteroidId),
    enabled: !!asteroidId
  });
};

export default useAsteroidLotData;
