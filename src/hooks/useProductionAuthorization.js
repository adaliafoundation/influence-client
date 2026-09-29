import { Time } from '@influenceth/sdk';
import { useEffect, useState } from 'react';
import useCrewContext from './useCrewContext';
import useBlockTime from './useBlockTime';
import { acquisitionMatches, productionChecks } from '~/lib/productionAuthorization';

const useProductionAuthorization = ({ kind, crew, facility, origin, destination, deposit, duration, lease, purchase }) => {
  const { authorize, recheckAuthorization, retryAuthorization } = useCrewContext();
  const blockTime = useBlockTime();
  const [submissionFailure, setSubmissionFailure] = useState(null);
  const completionTime = Time.getProductionCompletionTime(blockTime || 0, crew?.Crew?.readyAt || 0, duration || 0);
  const request = { kind, crew, facility, origin, destination, deposit, completionTime, evaluationTime: blockTime };
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
        finalRequest = { ...request, completionTime: Time.getProductionCompletionTime(blockTime, currentCrew.Crew.readyAt, duration) };
      }
      if (result.status === 'denied' && !acquisitionMatches(result, index, finalRequest, acquisitions)) return result;
      if (result.status === 'allowed' && ((index === 0 && purchase) || (index === 1 && lease))) return { status: 'denied', reason: 'Access changed. Review the updated job quote.' };
    }
    return { status: 'allowed' };
  };
  useEffect(() => { if (allowed) setSubmissionFailure(null); }, [allowed]);
  const recheck = async () => {
    const result = await checkCurrent();
    if (result.status !== 'allowed') {
      setSubmissionFailure('Permissions or the job quote changed. Review the job before trying again.');
      retryAuthorization();
    }
    return result;
  };
  return { allowed, recheck, completionTime, message: submissionFailure || (allowed ? null : checks.some((check) => check.status === 'unresolved')
    ? 'Checking production permissions…' : 'Access must cover this job through completion. Extend expiring leases or choose another facility or destination.'), decision };
};
export default useProductionAuthorization;
