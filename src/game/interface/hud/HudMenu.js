import { useCallback, useEffect, useMemo, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { Tooltip } from 'react-tooltip';
import styled from 'styled-components';
import { Building, Inventory, Lot } from '@influenceth/sdk';
import { BiWrench as WrenchIcon } from 'react-icons/bi';

import { appConfig } from '~/appConfig';
import IconButton from '~/components/IconButton';
import {
  AsteroidSearchIcon,
  ChatIcon,
  CloseIcon,
  CompositionIcon,
  DetailIcon,
  DockedShipsIcon,
  FavoriteIcon,
  InfoIcon,
  InventoryIcon,
  KeysIcon,
  SearchIcon,
  ListViewIcon,
  LotSearchIcon,
  MarketsIcon,
  MarketplaceBuildingIcon,
  MyAssetsIcon,
  OrbitingShipsIcon,
  PassengersIcon,
  ResourceIcon,
  SimulateRouteIcon,
  CrewIcon
} from '~/components/Icons';
import useAsteroid from '~/hooks/useAsteroid';
import useAsteroidBuildings from '~/hooks/useAsteroidBuildings';
import useCrewContext from '~/hooks/useCrewContext';
import useLot from '~/hooks/useLot';
import useSession from '~/hooks/useSession';
import useShip from '~/hooks/useShip';
import useStore from '~/hooks/useStore';
import hudMenus from './hudMenus';
import { COACHMARK_IDS } from '~/contexts/CoachmarkContext';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';
import useCoachmarkRefSetter from '~/hooks/useCoachmarkRefSetter';

const cornerWidth = 8;
const bumpHeightHalf = 100;
const buttonsWidth = 66;
const panelAnimationLength = 250;
const panelWidth = 475;

const Wrapper = styled.div`
  align-items: flex-end;
  display: flex;
  flex-direction: column;
  justify-content: center;
  pointer-events: none;
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 2;
`;

const Buttons = styled.div`
  background: ${p => p.theme.colors.hudMenuBackground};
  border-left: 1px solid #444;
  clip-path: polygon(
    0 ${cornerWidth}px,
    ${cornerWidth}px 0,
    100% 0,
    100% 100%,
    ${cornerWidth}px 100%,
    0 calc(100% - ${cornerWidth}px)
  );
  padding: 12px 0;
  pointer-events: all;
  position: absolute;
  z-index: 1;

  ${p => p.open && `
    border-color: transparent;
    background: transparent;
  `}
`;

const ButtonSection = styled.div`
  align-items: flex-end;
  display: flex;
  flex-direction: column;
  ${p => p.showSeparator && `
    &:before {
      align-self: center;
      content: '';
      display: block;
      border-top: 1px solid #444;
      margin: 7px 0 8px;
      width: 45px;
    }
  `}
`;

const Button = styled.div`
  align-items: center;
  border-radius: 8px 0 0 8px;
  border-right: 3px solid transparent;
  color: rgba(255, 255, 255, 0.5);
  display: flex;
  font-size: 28px;
  height: 44px;
  justify-content: center;
  margin: 3px 0;
  padding: 6px 16px;
  position: relative;
  transition: background 250ms ease, border-color 250ms ease, color 250ms ease, opacity 250ms ease;
  width: ${buttonsWidth}px;

  ${p => p.iconColor
    ? `
      color: ${p.theme.colors.main};
      &:hover {
        color: white;
      }
    `
    : ``
  }

  ${p => p.selected
    ? `
      border-color: ${p.theme.colors.main};
      background: rgba(${p.theme.colors.mainRGB}, 0.3);
      color: white;
      &:hover {
        border-color: rgba(${p.theme.colors.mainRGB}, 0.5);
      }
    `
    : `
      cursor: ${p.theme.cursors.active};
      &:hover {
        border-color: #777;
        color: white;
      }
    `
  }

  ${p => p.badge > 0 && `
    &:before {
      align-items: center;
      background: ${p.theme.colors.badge};
      border-radius: 20px;
      color: white;
      content: "${p.badge > 9 ? '9⁺' : p.badge}";
      display: flex;
      font-size: 13px;
      font-weight: bold;
      height: 19px;
      line-height: 0;
      justify-content: center;
      position: absolute;
      left: 5px;
      top: 2px;
      width: 19px;
    }
  `}
`;

const initialBorder = 3;
const hoverBorder = 6;
const PageButton = styled(Button)`
  position: relative;
  &:after {
    border: solid transparent;
    border-width: ${initialBorder}px ${initialBorder}px ${initialBorder}px 0;
    border-right-color: #555;
    content: '';
    position: absolute;
    right: -3px;
    top: 4px;
    bottom: 4px;

    transition: border-color 250ms ease, border-width 250ms ease;
  }

  &:hover {
    border-color: transparent;
    &:after {
      border-right-color: ${p => p.theme.colors.main};
      border-width: ${hoverBorder}px ${hoverBorder}px ${hoverBorder}px 0;
    }
  }
`;

const Panel = styled.div`
  background: ${p => p.theme.colors.hudMenuBackground};
  border-left: 1px solid #444;
  clip-path: polygon(
    100% 0,
    100% 100%,
    ${cornerWidth}px 100%,
    ${cornerWidth}px calc(50% + ${bumpHeightHalf}px),
    0 calc(50% + ${bumpHeightHalf - cornerWidth}px),
    0 calc(50% - ${bumpHeightHalf - cornerWidth}px),
    ${cornerWidth}px calc(50% - ${bumpHeightHalf}px),
    ${cornerWidth}px 0
  );
  height: 75%;
  max-height: calc(100vh - 150px);
  padding-left: ${cornerWidth}px;
  padding-right: ${p => p.forcedOpen ? 0 : buttonsWidth}px;
  pointer-events: all;
  width: ${panelWidth}px;

  transform: translateX(${p => p.open ? 0 : panelWidth}px);
  transition: transform ${panelAnimationLength}ms ease;
`;

const PanelInner = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px 16px 0 12px;
`;

const PanelTitle = styled.div`
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  flex-direction: row;
  font-size: 22px;
  height: 43px;
  padding-bottom: 12px;
  text-transform: uppercase;
  & button:last-child {
    margin-right: 0;
  }
`;

const PanelContent = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 0;
`;

const MenuButton = ({ badge, coachmarkId, menuKey, label, useAltColor, icon, onOpen, hideInsteadOfClose, handleButtonClick, openHudMenu }) => {
  const setCoachmarkRef = useCoachmarkRefSetter();
  return (
    <Button
      ref={coachmarkId ? setCoachmarkRef(coachmarkId) : undefined}
      iconColor={useAltColor}
      badge={badge}
      onClick={() => handleButtonClick(menuKey, onOpen, hideInsteadOfClose)}
      selected={menuKey === openHudMenu}
      data-tooltip-id="hudMenuTooltip"
      data-tooltip-place="left"
      data-tooltip-content={label}>
      {icon}
    </Button>
  );
};

const HudMenu = () => {
  const history = useHistory();
  const { authenticated } = useSession();
  const { accountCrewIds, crew } = useCrewContext();
  const simulationEnabled = useSimulationEnabled();
  const setCoachmarkRef = useCoachmarkRefSetter();

  // const createAlert = useStore(s => s.dispatchAlertLogged);
  const asteroidId = useStore(s => s.asteroids.origin);
  const destination = useStore(s => s.asteroids.destination);
  const lotId = useStore(s => s.asteroids.lot);
  const resourceMap = useStore(s => s.asteroids.resourceMap);
  const zoomScene = useStore(s => s.asteroids.zoomScene);
  const zoomStatus = useStore(s => s.asteroids.zoomStatus);
  const showDevTools = useStore(s => s.graphics.showDevTools);
  const lotFilters = useStore(s => s.assetSearch.lotsMapped?.filters);
  const asteroidFilters = useStore(s => s.assetSearch.asteroidsMapped?.filters);
  const launcherPage = useStore(s => s.launcherPage);
  const isAssetSearchFilterMatchingDefault = useStore(s => s.isAssetSearchFilterMatchingDefault);

  const openHudMenu = useStore(s => s.openHudMenu);

  const { data: asteroid } = useAsteroid(asteroidId);
  const { data: lot } = useLot(lotId);
  const { data: zoomShip } = useShip(zoomScene?.type === 'SHIP' && zoomScene.shipId);
  const ship = useMemo(() => zoomScene?.type === 'SHIP' ? zoomShip : lot?.surfaceShip, [lot, zoomShip, zoomScene]);
  const { data: marketplaces } = useAsteroidBuildings(asteroidId, 'Exchange');

  const chatHistory = useStore(s => s.chatHistory);
  const dispatchHudMenuOpened = useStore(s => s.dispatchHudMenuOpened);

  const [open, setOpen] = useState();
  const [hidden, setHidden] = useState();

  const handleButtonClick = useCallback((selected, onOpen, hideInsteadOfClose) => {

    // clicking button of already-open --> close
    if (openHudMenu === selected) {
      if (hideInsteadOfClose) {
        setHidden((h) => !h);
        return;
      }
      else dispatchHudMenuOpened();

    // else, already open, but clicking different button --> close, then open new
    } else if (open) {
      setOpen(false);
      dispatchHudMenuOpened();
      setTimeout(() => {
        if (onOpen) onOpen();
        else dispatchHudMenuOpened(selected);
      }, panelAnimationLength);

    // else, nothing open --> open new
    } else {
      if (onOpen) onOpen();
      else dispatchHudMenuOpened(selected);
    }

    setHidden(false);
  }, [open, openHudMenu]);

  useEffect(() => {
    // TODO: refactor this now that organization changed...
    if (openHudMenu) {
      const category = openHudMenu.split('_').shift();
      if (category === 'BELT' && zoomStatus !== 'out') dispatchHudMenuOpened();
      if (category === 'ASTEROID' && !(zoomStatus === 'in' && !zoomScene)) dispatchHudMenuOpened();
      if (category === 'LOT' && !(zoomStatus === 'in' && lotId)) dispatchHudMenuOpened();
      if (category === 'SHIP' && !(zoomStatus === 'in' && zoomScene?.type === 'SHIP')) dispatchHudMenuOpened();
    }
  }, [dispatchHudMenuOpened, zoomScene, zoomStatus]);

  useEffect(() => {
    // if just zoomed in and resourcemap is active, then open asteroid resources
    if (zoomStatus === 'in' && !zoomScene && resourceMap.active) {
      dispatchHudMenuOpened('RESOURCES');
    }
  }, [zoomStatus, zoomScene])

  useEffect(() => {
    setOpen(!!openHudMenu);
  }, [openHudMenu]);

  const asteroidFilterTally = useMemo(() => {
    return Object.keys(asteroidFilters || {})
      .reduce((acc, fieldName) => acc + (isAssetSearchFilterMatchingDefault('asteroidsMapped', fieldName) ? 0 : 1), 0)
  }, [asteroidFilters]);

  const lotFilterTally = useMemo(() => {
    return Object.keys(lotFilters || {})
      .reduce((acc, fieldName) => acc + (isAssetSearchFilterMatchingDefault('lotsMapped', fieldName) ? 0 : 1), 0)
  }, [lotFilters]);

  const unreadChatTally = useMemo(() => {
    return chatHistory.filter((c) => c.asteroidId === asteroidId && c.unread)?.length;
  }, [asteroidId, chatHistory]);

  const [menuButtons, pageButtons] = useMemo(() => {
    const menuButtons = [];
    const pageButtons = [];

    if (!launcherPage) {
      let scope = 'belt'; // belt, asteroid, lot, ship
      if (zoomStatus === 'in') scope = 'asteroid';
      if (lotId) scope = 'lot';
      if (zoomScene?.type === 'SHIP') scope = 'ship'; // TODO: probably only if ship is in flight should we change scope

      let focus = ''; // asteroid, lot, ship
      if (asteroidId) focus = 'asteroid';
      if (lotId) focus = 'lot';
      if (zoomScene?.type === 'SHIP') focus = 'ship';

      menuButtons.push(
        {
          key: 'SHIP_INFORMATION',
          label: 'Ship Info',
          icon: <InfoIcon />,
          Component: hudMenus.ShipInfo,
          isVisible: focus === 'ship'
        },
        {
          key: 'LOT_INFORMATION',
          label: 'Lot Info',
          icon: <InfoIcon />,
          Component: hudMenus.LotInfo,
          isVisible: focus === 'lot'
        },
        {
          key: 'ASTEROID_INFO',
          label: 'Asteroid Info',
          icon: <InfoIcon />,
          Component: hudMenus.AsteroidInfo,
          detailType: 'detail',
          onDetailClick: () => {
            if (asteroidId) {
              history.push(`/asteroids/${asteroidId}`);
            }
          },
          isVisible: focus === 'asteroid'
        },
        {
          key: 'BUILDING_ADMIN',
          label: 'Building Management',
          icon: <KeysIcon />,
          noDetail: true,
          Component: hudMenus.AdminBuilding,
          isVisible: focus === 'lot'
            && lot?.building?.Building?.status === Building.CONSTRUCTION_STATUSES.OPERATIONAL
            && accountCrewIds?.includes(lot?.building?.Control?.controller?.id)
        },
        {
          key: 'ASTEROID_ADMIN',
          label: 'Asteroid Management',
          icon: <KeysIcon />,
          noDetail: true,
          Component: hudMenus.AdminAsteroid,
          isVisible: focus === 'asteroid'
            && accountCrewIds?.includes(asteroid?.Control?.controller?.id)
        },
        {
          key: 'SHIP_ADMIN',
          label: 'Ship Management',
          icon: <KeysIcon />,
          noDetail: true,
          Component: hudMenus.AdminShip,
          isVisible: (focus === 'ship' || (focus === 'lot' && lot?.surfaceShip))
            && accountCrewIds?.includes(ship?.Control?.controller?.id)
        },
        {
          key: 'DOCKED_SHIPS',
          label: 'Docked Ships',
          icon: <DockedShipsIcon />,
          Component: hudMenus.DockDetails,
          noDetail: true,
          isVisible: focus === 'lot'
            && lot?.building?.Building?.status === Building.CONSTRUCTION_STATUSES.OPERATIONAL
            && lot.building.Dock
        },
        {
          key: 'ORBITING_SHIPS',
          label: 'Orbiting Ships',
          icon: <OrbitingShipsIcon />,
          Component: hudMenus.OrbitDetails,
          noDetail: true,
          isVisible: focus === 'asteroid' && scope === 'asteroid'
        },
        {
          key: 'STATIONED_CREW',
          label: 'Station Manifest',
          icon: <PassengersIcon />,
          Component: hudMenus.StationManifest,
          isVisible: focus === 'lot' && lot?.building?.Station
        },
        {
          key: 'SHIP_INVENTORY',
          label: 'Ship Inventory',
          icon: <InventoryIcon />,
          Component: hudMenus.Inventory,
          isVisible: ((focus === 'ship' || (focus === 'lot' && lot?.surfaceShip))
            && (ship?.Inventories || []).find((i) => i.status === Inventory.STATUSES.AVAILABLE))
        },
        {
          key: 'SHIP_PASSENGERS',
          label: 'Passenger Manifest',
          icon: <PassengersIcon />,
          Component: hudMenus.StationManifest,
          isVisible: focus === 'ship' || (focus === 'lot' && lot?.surfaceShip)
        },
        {
          key: 'RESOURCES',
          label: 'Resources',
          icon: <ResourceIcon />,
          coachmarkId: COACHMARK_IDS.hudMenuResources,
          Component: hudMenus.Resources,
          noDetail: true,
          isVisible: scope === 'asteroid' || scope === 'lot'
        },
        {
          key: 'LOT_INVENTORY',
          label: 'Lot Inventory',
          icon: <InventoryIcon />,
          Component: hudMenus.Inventory,
          isVisible: focus === 'lot'
            && (lot?.building?.Inventories || []).find((i) => i.status === Inventory.STATUSES.AVAILABLE)
        },
        {
          key: 'ASTEROID_MAP_SEARCH',
          label: 'Filter Lots',
          icon: <LotSearchIcon />,
          badge: lotFilterTally,
          Component: hudMenus.SearchMap,
          noDetail: true,
          componentProps: { assetType: 'lotsMapped' },
          detailType: 'list',
          onDetailClick: () => {
            history.push(`/listview/lots`);
          },
          isVisible: scope === 'asteroid'
        },
        {
          key: 'ASTEROID_CHAT',
          label: 'Asteroid Chat',
          icon: <ChatIcon />,
          badge: unreadChatTally,
          Component: hudMenus.AsteroidChat,
          noDetail: true,
          isVisible: scope === 'asteroid' || scope === 'lot'
        },

        {
          key: 'BELT_MAP_SEARCH',
          label: 'Filter Asteroids',
          icon: <AsteroidSearchIcon />,
          badge: asteroidFilterTally,
          Component: hudMenus.SearchMap,
          componentProps: { assetType: 'asteroidsMapped' },
          detailType: 'list',
          onDetailClick: () => {
            history.push(`/listview/asteroids`);
          },
          isVisible: scope === 'belt'
        },
        {
          key: 'BELT_FAVORITES',
          label: 'Favorites',
          icon: <FavoriteIcon />,
          Component: hudMenus.Favorites,
          noDetail: true,
          requireLogin: true,
          isVisible: scope === 'belt'
        },
        {
          key: 'BELT_PLAN_FLIGHT',
          label: 'Plan Flight',
          icon: <SimulateRouteIcon />,
          Component: hudMenus.RoutePlanner,
          noDetail: true,
          isVisible: scope === 'belt' && destination
        },
      );

      pageButtons.push(
        {
          key: 'MARKETPLACE_LISTINGS',
          label: 'Marketplace Products',
          icon: <MarketplaceBuildingIcon />,
          onOpen: () => {
            history.push(`/marketplace/${asteroidId}/${Lot.toIndex(lotId)}`);
          },
          isVisible: focus === 'lot'
            && lot?.building?.Building?.status === Building.CONSTRUCTION_STATUSES.OPERATIONAL
            && lot.building.Building.buildingType === Building.IDS.MARKETPLACE
        },
        {
          key: 'ASTEROID_DETAILS',
          label: 'Asteroid Details',
          icon: <CompositionIcon />,
          onOpen: () => {
            history.push(`/asteroids/${asteroidId}`);
          },
          isVisible: focus === 'asteroid' || scope === 'asteroid'
        },
        {
          key: 'ASTEROID_MARKETS',
          label: 'Asteroid Markets',
          coachmarkId: COACHMARK_IDS.hudMenuMarketplaces,
          icon: <MarketsIcon />,
          onOpen: () => {
            // if (hasSomeMarketplacePermission) {
              history.push(`/marketplace/${asteroidId}/all`);
            // } else {
            //   createAlert({
            //     type: 'GenericAlert',
            //     level: 'warning',
            //     data: { content: 'Asteroid does not yet have any marketplaces accessible to your crew.' },
            //     duration: 3000
            //   });
            // }
          },
          isVisible: marketplaces?.length > 0
        },
        {
          key: 'ASTEROID_ADVANCED_SEARCH',
          label: 'Advanced Search',
          icon: <SearchIcon />,
          onOpen: () => {
            history.push(`/listview/buildings`);
          },
          isVisible: scope !== 'belt' && !!asteroidId
        },

        {
          key: 'BELT_ADVANCED_SEARCH',
          label: 'Advanced Search',
          icon: <SearchIcon />,
          onOpen: () => {
            history.push(`/listview/asteroids`);
          },
          isVisible: scope === 'belt' || !asteroidId
        }
      );

      if (appConfig.get('App.enableDevTools') && showDevTools) {
        menuButtons.push({
          key: 'DEV_TOOLS',
          label: 'Dev Tools',
          icon: <WrenchIcon />,
          noDetail: true,
          Component: hudMenus.DevTools,
          hideInsteadOfClose: true,
          isVisible: true
        });
      }
    }

    if (!simulationEnabled || !launcherPage) {
      menuButtons.push(
        {
          key: 'MY_CREWS',
          label: 'My Crews',
          icon: <CrewIcon />,
          Component: hudMenus.MyCrews,
          useAltColor: true,
          noDetail: true,
          isUniversal: true,
          isVisible: true,
          requireLogin: true,
        },
        {
          key: 'MY_ASSETS',
          label: 'My Assets',
          icon: <MyAssetsIcon />,
          Component: hudMenus.MyAssets,
          coachmarkId: COACHMARK_IDS.hudMenuMyAssets,
          useAltColor: true,
          noDetail: true,
          isUniversal: true,
          isVisible: true,
          requireLogin: true,
        }
      );
    }

    return [menuButtons, pageButtons];
  }, [
    accountCrewIds,
    asteroid,
    asteroidFilterTally,
    asteroidId,
    crew?.id,
    destination,
    launcherPage,
    lot,
    lotFilterTally,
    lotId,
    showDevTools,
    unreadChatTally,
    zoomStatus,
    zoomScene
  ]);

  const { label, onDetailClick, detailType, Component, componentProps, hideInsteadOfClose, noClose, noDetail } = useMemo(() => {
    return menuButtons.find((b) => b.key === openHudMenu) || {};
  }, [menuButtons, openHudMenu]);

  const [visibleMenuButtons, visibleUniversalButtons, visiblePageButtons] = useMemo(() => ([
    menuButtons.filter((b) => b.isVisible && !b.isUniversal && (!b.requireLogin || authenticated)),
    menuButtons.filter((b) => b.isVisible && b.isUniversal && (!b.requireLogin || authenticated)),
    pageButtons.filter((b) => b.isVisible && (!b.requireLogin || authenticated)),
  ]), [authenticated, menuButtons, pageButtons]);

  // if open hud menu is no longer visible (or if get logged out and "requireLogin" menu), close
  useEffect(() => {
    if (openHudMenu) {
      const openMenuConfig = menuButtons.find((b) => b.key === openHudMenu);
      if (!openMenuConfig?.isVisible || (openMenuConfig?.requireLogin && !authenticated)) {
        handleButtonClick(openHudMenu, null, openMenuConfig?.hideInsteadOfClose);
      }
    }
  }, [authenticated, handleButtonClick, openHudMenu, visibleMenuButtons]);

  return (
    <Wrapper>
      <Tooltip id="hudMenuTooltip" />

      {/* NOTE: the hudMenu id is in use by third-party extensions */}
      <Buttons id="hudMenu" open={open}>
        {visibleMenuButtons.length > 0 && (
          <ButtonSection>
            {visibleMenuButtons.map(({ key, ...buttonConfig }) => (
              <MenuButton
                key={key}
                menuKey={key}
                handleButtonClick={handleButtonClick}
                openHudMenu={openHudMenu}
                {...buttonConfig} />
            ))}
          </ButtonSection>
        )}
        {visibleUniversalButtons.length > 0 && (
          <ButtonSection showSeparator={visibleMenuButtons.length > 0}>
            {visibleUniversalButtons.map(({ key, ...buttonConfig }) => (
              <MenuButton
                key={key}
                menuKey={key}
                handleButtonClick={handleButtonClick}
                openHudMenu={openHudMenu}
                {...buttonConfig} />
            ))}
          </ButtonSection>
        )}
        {visiblePageButtons.length > 0 && (
          <ButtonSection showSeparator={(visibleMenuButtons.length || visibleUniversalButtons.length) > 0}>
            {visiblePageButtons.map(({ key, coachmarkId, label, useAltColor, icon, onOpen, hideInsteadOfClose }) => (
              <PageButton
                key={key}
                ref={coachmarkId ? setCoachmarkRef(coachmarkId) : undefined}
                iconColor={useAltColor}
                onClick={() => handleButtonClick(key, onOpen, hideInsteadOfClose)}
                selected={key === openHudMenu}
                data-tooltip-id="hudMenuTooltip"
                data-tooltip-place="left"
                data-tooltip-content={label}>
                {icon}
              </PageButton>
            ))}
          </ButtonSection>
        )}
      </Buttons>

      {/* NOTE: the hudMenu id is in use by third-party extensions */}
      <Panel id="hudMenuPanel" open={open && !hidden}>
        <PanelInner>
          <PanelTitle>
            <span style={{ flex: 1 }}>{label}</span>
            {!noDetail && (
              <IconButton
                data-tooltip-id="globalTooltip"
                data-tooltip-content={detailType === 'detail' ? 'Detail View' : 'Advanced Search'}
                data-tooltip-place="left"
                onClick={onDetailClick}>
                {detailType === 'detail' ? <DetailIcon /> : <ListViewIcon />}
              </IconButton>
            )}
            {!noClose && (
              <IconButton onClick={() => handleButtonClick(openHudMenu, null, hideInsteadOfClose)}>
                <CloseIcon />
              </IconButton>
            )}
          </PanelTitle>
          <PanelContent>
            {Component && (
              <Component
                {...(componentProps || {})}
                onClose={() => handleButtonClick(openHudMenu, null, hideInsteadOfClose)} />
            )}
          </PanelContent>
        </PanelInner>
      </Panel>
    </Wrapper>
  );
};

export default HudMenu;
