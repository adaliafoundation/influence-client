import useStore from './useStore';
import { reportFailure } from '../lib/errorReporting';
import { errorMessages } from '../lib/errorMessages';
import { Time } from '@influenceth/sdk';
import { useMemo } from 'react';
import useCrewContext from './useCrewContext';
import useBlockTime from './useBlockTime';
import { acquisitionMatches, productionChecks } from '~/lib/productionAuthorization';

const useProductionAuthorization = ({ kind, crew, facility, origin, destination, deposit, duration, lease, purchase }) => {
  const { authorize, recheckAuthorization, retryAuthorization } = useCrewContext();
  const blockTime = useBlockTime();
  const createAlert = useStore(s => s.dispatchAlertLogged);
  // Keep the displayed quote stable between input changes. Submission recomputes
  // completion against the current block and freshly loaded crew readiness.
  const request = useMemo(() => ({
    kind, crew, facility, origin, destination, deposit,
    completionTime: Time.getProductionCompletionTime(blockTime || 0, crew?.Crew?.readyAt || 0, duration || 0),
    evaluationTime: blockTime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [kind, crew?.id, crew?.Crew?.readyAt, facility?.id, origin?.id, destination?.id, deposit?.id, duration]);
  const { completionTime } = request;
  const entities = [crew, facility, origin, destination, deposit].filter(Boolean);
  const decision = authorize('production', [request], entities);
  const checks = productionChecks(request).map(([method, args]) => authorize(method, args, entities));
  const acquisitions = { lease, purchase };
  const allowed = !lease && !purchase ? decision.status === 'allowed'
    : checks.every((check, index) => check.status === 'allowed' || acquisitionMatches(check, index, request, acquisitions));
  const checkCurrent = async () => {
    if (!lease && !purchase) return recheckAuthorization('production', [{ ...request, duration }], entities);
    let finalRequest = request;
    for (let index = 0; index < checks.length; index += 1) {
      const [method, args] = productionChecks(finalRequest)[index];
      const result = await recheckAuthorization(method, args, entities);
      if (result.status === 'unresolved') return result;
      if (index === 0) {
        const currentCrew = result.entities?.find((entity) => entity.label === crew.label && Number(entity.id) === Number(crew.id));
        if (currentCrew?.Crew?.readyAt == null) return { status: 'unresolved' };
        finalRequest = { ...request, evaluationTime: blockTime, completionTime: Time.getProductionCompletionTime(blockTime, currentCrew.Crew.readyAt, duration) };
      }
      if (result.status === 'denied' && !acquisitionMatches(result, index, finalRequest, acquisitions)) return result;
      if (result.status === 'allowed' && ((index === 0 && purchase) || (index === 1 && lease))) return { status: 'denied', reason: errorMessages.productionChanged };
    }
    return { status: 'allowed' };
  };
  const recheck = async () => {
    const result = await checkCurrent();
    if (result.status !== 'allowed') {
      reportFailure(createAlert, result, { message: 'productionChanged' });
      retryAuthorization();
    }
    return result;
  };
  return { allowed, recheck, completionTime, message: (allowed ? null : checks.some((check) => check.status === 'unresolved')
    ? 'Checking production permissions…' : 'Access must cover this job through completion. Extend expiring leases or choose another facility or destination.'), decision };
};
export default useProductionAuthorization;
