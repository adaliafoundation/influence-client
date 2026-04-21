import { useQuery } from '@tanstack/react-query';
import api from '~/lib/api';

import useSession from '~/hooks/useSession';

const useUser = () => {
  const { token } = useSession();
  return useQuery({
    queryKey: [ 'user', token ],
    queryFn: () => api.getUser(),
    enabled: !!token
  });
};

export default useUser;
