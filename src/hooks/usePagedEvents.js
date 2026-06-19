import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { hydrateActivities, typesWithLogContent } from '~/lib/activities';
import api from '~/lib/api';
import useCrewContext from '~/hooks/useCrewContext';
import useStore from '~/hooks/useStore';
import useGetActivityConfig from './useGetActivityConfig';

const assetType = 'eventlog';
const pageSize = 25;

const usePagedEvents = () => {
  const getActivityConfig = useGetActivityConfig();
  const { crew } = useCrewContext();
  const queryClient = useQueryClient();
  const [data, setData] = useState({ hits: [], total: 0 });
  const [loading, setLoading] = useState();
  const [page, setPage] = useState(1);

  const filters = useStore(s => s.assetSearch[assetType].filters || {});
  const sort = useStore(s => s.assetSearch[assetType].sort || []);
  const setSort = useStore(s => s.dispatchSortUpdated(assetType));

  useEffect(() => {
    setPage(1);
  }, [filters, sort]);

  useEffect(() => {
    setLoading(true);

    // TODO (enhancement): if not using any filters, should probably use react-query here...
    //  but will need to invalidate these queries when get event updates from WS

    api.getActivities({ crewId: crew?.id, page, pageSize, types: typesWithLogContent, returnTotal: true })
      .then(async ({ activities, totalHits }) => {
        await hydrateActivities(activities, queryClient);
        setData({
          hits: activities
            .map((activity) => {
              const { logContent } = getActivityConfig(activity);
              if (!logContent) return null;
              return {
                ...logContent,
                activity
              };
            })
            .filter((a) => !!a),
          total: totalHits
        });
        setLoading(false);
      })
      .catch((err) => {
        console.warn(err);
        setLoading(false);
      });
  }, [getActivityConfig, filters, sort, page]);

  return {
    page,
    perPage: pageSize,
    setPage,
    sort,
    setSort,
    query: {
      data: data,
      isLoading: loading,
    }
  };
};

export default usePagedEvents;
