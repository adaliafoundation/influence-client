import { useQuery } from '@tanstack/react-query';

import api from '~/lib/api';

export const entityQueryOptions = (props) => {
  const { label, id, components } = props || {};
  const selection = components ? [...new Set(components)].sort() : undefined;
  return {
    queryKey: [ 'entity', label, Number(id), ...(selection ? [{ components: selection }] : []) ],
    queryFn: () => api.getEntityById({ label, id, components: selection }),
    enabled: !!(label && id)
  };
};

const useEntity = (props) => useQuery(entityQueryOptions(props));

export default useEntity;
