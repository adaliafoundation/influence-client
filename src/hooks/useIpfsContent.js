import axios from 'axios';
import { useQuery } from '@tanstack/react-query';

import { getIpfsUrl } from '~/lib/ipfsUtils';

const useIpfsContent = (hash) => {
  return useQuery({
    queryKey: ['annotation', hash],
    queryFn: async () => {
      const response = await axios.get(getIpfsUrl(hash));
      return response?.data?.content;
    },
    enabled: !!hash && !!getIpfsUrl(hash)
  })
};

export default useIpfsContent;
