import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { trim } from 'lodash';

import { MyAssetDoubleIcon, MyAssetIcon, MyAssetTripleIcon } from '~/components/Icons';
import api from '~/lib/api';
import theme from '~/theme';

export const barebonesCrewmateAppearance = '0x1200010000000000041';

const useStarterPacks = () => {
  const { data: products } = useQuery({
    queryKey: ['stripeProducts'],
    queryFn: () => api.getStripeProducts()
  });

  const starterPackPricing = useMemo(() => {
    const packs = {};
    (products || [])
      .sort((a, b) => a.amount - b.amount)
      .forEach((product, i) => {
        let ui = {
          checkMarks: product.metadata.checkMarks?.split('|') || [],
          flavorText: product.metadata.flavorText
        };

        if (i === 0) {
          ui.crewmateAppearance = barebonesCrewmateAppearance;
          ui.color = theme.colors.glowGreen;
          ui.colorLabel = 'green';
          ui.flairIcon = <MyAssetIcon />;
        } else if (i === 1 && products.length > 2) {
          ui.crewmateAppearance = '0x2700020002000300032'; //'0x22000200070002000a2'
          ui.color = theme.colors.main;
          ui.colorLabel = undefined;
          ui.flairIcon = <MyAssetDoubleIcon />;
        } else {
          ui.crewmateAppearance = '0x30001000400070002000a2'; //'0x3000100030002000300032'
          ui.color = theme.colors.lightPurple;
          ui.colorLabel = 'purple';
          ui.flairIcon = <MyAssetTripleIcon />;
        }

        const buildingIds = (product.metadata.buildings.split(',') || []).map(Number);
        packs[product.id] = {
          id: product.id,
          name: trim(product.name.replace('Starter Pack -', '')),
          price: product.amount,
          crewmates: product.metadata.crewmates,
          buildings: buildingIds,
          ui
        }
      });
    console.log({ packs })
    return Object.values(packs);
  }, [products]);

  return starterPackPricing;
};

export default useStarterPacks;
