import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useThrottle } from '@react-hook/throttle';
import esb from 'elastic-builder';
import { Building } from '@influenceth/sdk';

import api from '~/lib/api';
import formatters from '~/lib/formatters';
import { esbLocationQuery } from '~/lib/utils';

let sort;

const configByType = {
  asteroids: {
    formatFootnote: (a) => `ID #${(a.id || '').toLocaleString()}`,
    formatLabel: (a) => formatters.asteroidName(a),
    valueKey: 'id'
  },
  buildings: {
    formatFootnote: (c) => `ID #${(c.id || '').toLocaleString()}`,
    formatLabel: (a) => formatters.buildingName(a),
    valueKey: 'id'
  },
  crews: {
    formatFootnote: (c) => `ID #${(c.id || '').toLocaleString()}`,
    formatLabel: (a) => formatters.crewName(a),
    valueKey: 'id'
  },
}

const useAutocomplete = (assetType, meta) => {
  const [ searchTerm, setSearchTerm ] = useState('');
  const [ query, setQuery ] = useThrottle({}, 2, true);

  useEffect(() => {
    if (!assetType) return;
    if (searchTerm) {
      const q = esb.requestBodySearch();

      let queryBuilder;
      if (assetType === 'asteroids') {
        queryBuilder = esb.disMaxQuery();
        const queries = [esb.matchQuery('Name.name', searchTerm)];
        // if all numeric, also search against id
        if (/^[0-9]+$/.test(searchTerm)) queries.push(esb.termQuery('id', searchTerm).boost(10));
        queryBuilder.queries(queries);
      }
      else if (assetType === 'buildings') {
        queryBuilder = esb.disMaxQuery();
        const queries = [esb.matchQuery('Name.name', searchTerm)];
        // if all numeric, also search against id
        if (/^[0-9]+$/.test(searchTerm)) queries.push(esb.termQuery('id', searchTerm).boost(10));

        queryBuilder.queries(queries.map((subQ) => {
          const query = esb.boolQuery();
          // filter by asteroidId if specified
          if (meta?.asteroidId) query.filter(esbLocationQuery({ asteroidId: meta?.asteroidId }));
          // filter by operational
          query.filter(esb.termQuery('Building.status', Building.CONSTRUCTION_STATUSES.OPERATIONAL));
          // filter by subquery
          query.filter(subQ);
          return query;
        }));
      }
      else if (assetType === 'crews') {
        queryBuilder = esb.disMaxQuery();
        const queries = [esb.matchQuery('Name.name', searchTerm)];
        // if all numeric, also search against id
        if (/^[0-9]+$/.test(searchTerm)) queries.push(esb.termQuery('id', searchTerm).boost(10));
        queryBuilder.queries(queries);
      }

      if (queryBuilder) q.query(queryBuilder);
      if (sort) q.sort(esb.sort(...sort));
      q.from(0);
      q.size(50);

      setQuery(q.toJSON());
    } else {
      // TODO: default response for asset type
    }
  }, [ assetType, meta?.asteroidId, searchTerm, sort ]);

  const { data, isLoading } = useQuery({
    // TODO: convert this to 'entities' model of cache keys?
    queryKey: [ 'search', assetType, query ],
    queryFn: () => assetType && query ? api.searchAssets(assetType, query) : [],
    enabled: !!query
  });

  return {
    ...configByType[assetType],
    options: data?.hits || [],
    isLoading,
    searchTerm,
    setSearchTerm
  }
};

export default useAutocomplete;
