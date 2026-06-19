import { useCallback, useEffect, useState } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { PuffLoader as Loader } from 'react-spinners';
import { Tooltip } from 'react-tooltip';

import { appConfig } from '~/appConfig';
import Badge from '~/components/Badge';
import LoginPrompt from '~/components/LoginPrompt';
import useSession from '~/hooks/useSession';
import useStore from '~/hooks/useStore';
import { getLicensedAssetUrl } from '~/lib/assetUtils';
import {
  ChevronDoubleRightIcon,
  UserIcon,
  PlayIcon,
  StoreIcon,
  HelpIcon,
  RewardsIcon,
  SettingsIcon,
  AssetPortalIcon,
  WalletIcon,
  BugIcon,
  DownloadIcon,
  InboxIcon,
  WarningIcon
} from '~/components/Icons';
import InfluenceLogo from '~/components/InfluenceLogo';
import HudMenu from '~/game/interface/hud/HudMenu';
import SystemControls from '~/game/interface/hud/SystemControls';
import { headerHeight, menuPadding } from '~/game/uiConstants';
import usePriceConstants from '~/hooks/usePriceConstants';
import useWalletInbox from '~/hooks/useWalletInbox';
import { fireTrackingEvent } from '~/lib/utils';
import theme from '~/theme';
import Play from './launcher/Play';
import Settings from './launcher/Settings';
import Store from './launcher/Store';
import Help from './launcher/Help';
import Inbox from './launcher/Inbox';
import Rewards from './launcher/Rewards';

const DISABLE_LAUNCH_TRAILER = appConfig.get('App.disableLaunchTrailer');

const footerHeight = 80;
export const navMenuWidth = 250;

// TODO: should add in/out transitions to this page
const StyledLauncher = styled.div`
  background: linear-gradient(to bottom, rgba(0,0,0,0.75), rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.05) 60%, rgba(0,0,0,0.75) 100%);
  backdrop-filter: blur(4px) saturate(100%);
  height: 100vh;
  opacity: 1;
  padding: ${headerHeight + menuPadding}px 0 0;
  position: absolute;
  width: 100vw;
  z-index: 8999;
`;

const ContentWrapper = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
`;

const TopLeftMenu = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  padding: ${menuPadding}px;
`;

const Nav = styled.div`
  margin-top: ${menuPadding}px;
  width: ${navMenuWidth - menuPadding}px;
`;

const Icon = styled.div``;

const initialBorder = 3;
const hoverBorder = 4;
const NavItem = styled.div`
  align-items: center;
  color: ${p => p.selected ? 'white' : (p.isExternal ? '#777' : p.theme.colors.main)};
  cursor: ${p => p.selected ? p.theme.cursors.default : p.theme.cursors.active};
  display: flex;
  flex-direction: row;
  height: ${p => p.isExternal ? 42 : 56}px;
  font-size: ${p => p.selected ? 26 : 18}px;
  line-height: 0;
  margin: 2px 0 2px -25px;
  position: relative;
  text-transform: uppercase;

  ${p => p.isRule && `
    height: 36px;
    color: white;
    &:before {
      content: "";
      border-top: 1px solid ${theme.colors.mainBorder};
      width: 100%;
      margin: 0 25px;
    }
  `}

  & > svg {
    color: ${p => p.selected ? 'white' : 'inherit'};
    font-size: ${p => p.selected ? 36 : 24}px;
    margin-left: ${p => p.selected ? 16 : 20}px;
    margin-right: 10px;
    transition: color 250ms ease, font-size 250ms ease, margin 250ms ease;
  }

  ${p => p.isExternal && `
    font-weight: bold;
    font-size: 14px;
    position: relative;
    &:before {
      border: solid transparent;
      border-width: ${initialBorder}px 0 ${initialBorder}px ${initialBorder}px;
      border-left-color: #555;
      content: '';
      position: absolute;
      left: 0;
      top: 3px;
      bottom: 3px;

      transition: border-color 250ms ease, border-width 250ms ease;
    }
  `}

  ${p => !p.isExternal && !p.isRule && `
    &:before {
      content: "";
      background: ${p.theme.colors.main};
      height: ${p.selected ? 100 : 0}%;
      opacity: ${p.selected ? 1 : 0};
      transition: height 250ms ease, opacity 250ms ease;
      width: 4px;
    }
    &:after {
      content: "";
      background: linear-gradient(to right, rgba(${p.theme.colors.mainRGB}, 0.25) 0%, transparent 100%);
      height: 100%;
      opacity: ${p.selected ? 1 : 0};
      position: absolute;
      transition: width 250ms ease;
      width: ${p.selected ? 250 : 0}px;
      z-index: -1;
    }
  `}

  &:hover {
    color: white;
    ${p => p.isExternal && `
      &:before {
        border-left-color: white;
        border-width: ${hoverBorder}px 0 ${hoverBorder}px ${hoverBorder}px;
      }
    `}
    ${p => !p.isExternal && !p.isRule && `
      &:before {
        height: 100%;
        opacity: 1;
      }
    `}
  }
`;

