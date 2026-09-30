import { Entity } from '@influenceth/sdk';
import { createEligibilityDependencies } from '../lib/eligibilityDependencies';
import { entityQueryOptions } from './useEntity';
import { useCallback, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import useCrewContext from '~/hooks/useCrewContext';
import useSession from '~/hooks/useSession';
import api from '~/lib/api';
import { checkingShipEjection, isForceLaunch, isLandedShip, loadShipEjectionEligibility } from '~/lib/shipEjectionEligibility';

const useShipEjectionEligibility = (ship) => {
  const queryClient = useQueryClient();
  const { crew } = useCrewContext();
  const { accountAddress, blockTime, blockNumber, provider } = useSession();
  const dependencies = useMemo(() => createEligibilityDependencies([{ label: Entity.IDS.CREW, id: crew?.id }, { label: Entity.IDS.SHIP, id: ship?.id }]), [ship?.id, crew?.id]);
  [{ ...ship, label: Entity.IDS.SHIP }, { ...crew, label: Entity.IDS.CREW }].forEach(dependencies.add);
  const params = { api, provider, shipId: ship?.id, crewId: crew?.id, accountAddress, blockTime, blockNumber };
  const current = useRef(params);
  current.current = params;
  const enabled = isForceLaunch(crew, ship) && isLandedShip(ship) && blockTime != null;
  const query = useQuery({
    queryKey: ['shipEjectionEligibility', ship?.id, crew?.id, accountAddress, blockTime != null, ship?.Location, ship?.Control, crew?.Crew, crew?.Location],
    queryFn: () => loadShipEjectionEligibility({ ...params, api: {
      ...api,
      getEntityById: async (entity) => {
        dependencies.add(entity);
        const data = await queryClient.fetchQuery(entityQueryOptions(entity));
        dependencies.add(data);
        return data;
      }
    } }),
    enabled,
    meta: { affectsEntity: dependencies.affects, recheck: () => recheck({ shipId: ship?.id, crewId: crew?.id }) },
    staleTime: Infinity,
    retry: false
  });
  const recheck = useCallback(async (expected) => {
    const start = current.current;
    if (expected.shipId !== start.shipId || expected.crewId !== start.crewId) return checkingShipEjection;
    const result = await loadShipEjectionEligibility(start);
    const latest = current.current;
    if (start.shipId !== latest.shipId || start.crewId !== latest.crewId || start.accountAddress !== latest.accountAddress || start.provider !== latest.provider) return checkingShipEjection;
    return result;
  }, []);
  return {
    eligibility: !enabled || query.isError ? checkingShipEjection : (query.data || checkingShipEjection),
    recheck
  };
};

export default useShipEjectionEligibility;
