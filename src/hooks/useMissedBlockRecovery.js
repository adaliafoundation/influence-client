import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

// Consume each missed-block notification once. Leaving it set would refetch the
// entire application every time the player returned from another window.
const useMissedBlockRecovery = (enabled, isBlockMissing, setIsBlockMissing) => {
  const queryClient = useQueryClient();
  const recovery = useRef();
  recovery.current = { isBlockMissing, setIsBlockMissing };

  useEffect(() => {
    if (!enabled) return undefined;
    let blurred = false;
    const onBlur = () => { blurred = true; };
    const onFocus = () => {
      if (!blurred) return;
      blurred = false;
      if (!recovery.current.isBlockMissing) return;

      // Clear before starting the refresh so a new gap during recovery is kept.
      recovery.current.isBlockMissing = false;
      recovery.current.setIsBlockMissing(false);
      queryClient.invalidateQueries({}, { cancelRefetch: false });
    };
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled, queryClient]);
};

export default useMissedBlockRecovery;