const LogoWrapper = styled.div`
  height: ${headerHeight}px;
  padding: 8px;
  & > svg {
    height: 100%;
  }

  ${p => p.hideHeader && `
    @media (min-height: ${p.hideHeader}px) {
      display: none;
    }
  `}
`;

const LeftIcon = styled.div`
  align-items: center;
  background: #333;
  border-radius: 100%;
  display: flex;
  font-size: 32px;
  height: 40px;
  justify-content: center;
  position: relative;
  width: 40px;
  ${p => p.connecting
    ? `
      background: rgba(${p.theme.colors.mainRGB}, 0.4);
      color: white;
    `
    : `
      &:after {
        content: "";
        background: ${p.connected ? p.theme.colors.success : p.theme.colors.error};
        position: absolute;
        bottom: 0;
        right: -3px;
        border-radius: 6px;
        height: 12px;
        width: 12px;
      }
    `
  }
  & > img {
    width: 1em;
  }
`;

const RightIcon = styled.div`
  align-items: center;
  display: flex;
  transition: transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
  transform: rotate(${p => p.expanded ? '90deg' : '0deg'});
`;
const HoverContent = styled.label`
  display: none;
`;
const NoHoverContent = styled.label`
  display: block;
`;

const AccountButton = styled.div`
  align-items: center;
  background: ${p => p.expanded ? `rgba(${p.theme.colors.mainRGB}, 0.42)` : 'black'};
  border: 1px solid ${p => p.expanded ? `rgba(${p.theme.colors.brightMainRGB}, 0.9)` : 'black'};
  border-radius: 24px;
  color: ${p => p.expanded ? 'white' : '#AAA'};
  cursor: ${p => p.busy ? p.theme.cursors.default : p.theme.cursors.active};
  display: flex;
  height: 48px;
  padding: 3px 12px 3px 4px;
  width: 300px;
  z-index: 1;
  & label {
    flex: 1;
    font-weight: bold;
    line-height: 0;
    margin-left: 9px;
  }
  transition: background 250ms ease, border-color 250ms ease, color 250ms ease;

  ${p => !p.busy && `
    &:hover {
      background: rgba(${p.theme.colors.mainRGB}, 0.4);
      border-color: rgba(${p.theme.colors.mainRGB}, 0.8);
      color: white;
      ${p.hasHoverContent ? `
        & label {
          display: none;
        }
        & ${HoverContent} {
          display: block;
        }
        & ${NoHoverContent} {
          display: none;
        }
      ` : ''}
    }
  `}
`;

const AccountLoginCluster = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: ${p => p.expanded ? 12 : 0}px;
  max-width: calc(100vw - 32px);
  pointer-events: auto;
  position: ${p => p.isNew ? 'fixed' : 'relative'};
  right: ${p => p.isNew ? '12px' : 'auto'};
  top: ${p => p.isNew ? '12px' : 'auto'};
  transition: gap 360ms cubic-bezier(0.2, 0.8, 0.2, 1),
    transform 360ms cubic-bezier(0.2, 0.8, 0.2, 1);
  width: min(420px, calc(100vw - 32px));

  & > ${AccountButton} {
    flex: 0 0 auto;
  }
