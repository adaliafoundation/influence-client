import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { MyAssetDoubleIcon, MyAssetIcon, MyAssetTripleIcon } from '~/components/Icons';
import api from '~/lib/api';
import {
  barebonesCrewmateAppearance,
  normalizeStarterPackProducts
} from '~/lib/starterPacks';
import theme from '~/theme';

export { barebonesCrewmateAppearance };

const packVisuals = [
  {
    crewmateAppearance: barebonesCrewmateAppearance,
    color: theme.colors.glowGreen,
    colorLabel: 'green',
    flairIcon: <MyAssetIcon />
  },
  {
    crewmateAppearance: '0x2700020002000300032',
    color: theme.colors.main,
    colorLabel: undefined,
    flairIcon: <MyAssetDoubleIcon />
  },
  {
    crewmateAppearance: '0x30001000400070002000a2',
    color: theme.colors.lightPurple,
    colorLabel: 'purple',
    flairIcon: <MyAssetTripleIcon />
  }
];

const useStarterPacks = () => {
  const query = useQuery({
    queryKey: ['starterPackProducts'],
    queryFn: api.getStarterPackProducts
  });

  const products = useMemo(() => (
    normalizeStarterPackProducts(query.data?.products)
      .map((product, index) => ({
        ...product,
        ui: packVisuals[index] || packVisuals[packVisuals.length - 1]
      }))
  ), [query.data]);

  return {
    ...query,
    data: products
  };
};

export default useStarterPacks;
