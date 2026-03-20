import { useCallback, useEffect } from 'react';
import styled from 'styled-components';
import { Tooltip } from 'react-tooltip';
import { Switch, Route, Redirect } from 'react-router-dom';
import moment from 'moment';

import { appConfig } from '~/appConfig';
import { InfluenceIcon, PurchaseAsteroidIcon } from '~/components/Icons';
import useCrewContext from '~/hooks/useCrewContext';
import useScreenSize from '~/hooks/useScreenSize';
import useStore from '~/hooks/useStore';
import { openAccessJSTime } from '~/lib/utils';
import Alerts, { useControlledAlert } from './interface/Alerts';
import Draggables from './interface/Draggables';
import HUD from './interface/HUD';
import MainMenu from './interface/MainMenu';
import RecruitCrewmate from './interface/RecruitCrewmate';
import ListView from './interface/details/ListView';
import AsteroidDetails from './interface/details/AsteroidDetails';
// import CrewAssignment from './interface/details/crewAssignments/Assignment';
// import CrewAssignmentComplete from './interface/details/crewAssignments/Complete';
import CrewmateDetails from './interface/details/CrewmateDetails';
import Marketplace from './interface/details/Marketplace';
import ShipViewer from './interface/modelViewer/ShipViewer';
import LinkedViewer from './interface/modelViewer/LinkedViewer';
import DevToolsViewer from './interface/modelViewer/DevToolsViewer';
import CrewDetails from './interface/details/CrewDetails';
import { BuildingDeepLink } from './interface/DeepLink';
import { LotDeepLink } from './interface/DeepLink';
import { ShipDeepLink } from './interface/DeepLink';
import RandomEvent from './interface/RandomEvent';
import Intro from './Intro';
import Cutscene from './Cutscene';
import Launcher from './Launcher';
import QueryLoader from './QueryLoader';
import theme from '~/theme';

const StyledInterface = styled.div`
  align-items: stretch;
  bottom: 0;
  display: ${p => p.hide ? 'none' : 'flex'};
  flex: 1 1 0;
  pointer-events: none;
  position: absolute;
  top: 0;
  max-width: 100%;
  min-width: 100%;
  z-index: 1000;

  & a {
    color: ${p => p.theme.colors.mainText};
  }

  & a:hover {
    color: white;
    text-decoration: none;
  }
`;

const MainContainer = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  height: 100%;
  justify-content: flex-end;
  position: relative;
  min-width: 0;

  @media (max-width: ${p => p.theme.breakpoints.mobile}px) {
    align-items: normal;
    bottom: 0;
    position: absolute;
    width: 100%;
  }
