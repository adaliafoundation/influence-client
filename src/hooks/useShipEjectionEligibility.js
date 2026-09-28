import { useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import useCrewContext from '~/hooks/useCrewContext';
import useSession from '~/hooks/useSession';
import api from '~/lib/api';
import { checkingShipEjection, isForceLaunch, isLandedShip, loadShipEjectionEligibility } from '~/lib/shipEjectionEligibility';

const useShipEjectionEligibility = (ship) => {
  const { crew } = useCrewContext();
  const { accountAddress, blockTime, provider } = useSession();
  const params = { api, provider, shipId: ship?.id, crewId: crew?.id, accountAddress, blockTime };
  const current = useRef(params);
  current.current = params;
  const enabled = isForceLaunch(crew, ship) && isLandedShip(ship) && blockTime != null;
  const query = useQuery({
    queryKey: ['shipEjectionEligibility', ship?.id, crew?.id, accountAddress, blockTime, ship?.Location, ship?.Control, crew?.Crew, crew?.Location],
    queryFn: () => loadShipEjectionEligibility(params),
    enabled,
    retry: false
  });
  const recheck = useCallback(async (expected) => {
    const start = current.current;
    if (expected.shipId !== start.shipId || expected.crewId !== start.crewId) return checkingShipEjection;
    const result = await loadShipEjectionEligibility(start);
    const latest = current.current;
    if (start.shipId !== latest.shipId || start.crewId !== latest.crewId || start.accountAddress !== latest.accountAddress || start.blockTime !== latest.blockTime) return checkingShipEjection;
    return result;
  }, []);
  return {
    eligibility: !enabled || query.isFetching || query.isError ? checkingShipEjection : (query.data || checkingShipEjection),
    recheck
  };
};

export default useShipEjectionEligibility;