`;

const outlineAnimation = keyframes`
  0% { outline-width: 0; }
  50% { outline-width: 6px; }
  100% { outline-width: 0; }
`;

const PlayButton = styled.div`
  align-items: center;
  ${p => p.animate ? css`animation: ${outlineAnimation} 1500ms ease-out infinite;` : ''}
  background: black;
  border: 1px solid rgba(${p => p.rgb || p.theme.colors.mainRGB}, 1);
  border-radius: 50px;
  color: white;
  cursor: ${p => p.theme.cursors[p.disabled ? 'default' : 'active']};
  display: flex;
  font-size: 26px;
  justify-content: center;
  margin: 20px 0 ${p => p.isNew ? 40 : 20}px;
  opacity: ${p => p.disabled ? 0.55 : 1};
  outline: 0 solid rgba(${p => p.rgb || p.theme.colors.mainRGB}, 0.4);
  padding: 0.5em;
  position: relative;
  text-transform: uppercase;
  transition: border-color 250ms ease, opacity 250ms ease;
  width: 300px;
  z-index: 1;
  &:before {
    content: "";
    background: rgba(${p => p.rgb || p.theme.colors.mainRGB}, 0.3);
    border-radius: 50px;
    position: absolute;
    top: 4px; bottom: 4px; left: 4px; right: 4px;
    transition: background 250ms ease;
    z-index: -1;
  }

  ${p => !p.disabled && `
    &:hover {
      border-color: rgba(${p.rgb || p.theme.colors.mainRGB}, 1);
      &:before {
        background: rgba(${p.rgb || p.theme.colors.mainRGB}, 0.5);
      }
    }
  `}
`;

const MainContent = styled.div`
  align-items: center;
  display: flex;
  flex: 1;
  justify-content: center;
  overflow: auto;
  width: 100%;
`;

const Footer = styled.div`
  align-items: center;
  color: #777;
  display: flex;
  flex-direction: row;
  flex: 0 0 ${footerHeight}px;
  justify-content: center;
  text-align: center;
  width: 100%;

  & > div {
    flex: 1;
    align-content: center;

    & > a, & > span {
      border-left: 1px solid #777;
      color: inherit;
      display: inline-block;
      line-height: 1.5em;
      padding: 0 20px;
      text-decoration: none;
      transition: color 250ms ease;

      &:first-child {
        border-left: 0;
      }

      &:hover {
        color: #CCC;
      }
    }
  }
`;

const ExitSimulationLink = styled.div`
  color: #AAA;
  cursor: ${p => p.theme.cursors.active};
  margin-top: -7px;
  transition: color 100ms ease;
  &:hover {
    color: ${p => p.theme.colors.error};
  }
`;

const NavItemLabel = styled.div`
  color: ${p => p.theme.colors.error};
  font-size: 16px;
  position: absolute;
  right: 0;
`;
const NavItemBadge = styled(Badge)`
  font-size: 16px;
  position: absolute;
  right: 0;
