import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import useSession from '~/hooks/useSession';
import useCrewContext from '~/hooks/useCrewContext';
import api from '~/lib/api';

const useWalletAgreements = () => {
  const { accountAddress } = useSession();
  const { crews, loading: crewsLoading } = useCrewContext();

  const crewIds = useMemo(() => {
    if (crewsLoading) return null;
    return (crews || []).map((c) => c.id).sort((a, b) => a - b);
  }, [crews, crewsLoading]);

  return useQuery({
    queryKey: [ 'agreements', accountAddress, crewIds ],
    queryFn: async () => api.getCrewAgreements(crewIds, accountAddress),
    enabled: !!(accountAddress && crewIds)
  });
};

export default useWalletAgreements;
