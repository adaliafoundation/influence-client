import axios from 'axios';
import { useQuery } from '@tanstack/react-query';

import { appConfig } from '~/appConfig';

const useIpfsContent = (hash) => {
  return useQuery({
    queryKey: ['annotation', hash],
    queryFn: async () => {
      const response = await axios.get(`${appConfig.get('Api.ipfs')}/${hash}`);
      return response?.data?.content;
    },
    enabled: !!hash
  })
};

export default useIpfsContent;
