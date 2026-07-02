import { useMemo } from 'react';
import { Ship } from '@influenceth/sdk';
import cloneDeep from 'lodash/cloneDeep';

import useAsteroid from '~/hooks/useAsteroid';
import useBlockTime from '~/hooks/useBlockTime';
import useConstructionManager from '~/hooks/actionManagers/useConstructionManager';
import useCrewContext from '~/hooks/useCrewContext';
import useLot from '~/hooks/useLot';
import useSession from '~/hooks/useSession';
import useShip from '~/hooks/useShip';
import useSimulationState from '~/hooks/useSimulationState';
import useStore from '~/hooks/useStore';
import { locationsArrToObj } from '~/lib/utils';
import actionButtons from '../game/interface/hud/actionButtons';


// if selected asteroid (any zoom)
//  - purchase asteroid
//  - scan asteroid
//  - if BELT VIEW
//    - select travel destination
//    - if BELT_FLIGHT_PLAN open
//      - set course  ** TODO: this should be a button on the tray so we know if ship is valid, etc

// if !selected DIFFERENT ship
//  - if i own selected ship OR if i am piloting any ship at lot, offer "launch"
//  - if i am piloting any ship in orbit, offer "land"

// if selected ship (and not IN_FLIGHT)
//  - if my crew can pilot, offer "station crew as pilots" button
//  - if my crew can ride, offer "station crew as passengers" button
//  - if i can eject my crew, offer "eject crew" button
//  - if i can eject guests from ship, offer "eject guest crew" button
//  - if i can toggle emergency mode, offer "toggle emergency mode" button
//  - if i can generate emergency propellant, offer "generate emergency mode" button

// if selected lot (asteroid zoom or closer)
//  - offer core sample button
//  - if OPERATIONAL building,
//    - StationCrew, Extract, Refine's
//    - if i own the building...
//      - eject stationed crew
//  - if PLANNED building
//    - offer "construct" button
//  - if READY_TO_PLAN building, offer "plan" button
//  - if there is a squatter, offer eject crew button
//  - if my crew is on this lot, offer "eject my crew" button
//  - if there is a delivery to/from this lot, offer "transfer to lot" button

// if selected building or selected ship
//  - if can station, offer "station crew"
//  - if has unlocked inventory, offer "surface transfer"
//  - if has incoming delivery, offer "surface transfer"

const buttonOrder = [
  // admin + purchases
  'ControlAsteroid',
  'PurchaseAsteroid',
  'ControlShip',
  'PurchaseEntity',
  'ScanAsteroid',
  'FormLotLeaseAgreement',
  'ManageLotLeaseAuction',

  // launch/land
  'LandShip',
  'LaunchShip',

  // construction
  'PlanBuilding',
  'Construct',

  // operation
  'AssembleShip',
  'Extract',
  'Processors',
  'StationCrew',
  'RecruitCrewmate',

  // transfers
  'SurfaceTransferOutgoing',
  'SurfaceTransferIncoming',

  // core sample
  'CoreSample',

  // emode
  'EmergencyModeToggle',
  'EmergencyModeCollect',

  // ejections
  'EjectCrew',
  'EjectGuestCrew',

  // travel
  'SelectTravelDestination',
  'SetCourse',

  // deconstruct
  'Deconstruct',
  'UnplanBuilding',

  // rewards
  'ClaimArrivalReward',
  'ClaimPrepareReward'

].reduce((acc, k, i) => ({ ...acc, [k]: i + 1 }), {});

