import { useCallback, useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { ThemeProvider, createGlobalStyle } from 'styled-components';
import { BrowserRouter as Router, Switch, Route, useHistory, useLocation } from 'react-router-dom';
import { getGPUTier } from 'detect-gpu';

import { appConfig } from '~/appConfig';
import FullpageInterstitial from '~/components/FullpageInterstitial';
import VersionUpdateDialog from '~/components/VersionUpdateDialog';
import { ActionItemProvider } from '~/contexts/ActionItemContext';
import { ActivitiesProvider } from '~/contexts/ActivitiesContext';
import { CoachmarkProvider } from '~/contexts/CoachmarkContext';
import { CrewProvider } from './contexts/CrewContext';
import { ChainTransactionProvider } from '~/contexts/ChainTransactionContext';
import { DevToolProvider } from '~/contexts/DevToolContext';
import { ScreensizeProvider } from '~/contexts/ScreensizeContext';
import { SessionProvider } from '~/contexts/SessionContext';
import { SyncedTimeProvider } from '~/contexts/SyncedTimeContext';
import WagmiContextProvider from '~/contexts/WagmiContext';
import { WebsocketProvider } from '~/contexts/WebsocketContext';
import Audio from '~/game/Audio';
import ChatListener from '~/game/ChatListener';
import Interface from '~/game/Interface';
import LandingPage from '~/game/Landing';
import Referral from '~/game/Referral';
import Scene from '~/game/Scene';
import StripeListener from '~/game/StripeListener';
import useSession from '~/hooks/useSession';
import useServiceWorker from '~/hooks/useServiceWorker';
import useStore from '~/hooks/useStore';
import { getGraphicsDefaults } from '~/lib/graphics/quality';
import ScreensizeWarning from '~/ScreensizeWarning';
import theme from '~/theme';

import { initializeTagManager } from './gtm';

const StyledMain = styled.main`
  bottom: 0;
  display: flex;
  min-height: 100%;
  overflow: hidden;
  position: absolute;
  top: 0;
  width: 100%;
`;

const GlobalStyle = createGlobalStyle`
  label {
    cursor: inherit;
  }
  .react-tooltip {
    background: #222 !important;
    font-size: 13px !important;
    padding: 8px 21px !important;
    z-index: 999;
  }

  /* for starknet modals */
  .s-dialog {
    z-index: 1010 !important;
  }
  .s-overlay {
    z-index: 1009 !important;
  }
`;

const DISABLE_LAUNCHER_LANDING = appConfig.get('App.disableLauncherLanding');

const CrewSwitcher = () => {
  const history = useHistory();
  const location = useLocation();

  const dispatchCrewSelected = useStore(s => s.dispatchCrewSelected);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const crewId = searchParams.get('crewId');
    if (crewId) {
      dispatchCrewSelected(Number(crewId));
      searchParams.delete('crewId');
      history.replace({
        pathname: location.pathname,
        search: searchParams.toString(),
      });
    }
  }, [location.search]);

  return null;
};

const LauncherRedirect = () => {
  const { authenticated } = useSession();
  const history = useHistory();

  const launcherPage = useStore(s => s.launcherPage);
  const dispatchLauncherPage = useStore(s => s.dispatchLauncherPage);

  // redirect to launcher if initial load and trying to link to /launcher/*
  useEffect(() => {
    const parts = history.location.pathname.split('/').slice(1);
    const deeplink = parts[0] === 'launcher';
    if (deeplink || !DISABLE_LAUNCHER_LANDING) {
      const destinationPage = (deeplink && parts[1]) ? parts[1] : true;
      if (launcherPage !== destinationPage) {
        dispatchLauncherPage(destinationPage, parts[2]);
      }
      if (deeplink) {
        history.replace('/');
      }
    }
  }, []);

  // redirect to launcher if was logged in and is now logged out (and not already on launcher)
  const wasLoggedIn = useRef(false);
  useEffect(() => {
    if (authenticated) {
      wasLoggedIn.current = true;
    } else {
      if (wasLoggedIn.current && !launcherPage) {
        dispatchLauncherPage(true);
      }
      wasLoggedIn.current = false;
    }
  }, [!authenticated]);

  return null;
};

