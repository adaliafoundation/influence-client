import { useCallback, useEffect, useRef, useState } from 'react';

const useServiceWorker = () => {
  // no service worker in dev mode, so don't default to "installing" in that case
  const [isInstalling, setIsInstalling] = useState(process.env.NODE_ENV !== 'development');
  const [updateNeeded, setUpdateNeeded] = useState(false);
  const refreshing = useRef(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {

      // if there is a controller change (i.e. if new serviceworker becomes active),
      // reload the page so that newly cached assets are actually the ones in use
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing.current) return;
        refreshing.current = true;
        window.location.reload();
      });

      // evaluate serviceworker state, prompt user to reload if a new version is ready
      navigator.serviceWorker.getRegistration().then((registration) => {
        // if registration failed to even get started, make sure not stuck in "installing" state
        if (!registration) {
          setIsInstalling(false);
          return;
        }

        // if there is an installing worker, wait until it is installed, then prompt user to update
        const awaitInstallingWorker = () => {
          if (registration.installing) {
            const installingWorker = registration.installing;
            installingWorker.addEventListener('statechange', () => {
              // when the installing worker is installed...
              if (installingWorker.state === 'installed') {
                // if there is an existing controller, prompt to update... else, assume will become activated
                if (navigator.serviceWorker.controller) {
                  setUpdateNeeded(true);
                }

              // if the installing worker is activated (success) or redundant (install failure)
              } else if (installingWorker.state === 'activated' || installingWorker.state === 'redundant') {
                setIsInstalling(false);
              }
            });
          }
        };

        // already waiting (i.e. ready)
        if (registration.waiting) {
          setUpdateNeeded(true);

        // already installing (i.e. ready once installed)
        } else if (registration.installing) {
          setIsInstalling(true);
          awaitInstallingWorker();

        // nothing happening yet (either first load OR refresh without a service worker update ready)
        } else {

          // if already has an active service worker, can install in the background whenever the next
          // one comes in, so no need to show an interstitial
          if (registration.active) setIsInstalling(false);

          // listen for updates
          registration.addEventListener('updatefound', () => {
            awaitInstallingWorker();
          });
        }
      })
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isInstalling,
    updateNeeded,
    onUpdateVersion: useCallback(() => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration()
          .then((registration) => {
            if (registration && registration.waiting) {
              registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
          })
          .finally(() => window.location.reload());
      } else {
        window.location.reload();
      }
    }, [])
  }
};

export default useServiceWorker;
