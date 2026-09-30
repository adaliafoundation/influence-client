import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import ActionSubmissionContext from '../contexts/ActionSubmissionContext';
import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useStore from '~/hooks/useStore';
import { observeTransactionSettlement } from '../lib/transactionSettlement';
import { reportFailure } from '../lib/errorReporting';

// One submission owner per dialog. Managers keep using the transaction context;
// buttons share preparation state without each implementing their own lifecycle.
const ActionSubmissionProvider = ({ children, onClose, onSetAction, onSuccess }) => {
  const chain = useContext(ChainTransactionContext);
  const chainExecute = chain.execute;
  const [activeButton, setActiveButton] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const mounted = useRef(true);
  const running = useRef(false);
  const transaction = useRef(null);
  const queuedNavigation = useRef(null);
  const queuedClose = useRef(false);
  const callbacks = useRef();
  callbacks.current = { onClose, onSetAction, onSuccess };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      transaction.current?.dispose();
    };
  }, []);

  const execute = useCallback(async (...args) => {
    if (!mounted.current || transaction.current) return;
    const observer = observeTransactionSettlement();
    transaction.current = observer;
    setExecuting(true);
    try {
      const submitted = await chainExecute(...args);
      if (!submitted?.txHash || submitted.status !== 'submitted') return submitted;
      const result = await observer.waitFor(submitted.txHash);
      if (mounted.current && result.status === 'indexed') {
        if (queuedNavigation.current) callbacks.current.onSetAction(...queuedNavigation.current);
        else if (queuedClose.current) callbacks.current.onClose();
        else callbacks.current.onSuccess?.(args[0]);
      }
      return result;
    } catch (error) {
      if (mounted.current) reportFailure(useStore.getState().dispatchAlertLogged, error);
      return { status: 'failed' };
    } finally {
      observer.dispose();
      transaction.current = null;
      queuedNavigation.current = null;
      queuedClose.current = false;
      if (mounted.current) setExecuting(false);
    }
  }, [chainExecute]);

  const run = useCallback(async (action, buttonId) => {
    if (!mounted.current || running.current || transaction.current) return;
    running.current = true;
    setActiveButton(buttonId);
    setPreparing(true);
    try {
      return await action();
    } catch (error) {
      if (mounted.current) reportFailure(useStore.getState().dispatchAlertLogged, error);
    } finally {
      running.current = false;
      if (!transaction.current) {
        queuedNavigation.current = null;
        queuedClose.current = false;
      }
      if (mounted.current) setPreparing(false);
    }
  }, []);
  const dismiss = useCallback(() => callbacks.current.onClose(), []);
  const requestClose = useCallback(() => {
    if (!mounted.current) return;
    if (running.current || transaction.current) queuedClose.current = true;
    else callbacks.current.onClose();
  }, []);
  const navigate = useCallback((...args) => {
    if (!mounted.current) return;
    if (running.current || transaction.current) queuedNavigation.current = args;
    else callbacks.current.onSetAction(...args);
  }, []);
  const value = useMemo(() => ({ busy: preparing || executing, activeButton, run, dismiss, requestClose, navigate }),
    [preparing, executing, activeButton, run, dismiss, requestClose, navigate]);
  const transactionContext = useMemo(() => ({ ...chain, execute }), [chain, execute]);
  return (
    <ActionSubmissionContext.Provider value={value}>
      <ChainTransactionContext.Provider value={transactionContext}>{children}</ChainTransactionContext.Provider>
    </ActionSubmissionContext.Provider>
  );
};
export default ActionSubmissionProvider;
