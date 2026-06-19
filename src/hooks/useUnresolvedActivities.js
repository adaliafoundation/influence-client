import { useQuery } from '@tanstack/react-query';

import api from '~/lib/api';

// TODO (enhancement): could this safely piggyback useActivities? may be overkill
// anyway to do that since most entities don't call useActivities currently
const useUnresolvedActivities = (entity) => {
  return useQuery({
    queryKey: [ 'activities', entity?.label, Number(entity?.id), 'unresolved' ],
    queryFn: () => api.getEntityActivities(entity, { unresolved: true }),
    enabled: !!(entity?.id && entity?.label)
  });
};

export default useUnresolvedActivities;
