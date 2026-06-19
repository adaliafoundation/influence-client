import { useQueryClient, useMutation } from '@tanstack/react-query';

import useSession from '~/hooks/useSession';
import api from '~/lib/api';

const useUnWatchAsteroid = () => {
  const { token } = useSession();
  const queryClient = useQueryClient();
  const watchedMapped = true;//useStore(s => s.asteroids.watched.mapped);

  return useMutation({
    mutationFn: async (id) => api.unWatchAsteroid(id),
    enabled: !!token,
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      if (watchedMapped) queryClient.invalidateQueries({ queryKey: ['asteroids', 'list'] });  // TODO: deprecated key
    }
  });
};

export default useUnWatchAsteroid;
