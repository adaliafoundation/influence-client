import { useQuery } from '@tanstack/react-query';
import { Address } from '@influenceth/sdk';

import api from '~/lib/api';

const parseAs = {
  ADALIAN_PURCHASE_PRICE: BigInt,
  ADALIAN_PURCHASE_TOKEN: Address.toStandard,
  ASTEROID_PURCHASE_BASE_PRICE: BigInt,
  ASTEROID_PURCHASE_LOT_PRICE: BigInt,
  ASTEROID_PURCHASE_TOKEN: Address.toStandard,
  // ASTEROID_MERKLE_ROOT: null,
  // ASTEROID_SALE_LIMIT: null,
  CREW_SCHEDULE_BUFFER: parseInt,
  // LAUNCH_TIME: null,
  // SOFT_LAUNCH_TIME: null,
  TIME_ACCELERATION: parseInt,
};

const useConstants = (constantOrConstants) => {
  return useQuery({
    queryKey: [ 'constants', constantOrConstants ],
    queryFn: async () => {
      const isArr = Array.isArray(constantOrConstants);
      const c = await api.getConstants(isArr ? constantOrConstants : [constantOrConstants]);
      Object.keys(c).forEach((k) => c[k] = parseAs[k] ? parseAs[k](c[k]) : c[k]);
      return isArr ? c : c[constantOrConstants];
    },
    enabled: !!constantOrConstants
  });
};

export default useConstants;