const useActionButtons = () => {
  const blockTime = useBlockTime();
  const asteroidId = useStore(s => s.asteroids.origin);
  const lotId = useStore(s => s.asteroids.lot);
  const resourceMap = useStore(s => s.asteroids.resourceMap);
  const zoomStatus = useStore(s => s.asteroids.zoomStatus);
  const zoomScene = useStore(s => s.asteroids.zoomScene);
  const openHudMenu = useStore(s => s.openHudMenu);
  const setAction = useStore(s => s.dispatchActionDialog);
  const simulationActions = useStore(s => s.simulationActions);
  const simulation = useSimulationState();

  // account
  const { accountAddress } = useSession();

  // crew
  const { accountCrewIds, crew } = useCrewContext();

  // asteroid-level
  const { data: asteroid, isLoading: asteroidIsLoading } = useAsteroid(asteroidId);

  // lot-level
  const { data: lot, isLoading: lotIsLoading } = useLot(lotId);
  const { constructionStatus, isAtRisk } = useConstructionManager(lotId); // TODO: could potentially pass in building id here if helpful

  // ship
  const { data: crewedShip, isLoading: crewedShipIsLoading } = useShip(crew?._location?.shipId);  // TODO: do we need this?
  const { data: zoomedToShip, isLoading: zoomedShipIsLoading } = useShip(zoomScene?.type === 'SHIP' ? zoomScene.shipId : undefined);

  // actionable ship
  // NOTE: this does not handle escape pod... these are only for real ships, and that is
  //  expected for the action buttons in their current state
  const targetShip = useMemo(() => {
    let ship = null;

    // if zoomed to ship
    if (zoomedToShip) ship = zoomedToShip;
    // if surface ship on lot
    else if (lot?.surfaceShip) ship = lot.surfaceShip;

    // "shortcuts" -- these ships are of implicit interest, but not explicitly selected in this case
    // if my crew is on a ship on this lot
    else if (crewedShip && crewedShip._location?.lotId === lot?.id) ship = crewedShip;

    // // if there is only one owned ship on the lot
    // if (!ship) {
    //   const lotOwnedShips = (lot?.ships || []).filter((s) => accountCrewIds?.includes(s.Control.controller.id));
    //   if (lotOwnedShips?.length === 1) ship = lotOwnedShips[0]; // if only one owned ship, show it
    // }

    // some of these sources don't have location set
    if (ship && !ship._location) {
      ship = cloneDeep(ship);
      ship._location = locationsArrToObj(ship.Location.locations || []);
    }

    return ship;
  }, [zoomedToShip, crewedShip, lot, crew?.id]);

  // TODO: should this be useMemo?
  const actions = useMemo(() => {
    if (asteroidIsLoading || lotIsLoading || crewedShipIsLoading || zoomedShipIsLoading) return [];
    return Object.keys(actionButtons)
      .filter((k) => !actionButtons[k].isVisible || actionButtons[k].isVisible({
        account: accountAddress,
        accountCrewIds,
        asteroid,
        blockTime,
        crew,
        crewedShip,
        building: zoomStatus === 'in' && constructionStatus === 'OPERATIONAL' && lot?.building,
        constructionStatus,
        isAtRisk,
        lot: zoomStatus === 'in' && lot,
        openHudMenu,
        ship: targetShip?.Ship?.status === Ship.STATUSES.AVAILABLE && targetShip,
        simulation,
        zoomStatus,
        zoomScene
      }))
      .sort((a, b) => (buttonOrder[a] || 100) - (buttonOrder[b] || 100))
      .map((k) => actionButtons[k].Component || actionButtons[k]);
  }, [asteroid, blockTime, constructionStatus, crew, crewedShip, lot, openHudMenu, resourceMap?.active, !!resourceMap?.selected, targetShip, simulation, zoomScene, zoomStatus]);

  // TODO: within each action button, should memoize whatever is passed to flags
  // (because always a new object, will always re-render the underlying button)
  return {
    actions,
    props: {
      accountAddress,
      accountCrewIds,
      asteroid,
      blockTime,
      crew,
      lot,
      ship: targetShip,
      onSetAction: setAction,
      simulation,
      simulationActions,
      _disabled: asteroidIsLoading || lotIsLoading
    }
  }
};

export default useActionButtons;
