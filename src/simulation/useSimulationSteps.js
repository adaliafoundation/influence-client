import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building, Crewmate, Entity, Inventory, Permission, Process, Processor, Product, Ship } from '@influenceth/sdk';
import { useHistory } from 'react-router-dom';
import { BiTransfer as TransferIcon } from 'react-icons/bi';

import { appConfig } from '~/appConfig';
import { ZOOM_IN_ANIMATION_TIME, ZOOM_OUT_ANIMATION_TIME } from '~/game/scene/Asteroid';
import useCrewAgreements from '~/hooks/useCrewAgreements';
import useCrewBuildings from '~/hooks/useCrewBuildings';
import useCrewContext from '~/hooks/useCrewContext';
import useCrewSamples from '~/hooks/useCrewSamples';
import useLot from '~/hooks/useLot';
import useSimulationState from '~/hooks/useSimulationState';
import useStore from '~/hooks/useStore';
import SIMULATION_CONFIG from '~/simulation/simulationConfig';
import { COACHMARK_IDS } from '~/contexts/CoachmarkContext';
import { formatResourceMass, getBuildingRequirementsMet } from '~/game/interface/hud/actionDialogs/components';
import { getMockBuildingInventories } from './MockDataManager';
import useCrewOrders from '~/hooks/useCrewOrders';
import useCrewShips from '~/hooks/useCrewShips';
import EntityName from '~/components/EntityName';
import useTravelSolutionIsValid from '~/hooks/useTravelSolutionIsValid';
import { SwayIcon } from '~/components/Icons';
import { fireTrackingEvent, formatPrice } from '~/lib/utils';
import { TOKEN, TOKEN_SCALE } from '~/lib/priceUtils';
import useSession from '~/hooks/useSession';
import { cutsceneHideTime } from '~/game/Cutscene';
import { getPrimaryNewPlayerLoginOptions } from '~/lib/wallets';

const DELAY_MESSAGE = 1000;

