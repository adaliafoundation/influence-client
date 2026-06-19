import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import api from '~/lib/api';
import { cleanseTxHash } from '~/lib/utils';

// note: deprecated at-the-moment, but could be relevant in the future

const useActivityAnnotations = (activity) => {
  const query = useMemo(
    () => activity?.event ? { transactionHash: activity?.event?.transactionHash, logIndex: activity?.event?.logIndex } : null,
    [activity]
  );
  
  return useQuery({
    queryKey: ['annotations', cleanseTxHash(query?.transactionHash), `${query?.logIndex}`],
    queryFn: () => api.getAnnotations(query),
    enabled: !!query
  });
};

export default useActivityAnnotations;
