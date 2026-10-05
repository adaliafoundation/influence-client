import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

// Use the button's existing eligibility rules after the click-time refresh commits.
const useActionButtonClick = ({ disabled, onClick, refresh, reportBlocked }) => {
  const [checking, setChecking] = useState(false);
  const [accessLost, setAccessLost] = useState(false);
  const current = useRef();
  current.current = { disabled, onClick, refresh };
  const mounted = useRef(true);
  const checkingRef = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const handleClick = useCallback(async () => {
    if (current.current.disabled || checkingRef.current) return;
    if (!refresh) return current.current.onClick?.();
    checkingRef.current = true;
    setChecking(true);
    try {
      const result = await refresh();
      flushSync(() => { if (mounted.current) setChecking(false); });
      if (mounted.current && current.current.refresh !== refresh) return;
      if (result.status !== 'allowed' || !mounted.current || current.current.disabled) {
        const unresolved = result.status === 'unresolved' || current.current.disabled === true || /checking|loading/i.test(current.current.disabled || '');
        if (mounted.current && current.current.disabled && !unresolved) setAccessLost(true);
        reportBlocked({ ...result, status: unresolved ? 'unresolved' : 'denied' });
        return;
      }
      current.current.onClick?.();
    } catch (error) {
      reportBlocked({ status: 'unresolved', error });
    } finally {
      checkingRef.current = false;
      if (mounted.current) setChecking(false);
    }
  }, [refresh, reportBlocked]);
  return { checking, hidden: accessLost && !!disabled, handleClick };
};

export default useActionButtonClick;
