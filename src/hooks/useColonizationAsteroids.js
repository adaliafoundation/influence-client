import { useQueries } from '@tanstack/react-query';
import { appConfig } from '~/appConfig';
import api from '~/lib/api';
import { colonizationMissionsQueryKey } from '~/lib/colonizationMissions';
import useSession from '~/hooks/useSession';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';

const useColonizationAsteroids = (asteroids) => {
  const { chainId, token } = useSession();
  const simulationEnabled = useSimulationEnabled();
  const enabled = !!token && !simulationEnabled;
  const queries = useQueries({
    queries: asteroids.map(asteroid => ({
      queryKey: colonizationMissionsQueryKey(chainId, appConfig.get('Api.influence'), asteroid.id),
      queryFn: () => api.getColonizationMissions(asteroid.id),
      enabled,
      staleTime: 15000,
      refetchInterval: 15000
    }))
  });
  return {
    data: asteroids.filter((asteroid, index) => queries[index].data?.canEnroll || queries[index].data?.enrolled),
    isLoading: enabled && queries.some(query => query.isLoading),
    isError: queries.some(query => query.isError),
    refetch: () => Promise.all(queries.filter(query => query.isError).map(query => query.refetch()))
  };
};

export default useColonizationAsteroids;
