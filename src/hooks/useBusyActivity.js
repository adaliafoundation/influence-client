import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import cloneDeep from 'lodash/cloneDeep';

import useBlockTime from '~/hooks/useBlockTime';
import activities, { hydrateActivities } from '~/lib/activities';
import api from '~/lib/api';

const useBusyActivity = (entity) => {
  const queryClient = useQueryClient();
  const blockTime = useBlockTime();

  const [isHydrating, setIsHydrating] = useState();
  const [hydratedBusyItem, setHydratedBusyItem] = useState();

  const busyEvents = useMemo(() => Object.keys(activities).filter((i) => !!activities[i].getBusyItem || !!activities[i].requiresCrewTime), []);

  const { data: recentItems, dataUpdatedAt, isLoading, refetch } = useQuery({
    queryKey: [ 'activities', entity?.label, Number(entity?.id), 'busy' ],
    queryFn: () => api.getEntityActivities(entity, { events: busyEvents, pageSize: 24 }),
    enabled: !!entity
  });

  // if crew is busy AND there is no unready finishable action (i.e. this activity will be shown)
  // then it must be because of an unfinishable unready action (where !!getBusyItem) OR because of
  // a *ready* finishable action where the crew time was > task time (i.e. core sample >1h away)...
  const busyItem = useMemo(() => {
    // walk backwards until find first of those conditions...
    return (recentItems || []).find((i) => {
      if (!activities[i.event?.name]) return false;
      if (!!activities[i.event.name].getBusyItem) return true;
      else if (i.event?.returnValues?.finishTime && i.event?.returnValues?.finishTime <= blockTime) return true;
      return false;
    });
  }, [blockTime, dataUpdatedAt]);

  useEffect(() => {
    if (busyItem) {
      setIsHydrating(true);
      const items = [busyItem];
      hydrateActivities(items, queryClient)
        .then(() => { setHydratedBusyItem(items[0]); })
        .finally(() => { setIsHydrating(false); });
    } else {
      setHydratedBusyItem(null);
    }
  }, [busyItem]);

  return useMemo(() => ({
    data: cloneDeep(hydratedBusyItem),
    isLoading: isLoading || isHydrating,
    dataUpdatedAt: Date.now(),
    refetch
  }), [hydratedBusyItem, isHydrating, isLoading, refetch]);
};

export default useBusyActivity;