`;

const DISABLE_INTRO_ANIMATION = appConfig.get('App.disableIntroAnimation');

const Interface = () => {
  const { isLaunched } = useCrewContext();
  const { isMobile } = useScreenSize();
  const cutscene = useStore(s => s.cutscene);
  const launcherPage = useStore(s => s.launcherPage);
  const interfaceHidden = useStore(s => s.graphics.hideInterface);
  const showDevTools = useStore(s => s.graphics.showDevTools);
  const dispatchLauncherPage = useStore(s => s.dispatchLauncherPage);
  const dispatchRecenterCamera = useStore(s => s.dispatchRecenterCamera);
  const dispatchReorientCamera = useStore(s => s.dispatchReorientCamera);
  const dispatchToggleInterface = useStore(s => s.dispatchToggleInterface);
  const dispatchToggleDevTools = useStore(s => s.dispatchToggleDevTools);

  const handleInterfaceShortcut = useCallback((e) => {
    // ctrl+-
    if (e.ctrlKey && e.which === 189) dispatchLauncherPage(launcherPage ? undefined : 'play');
    // ctrl+1
    if (e.ctrlKey && e.which === 49) dispatchLauncherPage('settings');
    // ctrl+2
    if (e.ctrlKey && e.which === 50) dispatchLauncherPage('help');
    // ctrl+3
    if (e.ctrlKey && e.which === 51) dispatchLauncherPage('store');
    // ctrl+4
    if (e.ctrlKey && e.which === 52) dispatchLauncherPage('rewards');
    // ctrl+5
    if (e.ctrlKey && e.which === 53) dispatchLauncherPage('inbox');

    // ctrl+f9
    if (e.ctrlKey && e.which === 120) dispatchToggleInterface();
    // ctrl+f10
    if (e.ctrlKey && e.which === 121) dispatchToggleDevTools();
    // ctrl+period
    if (e.ctrlKey && e.which === 190) dispatchRecenterCamera(true);
    // ctrl+backslash
    if (e.ctrlKey && e.which === 220) dispatchReorientCamera(true);
  }, [dispatchToggleInterface, dispatchToggleDevTools, dispatchRecenterCamera, dispatchReorientCamera, launcherPage]);

  useEffect(() => {
    document.addEventListener('keyup', handleInterfaceShortcut);
    return () => {
      document.removeEventListener('keyup', handleInterfaceShortcut);
    }
  }, [handleInterfaceShortcut]);

  // TODO: _launcher vvv
  const { create, destroy } = useControlledAlert();
  useEffect(() => {
    if (!isLaunched) {
      const alertId = create({
        icon: <span style={{ color: theme.colors.success }}><PurchaseAsteroidIcon /></span>,
        content: (
          <div style={{ color: theme.colors.success }}>
              {`Launch is coming! ${moment(openAccessJSTime).format('MMM Do YYYY, h:mma')}`}
          </div>
        ),
        level: 'success'
      });
      return () => {
        destroy(alertId);

        create({
          icon: <InfluenceIcon />,
          content: <>Welcome to Adalia. You will forever have been the first among us. Enjoy.</>,
          duration: 10000,
        });
      }
    }
  }, [isLaunched]);
  // ^^^^

  return (
    <>
      <Alerts />
      {!DISABLE_INTRO_ANIMATION && <Intro />}
      {cutscene && <Cutscene />}
      {launcherPage && <Launcher />}
      {showDevTools && <DevToolsViewer />}
      <StyledInterface hide={interfaceHidden}>
        {!isMobile && <Tooltip id="globalTooltip" place="left" />}
        <QueryLoader />
        <MainContainer>
          <Switch>
            <Redirect from="/:i(\d+)" to="/asteroids/:i" />
            <Route path="/asteroids/:i(\d+)/:tab?/:category?">
              <AsteroidDetails />
            </Route>
            <Route path="/crew/:i(\d+)?">
              <CrewDetails />
            </Route>
            <Route path="/crewmate/:i(\d+)">
              <CrewmateDetails />
            </Route>
            <Route exact path="/listview/:assetType?">
              <ListView />
            </Route>
            <Route path="/model/:assetType/:assetName?">
              <LinkedViewer />
            </Route>
            <Route path="/marketplace/:asteroidId([0-9]+)/:lotIndex(all|[0-9]+)?/:discriminator?">
              <Marketplace />
            </Route>
            <Route path="/random-event">
              <RandomEvent />
            </Route>
          </Switch>

          <ShipViewer />
          <HUD />
          <MainMenu />
        </MainContainer>

        {/* TODO: ecs refactor -- it's unclear why this switch is different from the above... maybe reconcile? */}
        <Switch>
          <Route path="/building/:id(\d+)">
            <BuildingDeepLink />
          </Route>
          <Route path="/lot/:id(\d+)">
            <LotDeepLink />
          </Route>
          <Route path="/ship/:id(\d+)">
            <ShipDeepLink />
          </Route>
          <Route path="/recruit/:crewId([0-9]+)/:locationId([0-9]+)?/:crewmateId([0-9]+)?/:page?">
            <RecruitCrewmate />
          </Route>
        </Switch>
        <Draggables />
      </StyledInterface>
    </>
  );
};

export default Interface;
