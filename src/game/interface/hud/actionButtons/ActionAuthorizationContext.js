import { createContext, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import useCrewContext from '~/hooks/useCrewContext';

const ActionAuthorizationContext = createContext();

export const ActionAuthorizationProvider = ({ children, asteroid, lot, ship, simulation, dialogProps }) => {
  const { refreshAuthorization } = useCrewContext();
  const queryClient = useQueryClient();
  const targetKey = JSON.stringify([asteroid, lot?._permissionTargets?.lot || lot, lot?.building, ship,
    dialogProps?.origin, dialogProps?.destination, dialogProps?.entity]
    .filter(entity => entity?.id && entity?.label).map(({ id, label }) => ({ id, label })));
  const targets = useMemo(() => JSON.parse(targetKey), [targetKey]);
  const lotId = lot?.id;
  const shipId = ship?.id;
  const refresh = useCallback(async () => {
    if (simulation) return { status: 'allowed' };
    const eligibilityQueries = queryClient.getQueryCache().findAll({ type: 'active', predicate: query => (
      (query.queryKey[0] === 'planningEligibility' && Number(query.queryKey[1]) === Number(lotId))
      || (query.queryKey[0] === 'shipEjectionEligibility' && Number(query.queryKey[1]) === Number(shipId))
    ) });
    await Promise.all(eligibilityQueries.map(async query => {
      // Eligibility previews may use cached snapshots. Clicks use their existing fresh recheck.
      await queryClient.cancelQueries({ queryKey: query.queryKey, exact: true });
      await queryClient.fetchQuery({ queryKey: query.queryKey, queryFn: query.meta.recheck, meta: query.meta, staleTime: 0, retry: false });
    }));
    return refreshAuthorization(targets);
  }, [refreshAuthorization, queryClient, targets, lotId, shipId, simulation]);
  return <ActionAuthorizationContext.Provider value={refresh}>{children}</ActionAuthorizationContext.Provider>;
};

export default ActionAuthorizationContext;
