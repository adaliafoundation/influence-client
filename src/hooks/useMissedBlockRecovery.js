import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { recoverGameplayQueries } from '../lib/queryRecovery';

// Consume each missed-block notification once. Leaving it set would refetch the
// game data every time the player returned from another window.
const useMissedBlockRecovery = (enabled, isBlockMissing, setIsBlockMissing) => {
  const queryClient = useQueryClient();
  const recovery = useRef();
  recovery.current = { isBlockMissing, setIsBlockMissing };

  useEffect(() => {
    if (!enabled) return undefined;
    const recover = () => {
      if (document.visibilityState === 'hidden') return;
      if (!recovery.current.isBlockMissing) return;

      // Clear before starting the refresh so a new gap during recovery is kept.
      recovery.current.isBlockMissing = false;
      recovery.current.setIsBlockMissing(false);
      recoverGameplayQueries(queryClient);
    };
    recover();
    window.addEventListener('focus', recover);
    document.addEventListener('visibilitychange', recover);
    return () => {
      window.removeEventListener('focus', recover);
      document.removeEventListener('visibilitychange', recover);
    };
  }, [enabled, isBlockMissing, queryClient]);
};

export default useMissedBlockRecovery;
