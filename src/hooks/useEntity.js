import { useQuery } from '@tanstack/react-query';

import api from '~/lib/api';

const useEntity = (props) => {
  const { label, id, components } = props || {};
  const selection = components ? [...new Set(components)].sort() : undefined;
  return useQuery({
    queryKey: [ 'entity', label, Number(id), ...(selection ? [{ components: selection }] : []) ],
    queryFn: () => api.getEntityById({ label, id, components: selection }),
    enabled: !!(label && id)
  });
};

export default useEntity;