const useSimulationSteps = () => {
  const { connecting, login } = useSession();
  const { crew, pendingTransactions } = useCrewContext();
  const simulation = useSimulationState();
  const history = useHistory();

  const createAlert = useStore(s => s.dispatchAlertLogged);
  const dispatchCinematicInitialPosition = useStore(s => s.dispatchCinematicInitialPosition);
  const dispatchCoachmarks = useStore(s => s.dispatchCoachmarks);
  const dispatchFiltersReset = useStore(s => s.dispatchFiltersReset);
  const dispatchDestinationSelected = useStore(s => s.dispatchDestinationSelected);
  const dispatchHudMenuOpened = useStore(s => s.dispatchHudMenuOpened);
  const dispatchOriginSelected = useStore(s => s.dispatchOriginSelected);
  const dispatchLotSelected = useStore(s => s.dispatchLotSelected);
  const dispatchGoToHighAltitude = useStore(s => s.dispatchGoToHighAltitude);
  const dispatchResourceMapSelect = useStore(s => s.dispatchResourceMapSelect);
  const dispatchResourceMapToggle = useStore(s => s.dispatchResourceMapToggle);
  const dispatchSimulationActions = useStore((s) => s.dispatchSimulationActions);
  const dispatchSimulationLotState = useStore((s) => s.dispatchSimulationLotState);
  const dispatchSimulationState = useStore((s) => s.dispatchSimulationState);
  const dispatchSimulationStep = useStore((s) => s.dispatchSimulationStep);
  const dispatchZoomScene = useStore(s => s.dispatchZoomScene);
  const updateZoomStatus = useStore(s => s.dispatchZoomStatusChanged);

  const cutscene = useStore(s => s.cutscene);
  const openHudMenu = useStore(s => s.openHudMenu);
  const origin = useStore(s => s.asteroids.origin);
  const destination = useStore(s => s.asteroids.destination);
  const selectedLotId = useStore(s => s.asteroids.lot);
  const selectedResourceId = useStore(s => s.asteroids.resourceMap.active ? s.asteroids.resourceMap.selected : null);
  const currentZoomScene = useStore(s => s.asteroids.zoomScene);
  const zoomStatus = useStore(s => s.asteroids.zoomStatus);
  const actionDialog = useStore(s => s.actionDialog);
  const inTravelMode = useStore(s => s.asteroids.travelMode);
  const travelSolution = useStore(s => s.asteroids.travelSolution);

  const { data: crewAgreements, isLoading: agreementsLoading } = useCrewAgreements(true, false, true);
  const { data: crewBuildings, isLoading: buildingsLoading } = useCrewBuildings();
  const { data: crewDeposits, isLoading: depositsLoading } = useCrewSamples();
  const { data: crewShips, isLoading: shipsLoading } = useCrewShips();
  const { data: crewOrders, isLoading: ordersLoading } = useCrewOrders(crew?.id);
  const { data: selectedLot, isLoading: lotLoading } = useLot(selectedLotId);
  const isLoading = agreementsLoading || buildingsLoading || depositsLoading || shipsLoading || ordersLoading || lotLoading;
  const travelSolutionIsValid = useTravelSolutionIsValid();

  const [locationPath, setLocationPath] = useState();
  const [transitioning, setTransitioning] = useState();
  const isTransitioning = !!transitioning;

  useEffect(() => {
    // (returns unlisten, so can just return directly to useEffect)
    return history.listen((location) => setLocationPath(location.pathname));
  }, [history]);

  const resetAsteroidFilters = () => dispatchFiltersReset('asteroids');
  
  const advance = useCallback(() => {
    // track that step was completed
    fireTrackingEvent('simulation', { step: simulation.step });

    // transition to next step
    const nextStep = (simulation.step || 0) + 1;
    
    setTransitioning(true);
    setTimeout(() => {
      dispatchSimulationStep(nextStep);
      setTimeout(() => {
        setTransitioning(false);
      }, 500);
    }, 0);
  }, [dispatchSimulationStep, simulation?.step]);

  const simulationSteps = useMemo(() => {

    // selectLot
    let selectedLotIsLeasable = false;
    let selectedLotIsMine = false;
    if (selectedLot) {
      const crewStatus = Permission.getPolicyDetails(selectedLot, crew)[Permission.IDS.USE_LOT]?.crewStatus;
      selectedLotIsLeasable = (
        crewStatus === 'available'
        && selectedLot?.Location?.location?.id === SIMULATION_CONFIG.asteroidId
        && !selectedLot?.building
        && !selectedLot?.surfaceShip
      );
      selectedLotIsMine = (crewStatus === 'controller');
    }

    // next available unused lot
    const nextUnusedLotId = (crewAgreements || []).find((a) => {
      return !(crewBuildings || []).find((b) => b.Location.location.id === a.id)
    })?.id;

    const extractorLot = Object.values(simulation.lots || {}).find((l) => l.buildingType === Building.IDS.EXTRACTOR);
    const warehouseLot = Object.values(simulation.lots || {}).find((l) => l.buildingType === Building.IDS.WAREHOUSE);
    const refineryLot = Object.values(simulation.lots || {}).find((l) => l.buildingType === Building.IDS.REFINERY);
    const shipyardLot = Object.values(simulation.lots || {}).find((l) => l.buildingType === Building.IDS.SHIPYARD);
    const shipLot = Object.values(simulation.lots || {}).find((l) => !!l.shipId);
  
    const crewIsOnShip = !!crew?._location?.shipId;

    // my inventory contents flags
    const crewHasCoreDrill = !!(crewBuildings || []).find((b) => {
      return !!(b.Inventories || []).find((i) => (
        i.status === Inventory.STATUSES.AVAILABLE
        && (i.contents || []).find((c) => c.product === Product.IDS.CORE_DRILL && c.amount > 0)
      ));
    });
    const crewAcetyleneAmount = (crewBuildings || []).reduce((acc1, b) => {
      const buildingAcetylene = (b.Inventories || []).reduce((acc2, i) => {
        if (i.status === Inventory.STATUSES.AVAILABLE) {
          const item = (i.contents || []).find((c) => c.product === Product.IDS.ACETYLENE);
          return acc2 + (item?.amount || 0);
        }
        return acc2;
      }, 0);
      return acc1 + buildingAcetylene;
    }, 0);
    const crewHasFood = !!(crewShips || []).find((b) => {
      return !!(b.Inventories || []).find((i) => (
        i.status === Inventory.STATUSES.AVAILABLE
        && (i.contents || []).find((c) => c.product === Product.IDS.FOOD && c.amount >= 0.75 * SIMULATION_CONFIG.marketplaceAmounts[Product.IDS.FOOD])
      ));
    });
    const crewHasPropellant = !!(crewShips || []).find((b) => {
      return !!(b.Inventories || []).find((i) => (
        i.status === Inventory.STATUSES.AVAILABLE
        && (i.contents || []).find((c) => c.product === Product.IDS.HYDROGEN_PROPELLANT && c.amount >= 0.75 * SIMULATION_CONFIG.marketplaceAmounts[Product.IDS.HYDROGEN_PROPELLANT])
      ));
    });

    // "plan" action button --> extractor
    // (fast forward)
    // "construct" action button
    // "source from markets" button
    // (fast forward)
    // "construct" action button
    // (fast forward)
    const getConstructBuildingCoachmarks = (buildingType) => {
      const plannedLot = Object.values(simulation.lots || {}).find((l) => l.buildingType === buildingType);

      const x = {};

      // need to plan... select a leased, empty lot
      if (!plannedLot) {
        const onLeasedEmptyLot = selectedLotIsMine && !selectedLot?.building;
        x[COACHMARK_IDS.hudMenuMyAssets] = !onLeasedEmptyLot && !actionDialog?.type && openHudMenu !== 'MY_ASSETS';
        x[COACHMARK_IDS.hudMenuMyAssetsAgreement] = !onLeasedEmptyLot && !actionDialog?.type && openHudMenu === 'MY_ASSETS' ? nextUnusedLotId : false;
        x[COACHMARK_IDS.actionButtonPlan] = onLeasedEmptyLot && !actionDialog?.type;
        x[COACHMARK_IDS.actionDialogPlanType] = buildingType;

      // need to construct
      } else {
        const pseudoBuilding = {
          id: plannedLot.buildingId,
          label: Building.IDS.LABEL,
          Building: {
            buildingType: plannedLot.buildingType,
          },
          Inventories: getMockBuildingInventories(plannedLot.buildingType, plannedLot.buildingStatus, plannedLot.inventoryContents)
        };

        // navigate to planned lot
        const onPlannedLot = selectedLot?.building?.id === plannedLot?.buildingId;
        x[COACHMARK_IDS.hudMenuMyAssets] = !onPlannedLot && !actionDialog?.type && openHudMenu !== 'MY_ASSETS';
        x[COACHMARK_IDS.hudMenuMyAssetsBuilding] = !onPlannedLot && !actionDialog?.type && openHudMenu === 'MY_ASSETS' ? plannedLot.buildingId : false;
        
        // open construct dialog
        x[COACHMARK_IDS.actionButtonConstruct] = onPlannedLot && !['CONSTRUCT', 'SHOPPING_LIST'].includes(actionDialog?.type);
        if (!getBuildingRequirementsMet(pseudoBuilding)) {
          x[COACHMARK_IDS.actionDialogConstructSource] = onPlannedLot && actionDialog?.type === 'CONSTRUCT';
        }
      }

      return x;
    }

    // {
    //   cinematic,
    //   lot,
    //   destination,
    //   openHudMenu,
    //   origin,
    //   resourceId,
    //   zoomStatus: newZoomStatus
    // }
    const goTo = (update) => {
      const needsToZoomIn = update.zoomStatus === 'in'
        && !(zoomStatus === 'in' || zoomStatus === 'zooming-in');
      const needsToTransfer = update.zoomStatus === 'in'
        && update.origin !== origin
        && (zoomStatus === 'in' || zoomStatus === 'zooming-in');
      const needsToZoomOut = update.zoomStatus === 'out'
        && !(zoomStatus === 'out' || zoomStatus === 'zooming-out');

      setTransitioning(true);

      // cleanup (as needed)
      resetAsteroidFilters();
      dispatchOriginSelected(update.origin);
      dispatchDestinationSelected(update.destination);
      if (update.openHudMenu) dispatchHudMenuOpened();
      if (currentZoomScene && !update.currentZoomScene) dispatchZoomScene();
      if (selectedResourceId && !update.resourceId) dispatchResourceMapToggle();

      const onFinish = () => {
        // TODO? 
        // if (needsToZoomIn || needsToTransfer || needsToZoomOut) dispatchReorientCamera();

        let extraDelay = 0;
        if (update.openHudMenu) dispatchHudMenuOpened(update.openHudMenu);
        if (update.resourceId) dispatchResourceMapSelect(update.resourceId);
        if (Object.keys(update).includes('lot')) {
          dispatchLotSelected(update.lot);
          extraDelay += 1e3; // (this is a variable length transition, so maybe don't add anything?)
        }
        if (update.highAltitude) {
          dispatchGoToHighAltitude(true);
        }

        setTimeout(() => {
          setTransitioning(false);
          if (update.cinematic) dispatchCinematicInitialPosition(false);
        }, DELAY_MESSAGE + extraDelay);
      };

      if (needsToZoomIn) {
        dispatchCinematicInitialPosition(!!update.cinematic);
        setTimeout(() => {
          updateZoomStatus('zooming-in');
          setTimeout(() => {
            onFinish();
          }, ZOOM_IN_ANIMATION_TIME);
        }, 0);

      } else if (needsToTransfer) {
        setTimeout(() => {
          updateZoomStatus('zooming-in');
          setTimeout(() => {
            onFinish();
          }, ZOOM_IN_ANIMATION_TIME);
        }, 0);

      } else if (needsToZoomOut) {
        setTimeout(() => {
          updateZoomStatus('zooming-out');
          setTimeout(() => {
            onFinish();
          }, ZOOM_OUT_ANIMATION_TIME);
        }, 0);

      } else {
        onFinish();
      }
    };

    return [
      {
        title: 'Welcome to Influence',
        content: (
          <>
            Welcome, Adalian! The Prime Council knows that you are eager to get out there and get started, 
            but first we need to ensure that you are equipped with the knowledge you need to survive here.
            <br /><br />
            I'm Dr. Yuri Prokhorov, and I was the last Provost of the Arvad, the great generational ship 
            that arrived here from Earth. Education has been my life's work, and I'm continuing that work 
            by assisting you as you enter adulthood in Adalia.
          </>
        ),
        crewmateId: SIMULATION_CONFIG.crewmates.scientist,
        targetLocation: () => ({ zoomStatus: 'in', origin: 1 }),
        initialize: () => {
          setTimeout(() => {  // delay zoom until after fade out (if there is a cutscene)
            goTo({ cinematic: true, zoomStatus: 'in', origin: 1 })
          }, cutscene ? cutsceneHideTime : 0);
        },
        coachmarks: {
          // TODO: rightButton?
        },
        rightButton: {
          children: 'Let\'s Get Started',
          onClick: () => advance(),
        },
      },
      {
        title: 'Create Your Recruit',
        content: (
          <>
            Before you choose which class to join and begin your specialized education, you have one 
            last general education requirement to complete. Your final requirement is a training simulation 
            which takes the form of a practical internship as a new recruit. You'll be learning about life 
            in Adalia by joining an experienced crew made up of volunteers who are ready to teach you. I'll 
            be helping to get you started with your training and finding a crew for you to join.
            <br/><br/>
            Click on the empty crew slot in your HUD to get started.
          </>
        ),
        crewmateId: SIMULATION_CONFIG.crewmates.scientist,
        targetLocation: () => ({ url: '/recruit/0/1/0/create' }),
        coachmarks: {
          [COACHMARK_IDS.hudRecruitCaptain]: (!locationPath || locationPath === '/') // not in creation flow
        },
        enabledActions: {
          RecruitCrewmate: true
        },
        shouldAdvance: () => simulation.crewmate?.name && simulation.crewmate?.appearance
      },
      {
        // TODO: navigate to fake /crew page? could probably do now that faking state
        title: `Welcome, ${simulation.crewmate?.name}!`,
        content: `
          Your friends are going to be so envious - you must be one of the luckiest new recruits in Adalia. 
          The rest of the crew for your training is composed of some of the most illustrious Adalians - 
          they were all Department Heads and members of the Prime Council aboard the Arvad, before it was 
          dismantled for parts to build our first settlements here.
        `,
        crewmateId: SIMULATION_CONFIG.crewmates.scientist,
        coachmarks: {
          // TODO: brief flash on crewmate added to AvatarMenu?
          // [COACHMARK_IDS.simulationRightButton]: true
        }, 
        initialize: () => {/* TODO: open crew details? */},
        rightButton: {
          children: 'Start Training Simulation',
          onClick: () => advance(),
        },
      },
      {
        title: 'This is Adalia',
        content: `
          Located partially inside our star's habitable "Goldilocks Zone," the Adalian asteroid belt is 
          comprised of 250,000 asteroids with unique orbital paths & resource compositions. While it isn't 
          the habitable planet that our ancestors who set out from Earth hoped to find, these asteroids 
          have become our homes, and our only means of survival.
        `,
        crewmateId: SIMULATION_CONFIG.crewmates.scientist,
        targetLocation: () => ({ zoomStatus: 'out' }),
        initialize: () => {
          goTo({ zoomStatus: 'out' })
        },
        coachmarks: {
          [COACHMARK_IDS.backToBelt]: zoomStatus === 'in',
          [COACHMARK_IDS.simulationRightButton]: selectedResourceId
        },
        rightButton: {
          children: 'Next',
          onClick: () => advance(),
        },
      },
      {
        title: 'Adalia Prime - The First Colony',
        content: `I've focused your navigation panel on Adalia Prime. Click the HUD to zoom in for a closer look.`,
        crewmateId: SIMULATION_CONFIG.crewmates.scientist,
        targetLocation: () => ({ zoomStatus: 'in', origin: 1 }),
        initialize: () => {
          goTo({ zoomStatus: 'out', origin: 1 })
        },
        coachmarks: { // if AP selected, InfoPane; else, "crew location"
          [COACHMARK_IDS.hudCrewLocation]: origin !== 1 || zoomStatus === 'in',
          [COACHMARK_IDS.hudInfoPane]: zoomStatus === 'out' && origin === 1
        },
        shouldAdvance: () => zoomStatus === 'in' && origin === 1
      },
      {
        title: 'Adalia Prime - The First Colony',
        content: (
          <>
            Adalia Prime is the single largest asteroid in the belt and the oldest hub of commerce and human activity. 
            Here was our first real home in the asteroid belt, and this is where, at any public Habitat, you can find 
            fellow new recruits when you are ready to form your first crew.
            {selectedLotId !== crew?._location?.lotId && (
              <>
                <br/><br/>
                Click on the HUD crew location to zoom to your current station.
              </>
            )}
          </>
        ),
        crewmateId: SIMULATION_CONFIG.crewmates.scientist,
        targetLocation: () => ({ zoomStatus: 'in', origin: 1 }),
        initialize: () => {
          goTo({ zoomStatus: 'in', origin: 1 })
        },
        coachmarks: {
          [COACHMARK_IDS.hudCrewLocation]: selectedLotId !== crew?._location?.lotId,
          // [COACHMARK_IDS.simulationRightButton]: selectedLotId === crew?._location?.lotId,
        },
        rightButton: selectedLotId === crew?._location?.lotId && {
          children: 'Next',
          onClick: () => advance(),
        },
      },
      {
        title: 'Resource Mapping',
        content: (
          <>
            Every asteroid has a set of resources available for you to mine, refine, and use in manufacturing. Resource 
            maps show you where the highest concentrations are located on a particular asteroid. No single asteroid has 
            everything we need to survive, but, when we combine resources from all of the spectral types, we have 
            everything we need to sustain our colony.
            {!selectedResourceId && (
              <>
                <br /><br />
                Enable the resource map display in your HUD, then spin around the asteroid to explore.
              </>
            )}
          </>
        ),
        crewmateId: SIMULATION_CONFIG.crewmates.scientist,
        targetLocation: () => ({ zoomStatus: 'in', origin: 1, openHudMenu: 'RESOURCES', resourceId: Product.IDS.BITUMEN, lot: null, highAltitude: true }),
        initialize: () => {
          goTo({ zoomStatus: 'in', origin: 1, lot: null, highAltitude: true })
        },
        coachmarks: {
          [COACHMARK_IDS.hudCrewLocation]: zoomStatus !== 'in' || origin !== 1,
          [COACHMARK_IDS.hudMenuResources]: openHudMenu !== 'RESOURCES',
          [COACHMARK_IDS.hudMenuTargetResource]: openHudMenu === 'RESOURCES' && !selectedResourceId ? Product.IDS.BITUMEN : null,
          [COACHMARK_IDS.simulationRightButton]: selectedResourceId
        },
        rightButton: selectedResourceId && {
          children: 'Next',
          onClick: () => advance(),
        },
      },
      {
        title: 'Lease Some Lots',
        content: `
          Now that you understand Adalia, you're ready to join your crew and get some practical experience. Since 
          the Prime Council still controls Adalia Prime, you'll have to lease some lots of land from them. The 
          first task that you are assigned in your internship is to find an unoccupied lot to lease. It's also your 
          first lesson in how the economics of Adalia operate. I'll hand you over to Mason Quince to get started.
        `,
        crewmateId: SIMULATION_CONFIG.crewmates.scientist,
        rightButton: { children: 'Next', onClick: () => advance(), },
      },
      {
        title: 'Lease Some Lots',
        content: `
          Hey there, I'm Mason, and I'm one of the founding members of the Merchants of Venus Guild, and I'm here 
          to dispense some of my infinite wisdom to you. Leasing lots is all about balance. The further out from 
          the city centers that you go, the cheaper the lots, but the higher the commute time for your crew and 
          goods to get to market. Find the right balance and I'm sure you'll find a sweet spot to set up a 
          beginning mining operation.
        `,
        crewmateId: SIMULATION_CONFIG.crewmates.merchant,
        rightButton: { children: 'Next', onClick: () => advance(), },
      },
      {
        title: 'Lease Some Lots',
        content: (
          <>
            I've sent you <SwayIcon />{formatPrice(SIMULATION_CONFIG.startingSway / TOKEN_SCALE[TOKEN.SWAY], { minPrecision: 0 })}{' '}
            SWAY, the currency of Adalia, to get you started. Try not to spend it all in one place! Or do, it's up to you, this is 
            only a simulation.
            <br/><br/>
              Choose a spot on Adalia Prime that is unoccupied and has an abundance of 
              {' '}{Product.TYPES[SIMULATION_CONFIG.resourceId].name}, keeping in mind my advice about balance.
            <br/><br/>
            Zoom in until you see the hexes show up and click the spot at the center of any lot to reveal lot-specific actions in 
            the HUD.
          </>
        ),
        crewmateId: SIMULATION_CONFIG.crewmates.merchant,
        initialize: () => {
          dispatchSimulationState('sway', SIMULATION_CONFIG.startingSway);
          if (simulation.sway < SIMULATION_CONFIG.startingSway) {
            createAlert({
              type: 'ActivityLog',
              data: {
                icon: <TransferIcon />,
                content: (
                  <>
                    {(SIMULATION_CONFIG.startingSway / TOKEN_SCALE[TOKEN.SWAY]).toLocaleString()}{' '}
                    SWAY transferred from Mason Quince to Training Simulator
                  </>
                )
              },
              duration: 6000
            })
          }
        },
        coachmarks: {
          // TODO: coachmarks back to AP, zoomed in

          // open resource map
          [COACHMARK_IDS.hudMenuResources]: !selectedLot && openHudMenu !== 'RESOURCES',
          [COACHMARK_IDS.hudMenuTargetResource]: !selectedLot && openHudMenu === 'RESOURCES' && selectedResourceId !== SIMULATION_CONFIG.resourceId ? SIMULATION_CONFIG.resourceId : null,

          // prompt to lease
          [COACHMARK_IDS.actionButtonLease]: selectedLotIsLeasable && !actionDialog?.type,
        },
        enabledActions: {
          FormLotLeaseAgreement: !!selectedLotIsLeasable
        },
        shouldAdvance: () => !!simulation.lots
      },
      {
        title: 'Lease Some Lots',
        content: (
          <>
            Excellent choice! I can see you're going to be a quick study.
            <br/><br/>
            To save you some time, I went ahead and leased the neighboring lots for you as well.
          </>
        ),
        initialize: () => {}, // TODO: open "my assets" so can see the agreements
        crewmateId: SIMULATION_CONFIG.crewmates.merchant,
        rightButton: { children: 'Next', onClick: () => advance(), },
      },
      {
        title: 'Building the Basics',
        content: (
          <>
            Hi, I'm Petros Vallois, I was the last Chief Technology Officer of the Arvad, and I'm here to guide you in 
            your next steps. Keep in mind, humans are innate tool users, we are all builders, and we can all learn to 
            make something useful. No matter what class you end up joining, every Adalian is more than capable of 
            building an extractor and a warehouse. Let's get you started.
          </>
        ),
        crewmateId: SIMULATION_CONFIG.crewmates.engineer,
        rightButton: { children: 'Next', onClick: () => advance(), },
      },
      {
        title: 'Building the Basics',
        content: `We'll start with an Extractor. Select one of your already-leased lots, and add the appropriate "Site Plan."`,
        crewmateId: SIMULATION_CONFIG.crewmates.engineer,
        coachmarks: () => getConstructBuildingCoachmarks(Building.IDS.EXTRACTOR),
        enabledActions: {
          PlanBuilding: !!selectedLotIsMine,
          [`SelectSitePlan:${Building.IDS.EXTRACTOR}`]: true,
        },
        shouldAdvance: () => {
          return !!Object.values(simulation.lots).find((l) => l.buildingType === Building.IDS.EXTRACTOR);
        },
      },
      {
        title: 'Building the Basics',
        content: (
          <>
            Quick aside -- Rome wasn't built in a day. To map out your Extractor Site Plan, your crew 
            had to hitch a ride on a robotic transport known as a hopper, travel from their habitat building 
            out to the intended construction site, and back.
            <br/><br/>
            Typically this is a fairly lengthy process, but since there is so much to cover in your training 
            simulation, we'll just let you...
          </>
        ),
        crewmateId: SIMULATION_CONFIG.crewmates.engineer,
        rightButton: {
          children: 'Fast Forward',
          onClick: () => {
            dispatchSimulationState('canFastForward', true);
          }
        },
        shouldAdvance: () => {
          return !!simulation.canFastForward
        },
      },
      {
        title: 'Building the Basics',
        content: `
          Great job! Now, by following the training guides in the HUD, you can source materials 
          for your planned Extractor on the open markets of Adalia Prime, and start construction.
        `,
        crewmateId: SIMULATION_CONFIG.crewmates.engineer,
        coachmarks: () => getConstructBuildingCoachmarks(Building.IDS.EXTRACTOR),
        enabledActions: {
          Construct: selectedLotIsMine && !!selectedLot?.building,
          // TODO: deliveries?
        },
        shouldAdvance: () => {
          return !!Object.values(simulation.lots).find((l) => l.buildingType === Building.IDS.EXTRACTOR && l.buildingStatus === Building.CONSTRUCTION_STATUSES.OPERATIONAL);
        },
      },
      {
        title: 'Building the Basics',
        content: `
          Nice work! Next, you'll need somewhere to store your mining output, so let's construct a 
          Warehouse nearby. Follow the training guides again to build your first Warehouse, and then 
          talk to Julia to start learning how to mine.
        `,
        crewmateId: SIMULATION_CONFIG.crewmates.engineer,
        coachmarks: () => getConstructBuildingCoachmarks(Building.IDS.WAREHOUSE),
        enabledActions: {
          PlanBuilding: !!selectedLotIsMine,
          [`SelectSitePlan:${Building.IDS.WAREHOUSE}`]: true,
          Construct: selectedLotIsMine && !!selectedLot?.building,
        },
        shouldAdvance: () => {
          return !!Object.values(simulation.lots).find((l) => l.buildingType === Building.IDS.WAREHOUSE && l.buildingStatus === Building.CONSTRUCTION_STATUSES.OPERATIONAL);
        },
      },
      {
        title: `What's Mine is Mine`,
        content: (
          <>
            We've all had to adjust to life outside of the Arvad. I'm Julia Oliveira and I'll always 
            remember my time as the Chief Cook fondly, but now, I'm a Miner. I believe Miners are the 
            backbone of Adalia, without us, no one could survive here. Despite what we hoped for, this 
            place won't allow us to sow crops and farm the surface directly. So, we have to dig to get 
            what we need. Luckily, the essentials needed for food, for life support, for survival are 
            here, beneath the surface, if you know where to find them.
          </>
        ),
        coachmarks: {
          // [COACHMARK_IDS.simulationRightButton]: true
        },
        crewmateId: SIMULATION_CONFIG.crewmates.miner,
        rightButton: { children: 'Next', onClick: () => advance(), },
      },
      {
        title: `What's Mine is Mine`,
        content: (
          <>
            Let's purchase a few core drills from the markets. We'll have them delivered to your new
            warehouse, and then we can start searching for {Product.TYPES[SIMULATION_CONFIG.resourceId].name}-rich
            deposits on the lot with your new Extractor.
          </>
        ),
        crewmateId: SIMULATION_CONFIG.crewmates.miner,
        coachmarks: {
          // purchase core samplers from the market to the warehouse
          // (fast forward)
          [COACHMARK_IDS.hudMenuMarketplaces]: (!locationPath || locationPath === '/'),
          [COACHMARK_IDS.asteroidMarketsHelper]: Product.IDS.CORE_DRILL, // TODO: max 100
        },
        enabledActions: {
          MarketBuy: true,
          [`SelectInventory:${Entity.IDS.BUILDING}.${warehouseLot?.buildingId}.2`]: true,
        },
        shouldAdvance: () => {
          return !!crewHasCoreDrill;
        }
      },
      {
        title: `What's Mine is Mine`,
        content: (
          <>
            Great work! Now, click on the lot with your extractor on it, and let's kick off a new core 
            sample with one of your new core drills. Once we have analyzed the core, we'll be able to
            extract {Product.TYPES[SIMULATION_CONFIG.resourceId].name} from that deposit. 
          </>
        ),
        crewmateId: SIMULATION_CONFIG.crewmates.miner,
        coachmarks: {
          // "core sample" action button
          // (fast forward)
          // "finish"
          [COACHMARK_IDS.detailsClose]: (locationPath !== '/'),
          [COACHMARK_IDS.hudMenuMyAssets]: !actionDialog?.type && selectedLot?.building?.id !== extractorLot?.buildingId && openHudMenu !== 'MY_ASSETS',
          [COACHMARK_IDS.hudMenuMyAssetsBuilding]: selectedLot?.building?.id !== extractorLot?.buildingId ? extractorLot?.buildingId : null,
          [COACHMARK_IDS.actionButtonCoreSample]: !actionDialog?.type && selectedLot?.building?.id === extractorLot?.buildingId,
          [COACHMARK_IDS.actionDialogTargetResource]: SIMULATION_CONFIG.resourceId
        },
        enabledActions: {
          [`SelectInventory:${Entity.IDS.BUILDING}.${warehouseLot?.buildingId}.2`]: true,
          CoreSample: selectedLot?.building?.id === extractorLot?.buildingId,
          [`SelectTargetResource:${SIMULATION_CONFIG.resourceId}`]: true
        },
        shouldAdvance: () => {
          return !!(extractorLot?.depositYield > 0) && !actionDialog?.type;
        }
      },
      {
        title: `What's Mine is Mine`,
        content: `
          And now, we dig. It isn't so unlike farming potatoes, we're just using this giant shovel to pull up 
          what we found with our core sample. Both types of work require getting your hands dirty. When we're 
          done, you can go back to Petros.
        `,
        crewmateId: SIMULATION_CONFIG.crewmates.miner,
        coachmarks: {
          [COACHMARK_IDS.actionButtonExtract]: !actionDialog?.type && selectedLot?.building?.id === extractorLot?.buildingId,
          [COACHMARK_IDS.actionDialogMaxRecipes]: true
        },
        enabledActions: {
          Extract: selectedLot?.building?.id === extractorLot?.buildingId,
          [`SelectInventory:${Entity.IDS.BUILDING}.${warehouseLot?.buildingId}.2`]: true,
        },
        shouldAdvance: () => {
          return !!(extractorLot?.depositYield > extractorLot?.depositYieldRemaining);
        },
      },
      {
        title: `Refining your Skills`,
        content: (
          <>
            Alright, your first extraction is complete! Enough playing in the dirt, time to get back to building again. 
            This time we're building a Refinery, where we'll turn all those rocks into something useful.
            <br/><br/>
            Follow the HUD training guides to construct your first refinery.
          </>
        ),
        crewmateId: SIMULATION_CONFIG.crewmates.engineer,
        coachmarks: () => getConstructBuildingCoachmarks(Building.IDS.REFINERY),
        enabledActions: {
          PlanBuilding: !!selectedLotIsMine,
          [`SelectSitePlan:${Building.IDS.REFINERY}`]: true,
          Construct: selectedLotIsMine && !!selectedLot?.building,
        },
        shouldAdvance: () => {
          return !!Object.values(simulation.lots).find((l) => l.buildingType === Building.IDS.REFINERY && l.buildingStatus === Building.CONSTRUCTION_STATUSES.OPERATIONAL);
        },
      },
      {
        title: `Refining your Skills`,
        content: `
          Refineries are where Engineers and Scientists should be working together. Now, I know you've probably grown 
          up hearing about the rivalry between these two classes, but from my point of view, we would all benefit from 
          a bit more cooperation. Here's some personal protective equipment, don't ever go on the Refinery floor 
          without it! And make sure to follow the processes, they are there for your safety!
        `,
        crewmateId: SIMULATION_CONFIG.crewmates.engineer,
        coachmarks: () => ({
          [COACHMARK_IDS.hudMenuMyAssets]: refineryLot && !actionDialog?.type && selectedLot?.building?.id !== refineryLot?.buildingId && openHudMenu !== 'MY_ASSETS',
          [COACHMARK_IDS.hudMenuMyAssetsBuilding]: refineryLot && selectedLot?.building?.id !== refineryLot?.buildingId ? refineryLot?.buildingId : null,
          [COACHMARK_IDS.actionButtonProcess]: !actionDialog?.type && selectedLot?.building?.id === refineryLot?.buildingId,
          [COACHMARK_IDS.actionDialogTargetProcess]: actionDialog?.type === 'PROCESS' ? SIMULATION_CONFIG.processId : null,
          [COACHMARK_IDS.actionDialogMaxRecipes]: true
        }),
        enabledActions: {
          [`Process:${Processor.IDS.REFINERY}`]: selectedLotIsMine && selectedLot?.building?.id === refineryLot?.buildingId,
          [`SelectProcess:${Process.IDS.HUELS_PROCESS}`]: true,
          [`SelectInventory:${Entity.IDS.BUILDING}.${warehouseLot?.buildingId}.2`]: true,
        },
        shouldAdvance: () => crewAcetyleneAmount > 0
      },
      {
        title: `Step 3: Profit`,
        content: (
          <>
            Well, you survived your first trip to a Refinery floor! All right! Time to see what you're 
            really made of, kid. Let's go to a Marketplace, in here, you make no friends and you take no 
            prisoners. One minute you're up half a million in soybeans and the next, boom, your kids 
            never leave their test-tubes and they've repossessed your Heavy Transport.
          </>
        ),
        crewmateId: SIMULATION_CONFIG.crewmates.merchant,
        rightButton: { children: 'Next', onClick: () => advance(), },
      },
      {
        title: `Step 3: Profit`,
        content: `
          Create a Limit Sell order for your ${formatResourceMass(crewAcetyleneAmount, Product.IDS.ACETYLENE)}
          stock of ${Product.TYPES[Product.IDS.ACETYLENE].name}. Try to choose a marketplace where you 
          can create an offer at a high price while staying competitive with the other offers.
        `,
        crewmateId: SIMULATION_CONFIG.crewmates.merchant,
        coachmarks: () => ({
          [COACHMARK_IDS.hudMenuMarketplaces]: (!locationPath || locationPath === '/'),
          [COACHMARK_IDS.asteroidMarketsHelper]: Product.IDS.ACETYLENE
        }),
        enabledActions: {
          LimitSell: true,
          [`SelectInventory:${Entity.IDS.BUILDING}.${warehouseLot?.buildingId}.2`]: true,
        },
        shouldAdvance: () => crewOrders?.length > 0
      },
      {
        title: 'Shipshape',
        content: (
          <>
            Not bad for your first sale! Now, back to building. You and I are getting to know each 
            other pretty well. I don't say this to all the new recruits I meet, but I think you might 
            actually be able to hack it as an Engineer. At least you don't seem to be afraid of hard work.
            <br/><br/>
            Follow the HUD training guides to construct a Shipyard.
          </>
        ),
        crewmateId: SIMULATION_CONFIG.crewmates.engineer,
        initialize: () => { history.push('/'); },
        coachmarks: getConstructBuildingCoachmarks(Building.IDS.SHIPYARD),
        enabledActions: {
          PlanBuilding: !!selectedLotIsMine && !shipyardLot,
          [`SelectSitePlan:${Building.IDS.SHIPYARD}`]: true,
          Construct: selectedLotIsMine && !!selectedLot?.building,
        },
        shouldAdvance: () => {
          return !!Object.values(simulation.lots).find((l) => l.buildingType === Building.IDS.SHIPYARD && l.buildingStatus === Building.CONSTRUCTION_STATUSES.OPERATIONAL);
        }
      },
      {
        title: 'Some Assembly Required',
        content: (
          <>
            Ah, and now we have arrived at it. The penultimate tool that humanity has created, so far: a 
            spaceship. A vehicle capable of breaking free from the gravitational pull of a large body, 
            capable of carrying a human life thousands of kilometers in the soundless vacuum of space, 
            and even capable of landing safely and being reused, again and again. A creation so amazingly 
            complex that, as far as we've seen, we're the only species in the known universe to create it.
          </>
        ),
        crewmateId: SIMULATION_CONFIG.crewmates.engineer,
        rightButton: { children: 'Next', onClick: () => advance(), },
      },
      {
        title: 'Some Assembly Required',
        content: (
          <>
            I stocked your warehouse with everything you'll need to build a Light Transport -- your
            first ship.
            <br/><br/>
            Select your Shipyard and follow the HUD training guides to start the assembly process.
          </>
        ),
        crewmateId: SIMULATION_CONFIG.crewmates.engineer,
        initialize: () => {
          // TODO: should we send these as a packaged p2p transfer?
          const warehouseLotId = Object.keys(simulation.lots).find((lotId) => simulation.lots[lotId].buildingType === Building.IDS.WAREHOUSE);
          dispatchSimulationLotState(warehouseLotId, {
            inventoryContents: {
              ...warehouseLot.inventoryContents,
              2: {
                ...warehouseLot.inventoryContents[2],
                ...Process.TYPES[Process.IDS.LIGHT_TRANSPORT_INTEGRATION].inputs
              }
            }
          });
          // TODO: open warehouse inventory to show?
        },
        coachmarks: ({
          // get to the shipyard lot
          [COACHMARK_IDS.hudMenuMyAssets]: shipyardLot && !actionDialog?.type && selectedLot?.building?.id !== shipyardLot?.buildingId && openHudMenu !== 'MY_ASSETS',
          [COACHMARK_IDS.hudMenuMyAssetsBuilding]: shipyardLot && selectedLot?.building?.id !== shipyardLot?.buildingId ? shipyardLot?.buildingId : null,

          // open dialog and select LT
          [COACHMARK_IDS.actionButtonAssembleShip]: !actionDialog?.type && selectedLot?.building?.id === shipyardLot?.buildingId,
          [COACHMARK_IDS.actionDialogTargetProcess]: actionDialog?.type === 'ASSEMBLE_SHIP' ? Ship.IDS.LIGHT_TRANSPORT : null,
        }),
        enabledActions: {
          AssembleShip: selectedLotIsMine && selectedLot?.building?.id === shipyardLot?.buildingId,
          [`SelectProcess:${Ship.IDS.LIGHT_TRANSPORT}`]: true,
          [`SelectInventory:${Entity.IDS.BUILDING}.${warehouseLot?.buildingId}.2`]: true,
        },
        shouldAdvance: () => {
          return !!Object.values(simulation.lots).find((l) => l.shipId);
        }
      },
      {
        title: 'Fuel Up',
        content: (
          <>
            They always save the best for last! I'm Lucinda Natus, and yes, I was the last High Commander 
            of the Arvad, but I'm also a Pilot.
            <br/><br/>
            I don't care what ship it is, where I'm going to, what I'm leaving behind, or how many times 
            I've done it - there is nothing that can compare to flying. Leaving behind the solid ground 
            and going to space, it's awe-inspiring every single time.
          </>
        ),
        crewmateId: SIMULATION_CONFIG.crewmates.pilot,
        rightButton: { children: 'Next', onClick: () => advance(), },
      },
      {
        title: 'Fuel Up',
        content: (
          <>
            Your ship has been delivered to your remaining leased lot. Before we go, let's get this bird 
            ready to fly and your crew stocked for some inter-asteroid travel.
            <br/><br/>
            First, follow the training guides to stock the cargo hold of your ship with
            {' '}{SIMULATION_CONFIG.marketplaceAmounts[Product.IDS.FOOD].toLocaleString()} kg food.
          </>
        ),
        crewmateId: SIMULATION_CONFIG.crewmates.pilot,
        initialize: () => {
          // select ship lot
          const shipLotId = Object.keys(simulation.lots).find((lotId) => !!simulation.lots[lotId]?.shipId);
          dispatchLotSelected(shipLotId);
        },
        coachmarks: {
          [COACHMARK_IDS.hudMenuMarketplaces]: (!locationPath || locationPath === '/'),
          [COACHMARK_IDS.asteroidMarketsHelper]: Product.IDS.FOOD,
          [COACHMARK_IDS.actionDialogTargetInventory]: `${Entity.IDS.SHIP}.${SIMULATION_CONFIG.shipId}.${Ship.TYPES[Ship.IDS.LIGHT_TRANSPORT].cargoSlot}`
        },
        enabledActions: {
          MarketBuy: true,
          [`SelectInventory:${Entity.IDS.SHIP}.${SIMULATION_CONFIG.shipId}.${Ship.TYPES[Ship.IDS.LIGHT_TRANSPORT].cargoSlot}`]: true
        },
        shouldAdvance: () => !!crewHasFood
      },
      {
        title: 'Fuel Up',
        content: `
          Next, let's take advantage of the allowance Mason sent you and fill up the tank. Add
          ${formatResourceMass(SIMULATION_CONFIG.marketplaceAmounts[Product.IDS.HYDROGEN_PROPELLANT], Product.IDS.HYDROGEN_PROPELLANT)}
          of hydrogen propellant to the propellant inventory of your ship by following the training
          guides once more.
        `,
        crewmateId: SIMULATION_CONFIG.crewmates.pilot,
        coachmarks: {
          [COACHMARK_IDS.hudMenuMarketplaces]: (!locationPath || locationPath === '/'),
          [COACHMARK_IDS.asteroidMarketsHelper]: Product.IDS.HYDROGEN_PROPELLANT,
          [COACHMARK_IDS.actionDialogTargetInventory]: `${Entity.IDS.SHIP}.${SIMULATION_CONFIG.shipId}.${Ship.TYPES[Ship.IDS.LIGHT_TRANSPORT].propellantSlot}`
        },
        enabledActions: {
          MarketBuy: true,
          [`SelectInventory:${Entity.IDS.SHIP}.${SIMULATION_CONFIG.shipId}.${Ship.TYPES[Ship.IDS.LIGHT_TRANSPORT].propellantSlot}`]: true
        },
        shouldAdvance: () => !!crewHasPropellant
      },
      {
        title: 'Lift Off',
        content: (
          <>
            Are we forgetting something? Oh right, our crew. We're still sitting nice and warm
            in the Habitat building we started in.
            <br/><br/>
            Select the ship, re-station our team as the piloting crew, and let's launch the ship
            into Adalia Prime's orbit.
          </>
        ),
        crewmateId: SIMULATION_CONFIG.crewmates.pilot,
        initialize: () => { history.push('/'); },
        coachmarks: {
          // select ship lot
          [COACHMARK_IDS.hudMenuMyAssets]: !actionDialog?.type && !(selectedLotIsMine && selectedLot?.surfaceShip) && openHudMenu !== 'MY_ASSETS',
          [COACHMARK_IDS.hudMenuMyAssetsShip]: !actionDialog?.type && !(selectedLotIsMine && selectedLot?.surfaceShip) ? shipLot?.shipId : null,

          // station crew on ship
          // (fast forward)
          // launch to orbit
          // (fast forward)
          [COACHMARK_IDS.actionButtonStationCrew]: !actionDialog?.type && !crewIsOnShip && selectedLotIsMine && selectedLot?.surfaceShip,
          [COACHMARK_IDS.actionButtonLaunchShip]: !actionDialog?.type && crewIsOnShip && selectedLotIsMine && selectedLot?.surfaceShip,
          
          [COACHMARK_IDS.actionDialogTargetLaunchType]: 'propulsive',
          // TODO: (flight crew empty on Ship Tab)
        },
        enabledActions: {
          LaunchShip: crewIsOnShip,
          [`SelectLaunchType:propulsive`]: true,
          StationCrew: !crewIsOnShip,
        },
        shouldAdvance: () => crew?._location?.asteroidId && !crew?._location?.lotId
      },
      {
        title: 'To Infinity',
        content: (
          <>
            Set the asteroid known as "<EntityName label={Entity.IDS.ASTEROID} id={SIMULATION_CONFIG.destinationAsteroidId} />" 
            as our destination in your HUD. The nav system will build a Ballistic Transfer Graph 
            that describes the propellant requirements per the time of departure, length of our journey, 
            and relative orbits of the origin and destination. Lighter areas require less propellant 
            while darker areas require more.
            <br/><br/>
            Pick your preferred travel solution and let's blast off this rock. Don't forget to leave 
            some propellant for the return trip! Who knows when you'll be able to top up those tanks again?
          </>
        ),
        crewmateId: SIMULATION_CONFIG.crewmates.pilot,
        initialize: () => {
          dispatchDestinationSelected(SIMULATION_CONFIG.destinationAsteroidId);
          dispatchSimulationState('canFastForward', false);
        },
        coachmarks: {
          // select ship
          // TODO: don't need these if no lot selected
          // TODO: should use 
          [COACHMARK_IDS.hudCrewLocation]: !['out', 'zooming-out'].includes(zoomStatus) && !actionDialog?.type && currentZoomScene?.shipId !== shipLot?.shipId,

          // plan travel
          [COACHMARK_IDS.actionButtonSelectDestination]: !inTravelMode && !actionDialog?.type,
          [COACHMARK_IDS.destinationAsteroid]: inTravelMode && destination !== SIMULATION_CONFIG.destinationAsteroidId,
          [COACHMARK_IDS.porkchop]: inTravelMode && !travelSolutionIsValid,
          [COACHMARK_IDS.actionButtonSetCourse]: !actionDialog?.type && inTravelMode && travelSolutionIsValid,
        },
        enabledActions: {
          PlanFlight: true,
          SetCourse: travelSolutionIsValid
        },
        shouldAdvance: () => crew?._location && !crew._location?.asteroidId
      },
      {
        title: 'Beyond',
        content: (
          <>
            Freedom. That's one of the reasons that I love flying so much, it gives you freedom.
            <br/><br/>
            I've reviewed your performance, determined that your internship has been successful, 
            and now your last general education requirement is complete.
          </>
        ),
        crewmateId: SIMULATION_CONFIG.crewmates.pilot,
        rightButton: { children: 'Next', onClick: () => advance(), },
      },
      {
        title: 'Beyond',
        content: (
          <>
            You've done well, make sure to come visit me on my asteroid sometime! I gotta tell you, 
            the quiet, the solitude, the freedom that comes with owning your own piece of the belt 
            is wonderful.
            <br/><br/>
            Remember: the future is yours, Adalian, we're all excited to see what you do with it.
          </>
        ),
        crewmateId: SIMULATION_CONFIG.crewmates.pilot,
        rightButton: { children: 'Next', onClick: () => advance(), },
      },
      {
        title: 'Training Simulation Complete',
        content: (
          <>
            You did it, congratulations! You are now officially ready to choose your career 
            class and start your own crew.
            <br /><br />
            Remember: the <a href={`${appConfig.get('Url.wiki')}/en/docs/user-guides`} target="_blank" rel="noopener noreferrer">Wiki</a>
            {' '}and  <a href="https://discord.com/invite/influenceth" target="_blank" rel="noopener noreferrer">Discord</a>
            {' '}are resources that are always available to you when seeking help from your fellow Adalians.
            <br/><br/>
            Good luck {simulation.crewmate?.name}, we're all pulling for you.
          </>
        ),
        crewmateImageOptionString: JSON.stringify({ coll: Crewmate.COLLECTION_IDS.ADALIAN, appearance: simulation.crewmate?.appearance }),
        enabledActions: {
          RedirectToRecruitOnLogin: true
        },
        rightButton: {
          children: 'Begin Your Journey',
          disabled: connecting,
          onClick: () => {
            fireTrackingEvent('simulation', { step: 'login' });
            login(getPrimaryNewPlayerLoginOptions());
            // TODO: add on-logged-in url
          },
        }
      },
    ];
  }, [
    actionDialog,
    connecting,
    crew,
    crewAgreements,
    crewBuildings,
    crewDeposits,
    crewShips,
    currentZoomScene,
    cutscene,
    inTravelMode,
    isLoading,
    locationPath,
    login,
    selectedLot,
    openHudMenu,
    origin,
    selectedResourceId,
    travelSolution,
    travelSolutionIsValid,
    zoomStatus
  ]);

  // cleanse selected step index
  useEffect(() => {
    if (!isLoading) {
      if (simulation.step === undefined || simulation.step < 0) {// || simulation.step > simulationSteps.length - 1) {
        dispatchSimulationStep(0);
      }
    }
  }, [isLoading, simulation?.step, simulationSteps]);

  // load step object from step index
  const previousStep = useRef({});
  const currentStep = useMemo(() => {
    // TODO: use named index instead of numbers
    return isLoading ? previousStep.current : simulationSteps[simulation.step];
  }, [simulationSteps, simulation.step]);
  previousStep.current = currentStep;

  const isFastForwarding = useMemo(
    () => simulation?.canFastForward && (simulation?.crewReadyAt || simulation?.taskReadyAt) > 0,
    [simulation?.canFastForward, simulation?.crewReadyAt, simulation?.taskReadyAt]
  );

  // autoadvance if ready to autoadvance (wait for fastforwarding as necessary)
  useEffect(() => {
    if (currentStep?.shouldAdvance && currentStep.shouldAdvance()) {
      if (!isFastForwarding || !simulation?.canFastForward) {
        advance();
      }
    }
  }, [advance, currentStep, simulation?.canFastForward, isFastForwarding]);

  // if new step, run initialize()
  useEffect(() => {
    if (currentStep?.initialize) {
      currentStep.initialize();
    }
  }, [simulation.step]);

  // dispatch coachmark config
  useEffect(() => {
    let currentCoachmarks = {};
    if (!isFastForwarding) {
      if (currentStep && pendingTransactions.length === 0) {
        if (typeof currentStep.coachmarks === 'function') {
          currentCoachmarks = currentStep.coachmarks() || {};
        } else {
          currentCoachmarks = currentStep.coachmarks || {};
        }
      }
    }
    dispatchCoachmarks(currentCoachmarks);
    return () => {
      dispatchCoachmarks({});
    }
  }, [currentStep?.coachmarks, isFastForwarding, pendingTransactions]);

  // derive and dispatch enabled-action config
  const enabledActions = useMemo(() => {
    if (isFastForwarding) return [];
    return Object.keys(currentStep?.enabledActions || {}).filter((id) => {
      return !!currentStep?.enabledActions[id]
    });
  }, [currentStep?.enabledActions, isFastForwarding]);

  useEffect(() => {
    dispatchSimulationActions(enabledActions);
    return () => {
      dispatchSimulationActions([]);
    }
  }, [enabledActions]);

  return useMemo(() => ({
    currentStepIndex: simulation?.step,
    currentStep,
    isLastStep: simulation?.step === simulationSteps?.length - 1,
    isLoading,
    isTransitioning
  }), [currentStep, isLoading, isTransitioning, simulation?.step])
};

export default useSimulationSteps;
