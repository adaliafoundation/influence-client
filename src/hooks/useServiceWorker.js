import { useCallback, useEffect, useRef, useState } from 'react';

const useServiceWorker = () => {
  const [isInstalling, setIsInstalling] = useState(process.env.NODE_ENV !== 'development');
  const [updateNeeded, setUpdateNeeded] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const refreshing = useRef(false);
  const reloadTimeout = useRef();

  const reload = useCallback(() => {
    clearTimeout(reloadTimeout.current);
    if (refreshing.current) return;
    refreshing.current = true;
    window.location.reload();
  }, []);

  useEffect(() => () => clearTimeout(reloadTimeout.current), []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      setIsInstalling(false);
      return undefined;
    }

    let disposed = false;
    const cleanups = [];
    const listen = (target, event, handler) => {
      target.addEventListener(event, handler);
      cleanups.push(() => target.removeEventListener(event, handler));
    };

    listen(navigator.serviceWorker, 'controllerchange', reload);

    navigator.serviceWorker.getRegistration().then((registration) => {
      if (disposed) return;
      if (!registration) {
        setIsInstalling(false);
        return;
      }

      const watchInstallingWorker = () => {
        const worker = registration.installing;
        if (!worker) return;
        setIsInstalling(!navigator.serviceWorker.controller);
        listen(worker, 'statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            setUpdateNeeded(true);
            setIsInstalling(false);
          } else if (worker.state === 'activated' || worker.state === 'redundant') {
            setIsInstalling(false);
          }
        });
      };

      setIsInstalling(!registration.active && !!registration.installing);
      setUpdateNeeded(!!registration.waiting && !!navigator.serviceWorker.controller);
      listen(registration, 'updatefound', watchInstallingWorker);
      watchInstallingWorker();
    }).catch(() => {
      if (!disposed) setIsInstalling(false);
    });

    return () => {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [reload]);

  const onUpdateVersion = useCallback(async () => {
    if (refreshing.current || reloadTimeout.current) return;
    setIsUpdating(true);
    // A stalled activation must not leave the explicit reload action pending forever.
    reloadTimeout.current = setTimeout(reload, 10000);
    if (!('serviceWorker' in navigator)) {
      reload();
      return;
    }
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (refreshing.current) return;
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else {
        reload();
      }
    } catch (error) {
      reload();
    }
  }, [reload]);

  return { isInstalling, updateNeeded, isUpdating, onUpdateVersion };
};

export default useServiceWorker;
