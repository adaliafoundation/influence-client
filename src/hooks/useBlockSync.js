import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import api from '~/lib/api';
import { recoverGameplayQueries } from '../lib/queryRecovery';

const STALE_AFTER = 60000;

// Recover from silent websocket stalls, including a suspended tab waking up.
const useBlockSync = (enabled, blockNumber, setBlockNumber, setBlockTime) => {
  const queryClient = useQueryClient();
  const latestBlock = useRef(blockNumber);
  const lastProgress = useRef(Date.now());
  useEffect(() => {
    latestBlock.current = blockNumber;
    lastProgress.current = Date.now();
  }, [blockNumber]);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let inFlight = false;
    let lastAttempt = 0;
    const refresh = async () => {
      const now = Date.now();
      if (document.visibilityState === 'hidden' || inFlight
        || now - lastProgress.current < STALE_AFTER || now - lastAttempt < STALE_AFTER) return;
      inFlight = true;
      lastAttempt = now;
      try {
        const data = await api.getUser({ includeBlockData: true });
        if (cancelled) return;
        if (data.blockNumber > latestBlock.current && data.blockTimestamp > 0) {
          setBlockNumber(previous => Math.max(previous, data.blockNumber));
          setBlockTime(previous => Math.max(previous, data.blockTimestamp));
          // Missing block notifications can also mean missing entity updates.
          await recoverGameplayQueries(queryClient);
        }
      } catch (error) {
        if (!cancelled) console.warn('Unable to refresh stalled block updates', error);
      } finally {
        inFlight = false;
      }
    };
    const interval = setInterval(refresh, STALE_AFTER);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [enabled, queryClient, setBlockNumber, setBlockTime]);
};

export default useBlockSync;
