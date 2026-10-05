import { useCallback, useEffect, useRef, useState } from 'react';
import useStore from '~/hooks/useStore';
import { observeTransactionSettlement } from '../lib/transactionSettlement';
import { reportFailure } from '../lib/errorReporting';

// Standalone transaction buttons use the same indexed completion signal as action dialogs.
const useTransactionSubmission = () => {
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const pending = useRef(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.current?.dispose();
    };
  }, []);

  const run = useCallback(async (action) => {
    if (!mounted.current || pending.current) return;
    const observer = observeTransactionSettlement();
    pending.current = observer;
    setBusy(true);
    try {
      const result = await action();
      if (result?.status === 'submitted' && result.txHash) return await observer.waitFor(result.txHash);
      return result;
    } catch (error) {
      if (mounted.current) reportFailure(useStore.getState().dispatchAlertLogged, error);
      return { status: 'failed' };
    } finally {
      observer.dispose();
      pending.current = null;
      if (mounted.current) setBusy(false);
    }
  }, []);

  return { busy, run };
};

export default useTransactionSubmission;
