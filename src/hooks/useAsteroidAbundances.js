import { useMemo } from 'react';
import { Asteroid, Product } from '@influenceth/sdk';

import { keyify } from '~/lib/utils';

const useAsteroidAbundances = (asteroid, { includeUnscanned = false } = {}) => {
  const data = useMemo(() => {
    const scanned = asteroid?.Celestial?.scanStatus === Asteroid.SCAN_STATUSES.RESOURCE_SCANNED;
    if (scanned || (includeUnscanned && asteroid?.Celestial)) {
      const categories = {};
      const abundances = scanned
        ? Asteroid.Entity.getAbundances(asteroid)
        : Object.fromEntries(Asteroid.SPECTRAL_TYPES[asteroid.Celestial.celestialType].resources.map((i) => [i, null]));
      const bonuses = Asteroid.Entity.getBonuses(asteroid);

      Object.keys(abundances).forEach((i) => {
        const abundance = abundances[i];
        if (abundance === null || abundance > 0) {
          const { category, name } = Product.TYPES[i];

          const categoryKey = keyify(category);
          if (!categories[category]) {
            categories[category] = {
              categoryKey,
              category,
              bonus: bonuses.find((b) => b.type === categoryKey.toLowerCase()),
              resources: [],
              abundance: scanned ? 0 : null,
            };
          }

          if (scanned) categories[category].abundance += abundance;
          categories[category].resources.push({
            i,
            categoryKey,
            category,
            name,
            abundance
          });
        }
      });

      // sort resources in each category and sort each category
      return Object.values(categories)
        .map((category) => ({
          ...category,
          resources: category.resources.sort((a, b) => b.abundance - a.abundance)
        }))
        .sort((a, b) => b.abundance - a.abundance);
    }
    return [];
  }, [asteroid, includeUnscanned]);

  return data;
};

export default useAsteroidAbundances;
