import { useQuery } from '@tanstack/react-query';

import api from '~/lib/api';

const useEntity = (props) => {
  const { label, id } = props || {};
  return useQuery({
    queryKey: [ 'entity', label, Number(id) ],
    queryFn: () => api.getEntityById({ label, id }),
    enabled: !!(label && id)
  });
};

export default useEntity;
