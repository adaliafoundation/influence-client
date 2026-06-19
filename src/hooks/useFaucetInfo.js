import { useQuery } from '@tanstack/react-query';

import useSession from '~/hooks/useSession';
import api from '~/lib/api';

const useFaucetInfo = () => {
  const { accountAddress } = useSession();
  return useQuery({
    queryKey: [ 'faucetInfo', accountAddress ],
    queryFn: () => api.faucetInfo(),
    enabled: !!accountAddress
  });
};

export default useFaucetInfo;
