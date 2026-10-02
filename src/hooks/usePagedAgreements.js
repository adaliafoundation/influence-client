import { matchesCrewPermissionSubject } from '~/lib/authorization';
import { useEffect, useMemo, useRef, useState } from 'react';
import get from 'lodash/get';
import { Entity, Lot } from '@influenceth/sdk';

import useCrewAgreements from '~/hooks/useCrewAgreements';
import useEntity from '~/hooks/useEntity';
import useStore from '~/hooks/useStore';
import { entityToAgreements } from '~/lib/utils';
import useCrewContext from './useCrewContext';
import useBlockTime from './useBlockTime';
import useAsteroid from './useAsteroid';

const assetType = 'agreements';
const pageSize = 25;

const usePagedAgreements = (params) => {
  const blockTime = useBlockTime();
  const { crew } = useCrewContext();
  const [page, setPage] = useState(1);

  const filters = useStore(s => s.assetSearch[assetType]?.filters);
  const sort = useStore(s => s.assetSearch[assetType]?.sort);
  const updateFilters = useStore(s => s.dispatchFiltersUpdated(assetType));
  const setSort = useStore(s => s.dispatchSortUpdated(assetType));

  useEffect(() => {
    setPage(1);
  }, [filters, sort]);

  // override perm filter from url, but reset to pre-existing on unmount
  const previousPermFilter = useRef();
  useEffect(() => {
    if (params.permission) {
      previousPermFilter.current = filters.permission;

      const newFilter = {...(filters || {})};
      newFilter.permission = [params.permission];
      updateFilters(newFilter);

      return () => {
        const oldFilter = {...(filters || {})};
        oldFilter.permission = previousPermFilter.current
        updateFilters(oldFilter);
      }
    }
  }, [params.permission]);

  // get data for crewAgreements or entityAgreements, depending on if uuid is specified or not
  const { data: crewAgreements, isLoading: crewAgreementsLoading, dataUpdatedAt } = useCrewAgreements(!params.uuid);
  const { data: entity, isLoading: entityLoading } = useEntity(params.uuid ? Entity.unpackEntity(params.uuid) : null);
  const { data: asteroid } = useAsteroid(entity?.label === Entity.IDS.LOT ? Lot.toPosition(entity.id)?.asteroidId : null);

  const isLoading = params.uuid ? entityLoading : crewAgreementsLoading;

  const data = useMemo(() => {
    if (isLoading) return undefined;
    if (!params.uuid && crewAgreements) return crewAgreements;
    if (params.uuid && entity) {
      return entityToAgreements(entity)
        .filter((a) => !params.permission || (a._agreement.permission === Number(params.permission)))
        .map((a) => a.label === Entity.IDS.LOT ? ({ ...a, Control: asteroid?.Control }) : a);
    }
    return [];
  }, [asteroid, crewAgreements, dataUpdatedAt, entity, isLoading, params.permission, params.uuid]);

  // TODO: should almost certainly move filter application into elasticsearch instead of loading all upfront
  const filteredData = useMemo(() => {
    return (data || [])
      .filter((a) => {
        if (filters.permission) {
          if (!filters.permission.includes(String(a._agreement.permission))) return false;
        }
        if (filters.role) {
          if (!(
            (filters.role.includes('lessor') && a.Control?.controller?.id === crew?.id)
            || (filters.role.includes('lessee') && matchesCrewPermissionSubject(a._agreement.permitted, crew))
          )) return false;
        }
        if (filters.timing) {
          if (!(
            (filters.timing.includes('active') && (!a._agreement.endTime || a._agreement.endTime > blockTime))
            || (filters.timing.includes('recently_expired') && a._agreement.endTime && a._agreement.endTime <= blockTime && a._agreement.endTime > blockTime - 7 * 86400)
            || (filters.timing.includes('old_expired') && a._agreement.endTime && a._agreement.endTime <= blockTime - 7 * 86400)
          )) return false;
        }
        return true;
      })
      .sort((a, b) => (sort[1] === 'asc' ? 1 : -1) * (get(a, sort[0]) < get(b, sort[0]) ? -1 : 1));
  }, [blockTime, crew, data, sort, filters]);

  const dataPage = useMemo(() => filteredData.slice(pageSize * (page - 1), pageSize * page), [filteredData, page])

  return {
    page,
    perPage: pageSize,
    setPage,
    sort,
    setSort,
    query: {
      data: {
        hits: dataPage,
        total: filteredData?.length
      },
      isLoading
    }
  };
};

export default usePagedAgreements;
