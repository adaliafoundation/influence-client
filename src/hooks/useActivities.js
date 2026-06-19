import { useQuery, useQueryClient } from '@tanstack/react-query';
import { hydrateActivities } from '~/lib/activities';

import api from '~/lib/api';

const useActivities = (entity) => {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: [ 'activities', entity?.label, Number(entity?.id) ],
    queryFn: async () => {
      const activities = await api.getEntityActivities(entity, { withAnnotations: true });
      await hydrateActivities(activities, queryClient);
      return activities;
    },
    enabled: !!entity
  });
};

export default useActivities;