`;

const Launcher = (props) => {
  const { accountAddress, authenticating, authenticated, login, loginPrompt, walletId } = useSession(false);
  const { data: priceConstants, isLoading: priceConstantsLoading } = usePriceConstants();
  const { hasNoPublicKey, unreadTally } = useWalletInbox();

  const launcherPage = useStore(s => s.launcherPage);
  const simulationEnabled = useStore(s => s.simulationEnabled);
  const wasNew = useStore(s => s.isNew);
  const interfaceHidden = useStore(s => s.graphics.hideInterface);
  const hasSeenIntroVideo = useStore(s => s.hasSeenIntroVideo);
  const dispatchCutscene = useStore(s => s.dispatchCutscene);
  const dispatchSimulationEnabled = useStore(s => s.dispatchSimulationEnabled);
  const dispatchSimulationStep = useStore(s => s.dispatchSimulationStep);
  const dispatchLauncherPage = useStore(s => s.dispatchLauncherPage);
  const dispatchSeenIntroVideo = useStore(s => s.dispatchSeenIntroVideo);
  const dispatchToggleInterface = useStore(s => s.dispatchToggleInterface);
  const dispatchIsNotNew = useStore(s => s.dispatchIsNotNew);

  const [isNew, setIsNew] = useState();

  useEffect(() => {
    if (!interfaceHidden) {
      dispatchToggleInterface(true);
    }
    return () => {
      if (interfaceHidden) {
        dispatchToggleInterface(false);
      }
    }
  }, [interfaceHidden]);

  useEffect(() => {
    if (wasNew) {
      setIsNew(true);
      dispatchIsNotNew();
    }
  }, [wasNew]);

  useEffect(() => {
    if (authenticated) {
      setIsNew(false);
    }
  }, [authenticated])

  useEffect(() => {
    // NOTE: (currently not disallowing any for logged out users)
    // limit selection if logged out
    // if (!authenticated && !['play', 'help', 'rewards', 'settings', 'store', 'inbox'].includes(launcherPage)) {
    //   dispatchLauncherPage('play');
    // }
    // disallow store if no sale available
    if (!priceConstantsLoading && !priceConstants?.ADALIAN_PURCHASE_PRICE && launcherPage === 'store') {
      dispatchLauncherPage('play');
    }
  }, [launcherPage, authenticated, priceConstants, priceConstantsLoading]);

  const onInstallApp = useCallback(async () => {
    window.installPrompt.prompt();
    const { outcome } = await window.installPrompt.userChoice;
    if (outcome === 'accepted') {
      window.installPrompt = null;
    }
  }, []);

  const onClickPlay = useCallback(() => {
    fireTrackingEvent('play', { externalId: accountAddress });
    dispatchLauncherPage();
    if (!hasSeenIntroVideo && !DISABLE_LAUNCH_TRAILER) {
      dispatchSeenIntroVideo(true);
      dispatchCutscene(getLicensedAssetUrl('videos/intro.m3u8'), true);
    }
  }, [accountAddress, , hasSeenIntroVideo]);

  const onEnterSimulation = useCallback(() => {
    if (loginPrompt?.busy) return;
    if (!authenticated && !simulationEnabled) { // is authenticated check necessary?
      dispatchSimulationEnabled(true);
    }
    onClickPlay();
  }, [authenticated, loginPrompt?.busy, onClickPlay, simulationEnabled]);

  const onExitSimulation = useCallback(() => {
    dispatchSimulationEnabled(false);
    dispatchSimulationStep();  // TODO: remove this? (i.e. to not reset on exit)
  }, []);

  const onClickLogin = useCallback(() => {
    if (loginPrompt?.busy) return;
    if (loginPrompt?.open) {
      loginPrompt.close();
    } else {
      login();
    }
  }, [login, loginPrompt]);

  const openHelpChannel = useCallback(() => {
    window.open(appConfig.get('Url.help'), '_blank', 'noopener');
  }, []);

  const openAssetsPortal = useCallback(() => {
    window.open(appConfig.get('Url.bridge'), '_blank', 'noopener');
  }, []);

  const openWebWalletDashboard = useCallback(() => {
    window.open(`${appConfig.get('Api.argentWebWallet')}`, '_blank', 'noopener');
  }, []);

  return (
    <StyledLauncher {...props}>
      {launcherPage === 'play' && <HudMenu />}

      <TopLeftMenu>
        <LogoWrapper><InfluenceLogo /></LogoWrapper>
        {!isNew && (
          <Nav>
            <NavItem
              onClick={() => dispatchLauncherPage('play')}
              selected={launcherPage === 'play'}>
              <PlayIcon /> Play
            </NavItem>
            <NavItem
              onClick={() => dispatchLauncherPage('store')}
              selected={launcherPage === 'store'}>
              <StoreIcon /> Store
            </NavItem>
            <NavItem
              onClick={() => dispatchLauncherPage('help')}
              selected={launcherPage === 'help'}>
              <HelpIcon /> Help
            </NavItem>
            <NavItem
              onClick={() => dispatchLauncherPage('rewards')}
              selected={launcherPage === 'rewards'}>
              <RewardsIcon /> Rewards
            </NavItem>
            <NavItem
              onClick={() => dispatchLauncherPage('settings')}
              selected={launcherPage === 'settings'}>
              <SettingsIcon /> Settings
            </NavItem>
            {accountAddress && (
              <NavItem
                onClick={() => dispatchLauncherPage('inbox')}
                selected={launcherPage === 'inbox'}>
                <InboxIcon /> Inbox
                {hasNoPublicKey && <NavItemLabel><WarningIcon /></NavItemLabel>}
                {!hasNoPublicKey && unreadTally > 0 && <NavItemBadge value={unreadTally} />}
              </NavItem>
            )}

            <NavItem isRule />

            {appConfig.get('Url.bridge') && (
              <NavItem onClick={openAssetsPortal} isExternal>
                <AssetPortalIcon /> Assets Portal
              </NavItem>
            )}

            {walletId === 'argentWebWallet' && (
              <NavItem onClick={openWebWalletDashboard} isExternal>
                <WalletIcon /> Wallet Dashboard
              </NavItem>
            )}

            {appConfig.get('Url.bugReport') && (
              <NavItem onClick={openHelpChannel} isExternal>
                <BugIcon /> Bug Report
              </NavItem>
            )}

            {!!window.installPrompt && (
              <NavItem onClick={onInstallApp} isExternal>
                <DownloadIcon /> Desktop App
              </NavItem>
            )}

          </Nav>
        )}
      </TopLeftMenu>

      {!isNew && <SystemControls />}

      <ContentWrapper id="contentwrapper">
        <Tooltip id="launcherTooltip" place="left" delayHide={150} />

        <MainContent>
          {launcherPage === 'play' && <Play />}
          {launcherPage === 'store' && <Store />}
          {launcherPage === 'help' && <Help />}
          {launcherPage === 'rewards' && <Rewards />}
          {launcherPage === 'settings' && <Settings />}
          {launcherPage === 'inbox' && <Inbox />}
        </MainContent>

        {launcherPage === 'play' && (
          <>
            {!authenticated && (
              <AccountLoginCluster expanded={loginPrompt?.open} isNew={isNew}>
                <AccountButton
                  busy={loginPrompt?.busy}
                  expanded={loginPrompt?.open}
                  isNew={isNew}
                  onClick={onClickLogin}>
                  <LeftIcon connecting={loginPrompt?.busy} connected={authenticated}>
                    {loginPrompt?.busy ? <Loader color="currentColor" size="0.9em" /> : <UserIcon />}
                  </LeftIcon>
                  <label>{loginPrompt?.busy ? 'Logging In' : (isNew ? 'Existing Account' : 'Log-In')}</label>
                  <RightIcon expanded={loginPrompt?.open}><ChevronDoubleRightIcon /></RightIcon>
                </AccountButton>
                <LoginPrompt
                  busy={loginPrompt?.busy}
                  expanded={loginPrompt?.open}
                  onClick={loginPrompt?.onSelect}
                  onClose={loginPrompt?.close}
                  options={loginPrompt?.options} />
              </AccountLoginCluster>
            )}

            {authenticated
              ? (
                <PlayButton
                  animate
                  disabled={authenticating}
                  onClick={onClickPlay}>
                  Play
                </PlayButton>
              )
              : (
                <>
                  <PlayButton
                  animate
                  disabled={authenticating || loginPrompt?.busy}
                  isNew={isNew}
                  onClick={onEnterSimulation}
                  rgb={theme.colors.successRGB}>
                    {simulationEnabled ? 'Continue' : 'Enter Training'}
                  </PlayButton>
                  {simulationEnabled && (
                    <ExitSimulationLink onClick={onExitSimulation}>Exit Training</ExitSimulationLink>
                  )}
                </>
              )
            }
          </>
        )}

        <Footer>
          <div>
            <a href={appConfig.get('Url.home')} target="_blank" rel="noopener noreferrer">About</a>
            <a href={appConfig.get('Url.discord')} target="_blank" rel="noopener noreferrer">Discord</a>
            <a href={appConfig.get('Url.wiki')} target="_blank" rel="noopener noreferrer">Wiki</a>
          </div>
        </Footer>
      </ContentWrapper>
    </StyledLauncher>
  );
};

export default Launcher;
