import { useCallback } from 'react';
import useStore from './useStore';
import { reportFailure } from '../lib/errorReporting';

// Submission guards report here even when a dialog ignores their return value.
const useFailureReporter = () => {
  const notify = useStore(s => s.dispatchAlertLogged);
  return useCallback(result => {
    const failure = { ...result };
    reportFailure(notify, failure, { message: result?.status === 'denied' || result?.status === 'blocked' ? 'accessChanged' : 'accessUnavailable' });
    return failure;
  }, [notify]);
};
export default useFailureReporter;
