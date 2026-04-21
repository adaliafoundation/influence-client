import { useQuery } from '@tanstack/react-query';

import useSession from '~/hooks/useSession';
import api from '~/lib/api';

const useReferrals = () => {
  const { token } = useSession();

  return useQuery({
    queryKey: [ 'referrals', token ],
    queryFn: () => api.getReferrals(),
    enabled: !!token
  });
};

export default useReferrals;
