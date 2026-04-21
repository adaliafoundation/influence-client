import { useQuery, useQueryClient } from '@tanstack/react-query';
import { hydrateActivities } from '~/lib/activities';

import api from '~/lib/api';

const useEarliestActivity = (entity) => {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: [ 'activities', entity?.label, Number(entity?.id), 'earliest' ],
    queryFn: async () => {
      const arr = await api.getEntityActivities(entity, { pageSize: 1, order: 'asc', withAnnotations: true });
      await hydrateActivities(arr, queryClient); // NOTE: this is probably not necessary in any case
      return arr?.[0];
    },
    enabled: !!entity
  });
};

export default useEarliestActivity;
