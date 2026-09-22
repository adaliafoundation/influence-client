import { useCallback, useEffect, useRef, useState } from 'react';

const useServiceWorker = () => {
  const [isInstalling, setIsInstalling] = useState(process.env.NODE_ENV !== 'development');
  const [updateNeeded, setUpdateNeeded] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const refreshing = useRef(false);

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

    listen(navigator.serviceWorker, 'controllerchange', () => {
      if (refreshing.current) return;
      refreshing.current = true;
      window.location.reload();
    });

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
  }, []);

  const onUpdateVersion = useCallback(async () => {
    if (!('serviceWorker' in navigator)) {
      window.location.reload();
      return;
    }
    setIsUpdating(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration?.waiting) {
        // Activation is asynchronous. Only controllerchange may reload the page.
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else {
        setUpdateNeeded(false);
        setIsUpdating(false);
      }
    } catch (error) {
      setIsUpdating(false);
    }
  }, []);

  return { isInstalling, updateNeeded, isUpdating, onUpdateVersion };
};

export default useServiceWorker;