const Game = () => {
  const [ gpuInfo, setGpuInfo ] = useState();
  const { isInstalling, updateNeeded, onUpdateVersion } = useServiceWorker();
  const [debugUpdateNeeded, setDebugUpdateNeeded] = useState(false);

  const createAlert = useStore(s => s.dispatchAlertLogged);
  const dispatchGpuInfo = useStore(s => s.dispatchGpuInfo);
  const setAutodetect = useStore(s => s.dispatchGraphicsAutodetectSet);
  const graphics = useStore(s => s.graphics);
  const [ showScene, setShowScene ] = useState(false);
  const [ loadingMessage, setLoadingMessage ] = useState('Initializing');
  const handleShowVersionUpdateDebug = useCallback(() => setDebugUpdateNeeded(true), []);

  // Initialize tag manager
  useEffect(() => {
    initializeTagManager();
  }, []);

  useEffect(() => {
    let unmounted = false;
    const fallbackGpuInfo = { isMobile: false, tier: 1 };
    const timeout = setTimeout(() => {
      if (!unmounted) setGpuInfo((prev) => prev || fallbackGpuInfo);
    }, 5000);

    getGPUTier()
      .then((result) => {
        if (!unmounted) setGpuInfo(result || fallbackGpuInfo);
      })
      .catch((e) => {
        console.warn('GPU detection failed, using fallback tier', e);
        if (!unmounted) setGpuInfo(fallbackGpuInfo);
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      unmounted = true;
      clearTimeout(timeout);
    };
  }, []);

  const autodetectNeedsInit = graphics?.autodetect === undefined;
  useEffect(() => {
    if (!gpuInfo) return;

    if (!gpuInfo.isMobile) {
      setShowScene(true);

      // init autodetect (since it was recently added to store)
      if (autodetectNeedsInit) {
        const detectedDefaults = getGraphicsDefaults(gpuInfo);
        setAutodetect(
          graphics?.textureQuality === detectedDefaults.textureQuality,
          gpuInfo
        );
      }

      dispatchGpuInfo(gpuInfo);

      if (gpuInfo.tier === 0) {
        createAlert({
          type: 'Game_GPUPrompt',
          level: 'warning'
        });
      }
    }
  }, [ gpuInfo, createAlert, dispatchGpuInfo, autodetectNeedsInit ]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpdateVersion = useCallback(() => {
    if (updateNeeded) {
      onUpdateVersion();
    } else {
      window.location.reload();
    }
  }, [updateNeeded, onUpdateVersion]);

  useEffect(() => {
    if (isInstalling) {
      const messages = [
        'Correcting for gravitational anomalies',
        'Merging divergent lightshard states',
        'Scanning for trajectory intersections',
        'Provisioning arbitrage limiters',
        'Recategorizing resident behavioral profiles',
        'Awaiting launch permits',
        'Brushing the dust off',
        'Re-establishing optical communications',
        'Re-routing around reactor breach zone',
        'Optimizing growth conditions',
        'Creating micrometeorite ablation profile',
        'Defrosting feline embryos',
        'Submitting revised flight plan for review',
        'Adjusting uranium/neon vortex ratios',
        'Completing centrifuge lining replacement',
        'Clearing shotcrete nozzle blockage'
      ];

      const intervalID = setInterval(() =>  {
        setLoadingMessage(messages[Math.floor(Math.random() * messages.length)]);
      }, 3500);

      return () => clearInterval(intervalID);
    }
  }, [isInstalling]);

  return (
    <>
      <GlobalStyle />

      {isInstalling && !updateNeeded && <FullpageInterstitial message={`${loadingMessage}...`} />}
      {(!isInstalling || updateNeeded) && (
        <WagmiContextProvider>
          <SessionProvider>
            <CrewProvider>
              <WebsocketProvider>
              <ChatListener />
              <StripeListener />
              <Router>
                <Referral />
                <CrewSwitcher />
                <Switch>

                  {/* for socialmedia links that need to pull opengraph tags (will redirect to discord or main app) */}
                  <Route path="/play">
                    <LandingPage />
                  </Route>

                  {/* for everything else */}
                  <Route>

                    {/* redirect user to launcher (when appropriate) */}
                    <LauncherRedirect />

                    {/* main app wrapper */}
                    <StyledMain>
                      <DevToolProvider onShowVersionUpdateDebug={handleShowVersionUpdateDebug}>

                        {/* all ui-specific context providers wrapping interface and new-user flow */}
                        <ActivitiesProvider>
                          <ChainTransactionProvider>
                            <SyncedTimeProvider>
                              <ActionItemProvider>
                                <ThemeProvider theme={theme}>
                                  <ScreensizeProvider>
                                    <CoachmarkProvider>
                                      <ScreensizeWarning />
                                      <Interface />
                                      {(updateNeeded || debugUpdateNeeded) && (
                                        <VersionUpdateDialog onReload={handleUpdateVersion} />
                                      )}
                                    </CoachmarkProvider>
                                  </ScreensizeProvider>
                                </ThemeProvider>
                              </ActionItemProvider>
                            </SyncedTimeProvider>
                          </ChainTransactionProvider>
                        </ActivitiesProvider>

                        {/* 3d scene */}
                        {showScene && <Scene />}

                        {/* audio */}
                        <Audio />

                      </DevToolProvider>
                    </StyledMain>
                  </Route>
                </Switch>
              </Router>
              </WebsocketProvider>
            </CrewProvider>
          </SessionProvider>
        </WagmiContextProvider>
      )}
    </>
  );
};

export default Game;
