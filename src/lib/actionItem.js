import { Building, Entity, Lot, Order, Permission, Process, Product, RandomEvent, Ship } from '@influenceth/sdk';
import moment from 'moment';

import { RandomEventIcon } from '~/components/AnimatedIcons';
import {
  ClaimRewardIcon,
  CrewIcon,
  CrewmateIcon,
  DeconstructIcon,
  ExtractionIcon,
  ImproveCoreSampleIcon,
  PlanBuildingIcon,
  PurchaseAsteroidIcon,
  ScanAsteroidIcon,
  OrbitalScanIcon,
  SurfaceTransferIcon,
  ShipIcon,
  BuildingIcon,
  ManageCrewIcon,
  NewCoreSampleIcon,
  UnplanBuildingIcon,
  ConstructIcon,
  ProductionIcon,
  FoodIcon,
  StationCrewIcon,
  LaunchShipIcon,
  LandShipIcon,
  EjectPassengersIcon,
  EmergencyModeEnterIcon,
  EmergencyModeExitIcon,
  EmergencyModeCollectIcon,
  SetCourseIcon,
  MarketplaceBuildingIcon,
  LimitSellIcon,
  MarketBuyIcon,
  LimitBuyIcon,
  MarketSellIcon,
  CancelLimitOrderIcon,
  BecomeAdminIcon,
  AgreementIcon,
  PermissionIcon,
  KeysIcon,
  EjectMyCrewIcon,
  CoreSampleIcon,
  WarningIcon,
  EditIcon,
  CheckCircleIcon,
  StarIcon,
  JettisonCargoIcon,
  InboxIcon,
} from '~/components/Icons';
import formatters from '~/lib/formatters';
import { getProcessorProps, locationsArrToObj, ucfirst } from '~/lib/utils';
import theme, { hexToRGB } from '~/theme';

const formatAsItem = (activity, actionItem = {}) => {
  // console.log('formatAsItem', activity, actionItem);
  const formatted = {
    key: `activity_${activity._id}`,
    type: activity.type,
    icon: null,
    label: '',
    asteroidId: null,
    lotId: null,
    resourceId: null,
    locationDetail: '',
    finishTime: activity.event.returnValues.finishTime || activity.event.timestamp || 0,
    startTime: activity._startTime || activity.event.timestamp || 0,
    ago: (new moment(new Date(1000 * (activity.event.returnValues.finishTime || activity.event.timestamp || 0)))).fromNow(true),
    onClick: null,

    // overwrite with formatted actionItem keys
    ...actionItem,

    // overwrite with preformatted item (i.e. for busyItem case)
    ...(activity._preformatted || {})
  };

  if (formatted?.asteroidId) formatted.asteroidId = Number(formatted.asteroidId);
  if (formatted?.lotId) formatted.lotId = Number(formatted.lotId);
  if (formatted?.resourceId) formatted.resourceId = Number(formatted.resourceId);

  return formatted;
};

const formatAsPlan = (item) => {
  return {
    key: item.key,
    type: item.type,
    _expired: !item.waitingFor,
    icon: <PlanBuildingIcon />,
    label: `${Building.TYPES[item.Building?.buildingType].name || ''} Site`,
    crewId: item.Control?.controller?.id,
    asteroidId: Number((item.Location?.locations || []).find((l) => l.label === Entity.IDS.ASTEROID)?.id),
    lotId: Number((item.Location?.locations || []).find((l) => l.label === Entity.IDS.LOT)?.id),
    resourceId: null,
    locationDetail: '',
    finishTime: item.waitingFor,
    startTime: null,
    onClick: ({ openDialog }) => {
      openDialog('CONSTRUCT');
    }
  };
};

const formatAsAgreement = (item) => {
  return {
    key: item.key,
    type: item.type,
    _expired: !item.waitingFor,
    icon: <WarningIcon />,
    label: Permission.TYPES[item._agreement?.permission]?.name,
    crewId: item.Control?.controller?.id,
    asteroidId: Number((item.Location?.locations || []).find((l) => l.label === Entity.IDS.ASTEROID)?.id),
    lotId: Number(item.label === Entity.IDS.LOT ? item.id : (item.Location?.locations || []).find((l) => l.label === Entity.IDS.LOT)?.id),
    shipId: Number((item.Location?.locations || []).find((l) => l.label === Entity.IDS.SHIP)?.id),
    resourceId: null,
    locationDetail: item.Name?.name || (
      item.label === Entity.IDS.BUILDING ? formatters.buildingName(item) : (
        item.label === Entity.IDS.SHIP ? formatters.shipName(item) : formatters.lotName(item)
      )
    ),
    finishTime: item.waitingFor,
    startTime: null,
    onClick: ({ openDialog }) => {
      openDialog((item._agreement?._isExpired) ? 'FORM_AGREEMENT' : 'EXTEND_AGREEMENT', { 
        entity: { id: item.id, label: item.label }, permission: item._agreement.permission 
      });
    }
  };
};

const formatAsRandomEvent = (item) => {
  return {
    key: item.pendingEvent,
    type: item.type,
    label: RandomEvent.TYPES[item.pendingEvent]?.name || 'Unknown',
    ago: (new moment(new Date(1000 * (item.timestamp || 0)))).fromNow(true),
    onClick: ({ history }) => {
      history.push(`/random-event`)
    }
  };
};

const formatAsTx = (item) => {
  const formatted = {
    key: item.key,
    type: item.type,
    txHash: item.txHash,
    icon: null,
    label: '',
    crewId: null,
    asteroidId: null,
    lotId: null,
    resourceId: null,
    locationDetail: '',
    finishTime: null,
    startTime: null,
    onClick: null,
    _timestamp: item.timestamp // (only used for dismissing failed tx's)
  };

  // TODO: should these all go in lib/activities?
  //  if so, copy in all the deprecated / not-yet-implemented items as well for reference
  const eventName = item.event?.event || item.key;
  switch(eventName) {
    case 'AnnotateEvent': {
      formatted.icon = <EditIcon />;
      formatted.label = `Annotate ${ucfirst(Entity.TYPES[item.meta?.entity?.label]?.label) || 'Event'}`;
      formatted.onClick = ({ history }) => {
        if (item.meta?.entity?.label === Entity.IDS.ASTEROID) {
          history.push(`/asteroids/${item.meta?.entity?.id}`);
        } else if (item.meta?.entity?.label === Entity.IDS.BUILDING) {
          history.push(`/building/${item.meta?.entity?.id}`);
        } else if (item.meta?.entity?.label === Entity.IDS.CREW) {
          history.push(`/crew/${item.meta?.entity?.id}`);
        } else if (item.meta?.entity?.label === Entity.IDS.CREWMATE) {
          history.push(`/crewmate/${item.meta?.entity?.id}`);
        } else if (item.meta?.entity?.label === Entity.IDS.SHIP) {
          history.push(`/ship/${item.meta?.entity?.id}`);
        }
      };
      break;
    }
    case 'ArrangeCrew': {
      formatted.icon = <ManageCrewIcon />;
      formatted.label = 'Manage Crew';
      formatted.onClick = ({ openDialog }) => {
        openDialog('MANAGE_CREW'); // TODO: need crew id?
      };
      break;
    }
    case 'ExchangeCrew': {
      formatted.icon = <ManageCrewIcon />;
      formatted.label = 'Exchange Crew';
      formatted.onClick = ({ openDialog }) => {
        openDialog('MANAGE_CREW'); // TODO: need exchange crew id // TODO: need crew id?
      };
      break;
    }

    case 'ChangeName': {
      if (item.vars.entity.label === Entity.IDS.ASTEROID) {
        formatted.icon = <PurchaseAsteroidIcon />;
        formatted.label = 'Rename Asteroid';
        formatted.asteroidId = item.vars.entity.id;
        formatted.locationDetail = item.vars.name;
        formatted.onClick = ({ history }) => {
          history.push(`/asteroids/${formatted.asteroidId}`);
        };
      }
      if (item.vars.entity.label === Entity.IDS.CREW) {
        formatted.icon = <CrewIcon />;
        formatted.label = 'Rename Crew';
        formatted.locationDetail = item.vars.name;
        formatted.onClick = ({ history }) => {
          history.push(`/crew/${item.vars.entity.id}`);
        };
      }
      if (item.vars.entity.label === Entity.IDS.CREWMATE) {
        formatted.icon = <CrewmateIcon />;
        formatted.label = 'Rename Cremwate';
        formatted.locationDetail = item.vars.name;
        formatted.onClick = ({ history }) => {
          history.push(`/crewmate/${item.vars.entity.id}`);
        };
      }
      if (item.vars.entity.label === Entity.IDS.BUILDING) {
        formatted.icon = <BuildingIcon />;
        formatted.label = 'Rename Building';
        formatted.locationDetail = item.vars.name;
        formatted.onClick = ({ history }) => {
          // TODO: link to lot
        };
      }
      if (item.vars.entity.label === Entity.IDS.SHIP) {
        formatted.icon = <ShipIcon />;
        formatted.label = 'Rename Ship';
        formatted.locationDetail = item.vars.name;
        formatted.onClick = ({ history }) => {
          // TODO: use ship link
        };
      }
      break;
    }

    case 'ConfigureExchange': {
      formatted.icon = <MarketplaceBuildingIcon />;
      formatted.label = 'Configure Marketplace';
      formatted.asteroidId = Lot.toPosition(item.meta?.lotId)?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.onClick = ({ history }) => {
        // TODO: link to (zoomed) lot
      };
      break;
    }

    case 'CreateSellOrder': {
      const { asteroidId } = Lot.toPosition(item.meta?.lotId) || {};
      formatted.icon = <LimitSellIcon />;
      formatted.label = 'Limit Sell';
      formatted.asteroidId = asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.locationDetail = Product.TYPES[item.vars.product]?.name;
      formatted.onClick = ({ openDialog }) => {
        openDialog('MARKETPLACE_ORDER', {
          asteroidId,
          lotId: item.meta?.lotId,
          mode: 'sell',
          type: 'limit',
          resourceId: item.vars.product,
          preselect: {
            limitPrice: item.vars.price / 1e6,
            quantity: item.vars.amount,
            storage: item.vars.storage,
            storageSlot: item.vars.storage_slot
          }
        });
      };
      break;
    }
    case 'CancelSellOrder': {
      const { asteroidId } = Lot.toPosition(item.meta?.lotId) || {};
      formatted.icon = <CancelLimitOrderIcon />;
      formatted.label = 'Cancel Sell Order';
      formatted.asteroidId = asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.locationDetail = Product.TYPES[item.vars.product]?.name;
      formatted.onClick = ({ openDialog }) => {
        openDialog('MARKETPLACE_ORDER', {
          asteroidId,
          lotId: item.meta?.lotId,
          mode: 'sell',
          type: 'limit',
          resourceId: item.vars.product,
          isCancellation: true,
          preselect: {
            limitPrice: item.vars.price / 1e6,
            quantity: item.meta?.amount,
            storage: item.vars.storage,
            storageSlot: item.vars.storage_slot
          }
        });
      };
      break;
    }
    case 'BulkFillSellOrder': {
      const lotId = item.meta?.destinationLotId || item.meta?.exchangeLotId;
      const isShoppingListMode = item.meta?.destinationLotId;
      
      const { asteroidId } = Lot.toPosition(lotId) || {};
      formatted.icon = <MarketBuyIcon />;
      formatted.label = isShoppingListMode ? 'Source Materials' : 'Market Buy';
      formatted.asteroidId = asteroidId;
      formatted.lotId = lotId;
      formatted.locationDetail = Product.TYPES[item.vars[0].product]?.name;
      formatted.onClick = isShoppingListMode
        ? undefined
        : ({ openDialog }) => {
          openDialog('MARKETPLACE_ORDER', {
            asteroidId,
            lotId: item.meta?.lotId,
            mode: 'buy',
            type: 'market',
            resourceId: item.vars[0].product,
            preselect: {
              quantity: item.vars.reduce((acc, o) => acc + o.amount, 0),
              storage: item.vars[0].destination,
              storageSlot: item.vars[0].destination_slot
            }
          });
        };
      break;
    }
    case 'EscrowDepositAndCreateBuyOrder': {
      const { asteroidId } = Lot.toPosition(item.meta?.lotId) || {};
      formatted.icon = <LimitBuyIcon />;
      formatted.label = 'Limit Buy';
      formatted.asteroidId = asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.locationDetail = Product.TYPES[item.vars.product]?.name;
      formatted.onClick = ({ openDialog }) => {
        openDialog('MARKETPLACE_ORDER', {
          asteroidId,
          lotId: item.meta?.lotId,
          mode: 'buy',
          type: 'limit',
          resourceId: item.vars.product,
          preselect: {
            limitPrice: item.vars.price / 1e6,
            quantity: item.vars.amount,
            storage: item.vars.storage,
            storageSlot: item.vars.storage_slot
          }
        });
      };
      break;
    }
    case 'EscrowWithdrawalAndFillBuyOrders': {
      const { asteroidId } = Lot.toPosition(item.meta?.lotId) || {};
      formatted.icon = <MarketSellIcon />;
      formatted.label = item.meta?.isCancellation ? 'Cancel Buy Order' : 'Market Sell';
      formatted.asteroidId = asteroidId;
      formatted.lotId = item.meta?.lotId || item.meta.originLotId;
      formatted.locationDetail = Product.TYPES[item.vars[0].product]?.name;
      formatted.onClick = ({ openDialog }) => {
        if (item.meta?.isCancellation) {
          openDialog('MARKETPLACE_ORDER', {
            asteroidId,
            lotId: item.meta?.lotId,
            mode: 'buy',
            type: 'limit',
            resourceId: item.vars[0].product,
            isCancellation: true,
            cancellationMakerFee: item.vars[0].makerFee * Order.FEE_SCALE,
            preselect: {
              limitPrice: item.vars[0].price / 1e6,
              quantity: item.vars.reduce((acc, o) => acc + o.amount, 0),
              storage: item.vars[0].origin,
              storageSlot: item.vars[0].origin_slot
            }
          });
        } else if (item.meta?.lotId) {
          openDialog('MARKETPLACE_ORDER', {
            asteroidId,
            lotId: item.meta?.lotId,
            mode: 'sell',
            type: 'market',
            resourceId: item.vars[0].product,
            preselect: {
              quantity: item.vars.reduce((acc, o) => acc + o.amount, 0),
              storage: item.vars[0].origin,
              storageSlot: item.vars[0].originSlot
            }
          });
        } else {
          // just passed originLotId, which indicates it was a multisell and panned to the origin
          // (instead of the exchange, as it would do for a typical sell)
        }
      };
      break;
    }

    case 'InitializeAndManageAsteroid':
    case 'ManageAsteroid': {
      formatted.icon = <BecomeAdminIcon />;
      formatted.label = 'Control Asteroid';
      formatted.onClick = ({ openDialog }) => {
        openDialog('CONTROL_ASTEROID'); // TODO: need asteroid id?
      };
      break;
    }

    case 'CommandeerShip': {
      const location = locationsArrToObj(item.vars.ship?.Location?.locations || []);
      formatted.icon = <BecomeAdminIcon />;
      formatted.label = 'Commandeer Ship';
      formatted.asteroidId = location?.asteroidId;
      formatted.lotId = location?.lotId;
      formatted.shipId = location?.shipId;
      formatted.onClick = ({ openDialog }) => {
        openDialog('CONTROL_SHIP', { shipId: item.vars.ship?.id });
      };
      break;
    }

    case 'BulkPurchaseAdalians':
      formatted.icon = <CrewmateIcon />;
      formatted.label = 'Purchase Crewmate Credits';
      formatted.onClick = ({ openLauncher }) => {
        openLauncher('store');
      };
      break;

    case 'RecruitAdalian':
    case 'InitializeArvadian': {
      formatted.icon = <CrewIcon />;
      formatted.label = `Recruit Crewmate`;
      formatted.onClick = ({ history }) => {
        // TODO: could potentially send to station location as well, but this is probably better
        // NOTE: station is not currently set for InitializeArvadian
        if (item.vars.caller_crew?.id && item.vars.station?.id && item.vars.crewmate?.id) {
          history.push(`/recruit/${item.vars.caller_crew.id}/${item.vars.station.id}/${item.vars.crewmate.id}/create`);
        } else {
          history.push(`/crew`);
        }
      };
      break;
    }

    case 'InitializeAndPurchaseAsteroid':
    case 'PurchaseAsteroid': {
      formatted.icon = <PurchaseAsteroidIcon />;
      formatted.label = 'Purchase Asteroid';
      formatted.asteroidId = item.vars.asteroid.id;
      break;
    }

    case 'ResupplyFood':
    case 'ResupplyFoodFromExchange': {
      formatted.icon = <FoodIcon />;
      formatted.label = `Resupply Food`;
      formatted.onClick = ({ openDialog }) => {
        openDialog('FEED_CREW');
      };
      break;
    }

    case 'SampleDepositStart': {
      formatted.icon = <NewCoreSampleIcon />;
      formatted.label = `${Product.TYPES[item.vars.resource]?.name || 'Core'} Sample`;
      formatted.asteroidId = Lot.toPosition(item.vars.lot.id)?.asteroidId;
      formatted.lotId = item.vars.lot.id;
      // formatted.resourceId = item.vars.resource; // not necessarily forcing open resourcemap
      formatted.onClick = ({ openDialog }) => {
        openDialog('NEW_CORE_SAMPLE', {
          preselect: {
            resourceId: item.vars.resource,
            origin: item.vars.origin
          }
        });
      };
      break;
    }
    case 'PurchaseDepositAndImprove':
    case 'SampleDepositImprove': {
      formatted.icon = <ImproveCoreSampleIcon />;
      formatted.label = `${Product.TYPES[item.meta?.resource]?.name || 'Core'} Improvement`;
      formatted.asteroidId = Lot.toPosition(item.meta?.lotId)?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      // formatted.resourceId = item.meta.resource; // not necessarily forcing open resourcemap
      formatted.onClick = ({ openDialog }) => {
        openDialog('IMPROVE_CORE_SAMPLE', { sampleId: item.vars?.deposit?.id });
      };
      break;
    }
    case 'SampleDepositFinish': {
      const isImprovement = !item.meta?.isNew;
      formatted.icon = isImprovement ? <ImproveCoreSampleIcon /> : <NewCoreSampleIcon />;
      formatted.label = `${isImprovement ? 'Optimized ' : ''}Core Analysis`;
      formatted.asteroidId = Lot.toPosition(item.meta?.lotId)?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      // formatted.resourceId = item.vars.resourceId; // not necessarily forcing open resourcemap
      formatted.onClick = ({ openDialog }) => {
        openDialog(
          isImprovement ? 'IMPROVE_CORE_SAMPLE' : 'NEW_CORE_SAMPLE',
          { sampleId: item.vars.deposit.id }
        );
      };
      break;
    }

    case 'ScanResourcesStart': {
      formatted.icon = <OrbitalScanIcon />;
      formatted.label = 'Orbital Scan';
      formatted.asteroidId = item.vars.asteroid?.id;
      formatted.onClick = ({ history }) => {
        history.push(`/asteroids/${formatted.asteroidId}/resources`);
      };
      break;
    }
    case 'ScanResourcesFinish': {
      formatted.icon = <OrbitalScanIcon />;
      formatted.label = 'Retrieve Orbital Scan Results';
      formatted.asteroidId = item.vars.asteroid.id;
      formatted.onClick = ({ history }) => {
        history.push(`/asteroids/${formatted.asteroidId}/resources`);
      };
      break;
    }

    case 'ScanSurfaceStart': {
      formatted.icon = <ScanAsteroidIcon />;
      formatted.label = 'Long-Range Scan';
      formatted.asteroidId = item.vars.asteroid.id;
      formatted.onClick = ({ history }) => {
        history.push(`/asteroids/${formatted.asteroidId}/resources`);
      };
      break;
    }
    case 'ScanSurfaceFinish': {
      formatted.icon = <ScanAsteroidIcon />;
      formatted.label = 'Analyze Scan Results';
      formatted.asteroidId = item.vars.asteroid.id;
      formatted.onClick = ({ history }) => {
        history.push(`/asteroids/${formatted.asteroidId}/resources`);
      };
      break;
    }

    case 'LeaseAndAssembleShipStart': 
    case 'AssembleShipStart': {
      formatted.icon = <ShipIcon />;
      formatted.label = `Assemble ${Ship.TYPES[item.vars.ship_type]?.name || 'Ship'}`;
      formatted.asteroidId = Lot.toPosition(item.meta?.lotId)?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.onClick = ({ openDialog }) => {
        openDialog('ASSEMBLE_SHIP');
      };
      break;
    }

    case 'AssembleShipFinish': {
      formatted.icon = <ShipIcon />;
      formatted.label = `Deliver ${Ship.TYPES[item.meta?.shipType]?.name || 'Ship'}`;
      formatted.asteroidId = Lot.toPosition(item.meta?.lotId)?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.onClick = ({ openDialog }) => {
        openDialog('ASSEMBLE_SHIP');
      };
      break;
    }

    case 'AcceptDelivery': {
      formatted.icon = <SurfaceTransferIcon />;
      formatted.label = 'Accept Transfer';
      formatted.asteroidId = item.meta?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.onClick = ({ openDialog }) => {
        openDialog('SURFACE_TRANSFER', { deliveryId: item.vars.delivery.id });
      };
      break;
    }
    case 'CancelDelivery': {
      formatted.icon = <SurfaceTransferIcon />;
      formatted.label = 'Cancel Transfer';
      formatted.asteroidId = item.meta?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.onClick = ({ openDialog }) => {
        openDialog('SURFACE_TRANSFER', { deliveryId: item.vars.delivery.id });
      };
      break;
    }
    case 'PackageDelivery': {
      formatted.icon = <SurfaceTransferIcon />;
      formatted.label = 'Propose Transfer';
      formatted.asteroidId = item.meta?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.onClick = ({ openDialog }) => {
        openDialog('SURFACE_TRANSFER', { txHash: item.txHash });
      };
      break;
    }
    case 'SendDelivery': {
      formatted.icon = <SurfaceTransferIcon />;
      formatted.label = 'Start Transfer';
      formatted.asteroidId = item.meta?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.onClick = ({ openDialog }) => {
        openDialog('SURFACE_TRANSFER', { txHash: item.txHash });
      };
      break;
    }
    case 'ReceiveDelivery': {
      formatted.icon = <SurfaceTransferIcon />;
      formatted.label = 'Finish Transfer';
      formatted.asteroidId = item.meta?.asteroidId;
      formatted.lotId = item.meta?.lotId;  // after start, link to destination
      formatted.onClick = ({ openDialog }) => {
        openDialog('SURFACE_TRANSFER', { deliveryId: item.vars.delivery.id });
      };
      break;
    }
    case 'DumpDelivery': {
      formatted.icon = <JettisonCargoIcon />;
      formatted.label = 'Jettison Cargo';
      formatted.asteroidId = item.meta?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.onClick = ({ openDialog }) => {
        openDialog('JETTISON_CARGO', { origin: item.vars.origin });
      };
      break;
    }

    case 'ConstructionPlan': {
      formatted.icon = <PlanBuildingIcon />;
      formatted.label = `Plan ${Building.TYPES[item.vars.building_type]?.name || 'Building'} Site`;
      formatted.asteroidId = Lot.toPosition(item.vars.lot.id)?.asteroidId;
      formatted.lotId = item.vars.lot.id;
      formatted.onClick = ({ openDialog }) => {
        // TODO: in case of failure, should link with selected building type
        // (low priority b/c would have to fail and would have to have closed dialog)
        openDialog('PLAN_BUILDING');
      };
      break;
    }
    case 'ConstructionAbandon': {
      formatted.icon = <UnplanBuildingIcon />;
      formatted.label = `Abandon ${Building.TYPES[item.meta?.buildingType]?.name || 'Building'} Plans`;
      formatted.asteroidId = item.meta?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.onClick = ({ openDialog }) => {
        openDialog('UNPLAN_BUILDING');
      };
      break;
    }
    case 'ConstructionStart': {
      formatted.icon = <ConstructIcon />;
      formatted.label = 'Start Construction';
      formatted.asteroidId = item.meta?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.onClick = ({ openDialog }) => {
        openDialog('CONSTRUCT');
      };
      break;
    }
    case 'ConstructionFinish': {
      formatted.icon = <ConstructIcon />;
      formatted.label = 'Finish Construction';
      formatted.asteroidId = item.meta?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.onClick = ({ openDialog }) => {
        openDialog('CONSTRUCT');
      };
      break;
    }
    case 'ConstructionDeconstruct': {
      formatted.icon = <DeconstructIcon />;
      formatted.label = `Deconstruct ${Building.TYPES[item.vars?.buildingType]?.name || 'Building'}`;
      formatted.asteroidId = item.meta?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.onClick = ({ openDialog }) => {
        openDialog('DECONSTRUCT');
      };
      break;
    }

    case 'FlexibleExtractResourceStart':
    case 'ExtractResourceStart': {
      formatted.icon = <ExtractionIcon />;
      formatted.label = `${Product.TYPES[item.meta?.resourceId]?.name || 'Resource'} Extraction`;
      formatted.asteroidId = Lot.toPosition(item.meta?.lotId)?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      // formatted.resourceId = item.meta?.resourceId;
      formatted.onClick = ({ openDialog }) => {
        // TODO: in case of failure, should link with sample preset, destination, slot, and amount selection
        // (low priority b/c would have to fail and would have to have closed dialog)
        openDialog('EXTRACT_RESOURCE');
      };
      break;
    }
    case 'ExtractResourceFinish': {
      formatted.icon = <ExtractionIcon />;
      formatted.label = 'Finish Extraction';
      formatted.asteroidId = Lot.toPosition(item.meta?.lotId)?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.onClick = ({ openDialog }) => {
        openDialog('EXTRACT_RESOURCE');
      };
      break;
    }

    case 'LeaseAndProcessProductsStart':
    case 'ProcessProductsStart': {
      const process = Process.TYPES[item.vars?.process];
      const processorProps = getProcessorProps(process?.processorType);
      formatted.icon = processorProps?.icon || <ProductionIcon />;
      formatted.label = processorProps?.label || 'Start Process';
      formatted.asteroidId = Lot.toPosition(item.meta?.lotId)?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.locationDetail = process?.name;
      formatted.onClick = ({ openDialog }) => {
        openDialog('PROCESS', { processorSlot: item.vars?.processor_slot });
      };
      break;
    }

    case 'ProcessProductsFinish': {
      const process = Process.TYPES[item.meta?.process];
      const processorProps = getProcessorProps(process?.processorType);
      formatted.icon = processorProps?.icon || <ProductionIcon />;
      formatted.label = processorProps?.label || 'Finish Process';
      formatted.asteroidId = Lot.toPosition(item.meta?.lotId)?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.locationDetail = process?.name;
      formatted.onClick = ({ openDialog }) => {
        openDialog('PROCESS', { processorSlot: item.vars?.processorSlot });
      };
      break;
    }

    case 'StationCrew': {
      formatted.icon = <StationCrewIcon />;
      formatted.label = 'Station Crew';
      formatted.asteroidId = Lot.toPosition(item.meta?.destLotId)?.asteroidId;
      formatted.lotId = item.meta?.destLotId;
      if (item.vars.destination.label === Entity.IDS.BUILDING) {
        formatted.buildingId = item.vars.destination.id;
      } else if (item.vars.destination.label === Entity.IDS.SHIP) {
        formatted.shipId = item.vars.destination.id;
      }
      formatted.onClick = ({ openDialog }) => {
        openDialog('STATION_CREW', { destinationEntityId: item.vars.destination });
      };
      break;
    }

    case 'DockShip': {
      formatted.icon = <LandShipIcon />;
      formatted.label = 'Dock on Surface';
      formatted.asteroidId = item.meta?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.shipId = item.meta?.id;
      formatted.onClick = ({ openDialog }) => {
        openDialog('LAND_SHIP', { shipId: item.meta?.shipId });
      };
      break;
    }

    case 'UndockShip': {
      formatted.icon = <LaunchShipIcon />;
      formatted.label = `${item.vars.powered ? 'Launch' : 'Tug'} into Orbit`;
      formatted.asteroidId = item.meta?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.shipId = item.vars.ship.id;
      formatted.onClick = ({ openDialog }) => {
        openDialog('LAUNCH_SHIP', { shipId: item.vars.ship.id });
      };
      break;
    }

    case 'EjectCrew': {
      const isGuests = item.vars.caller_crew.id !== item.vars.ejected_crew.id;
      formatted.icon = isGuests ? <EjectPassengersIcon /> : <EjectMyCrewIcon />;
      formatted.label = `Eject ${isGuests ? '' : 'My'} Crew`;
      formatted.asteroidId = item.meta?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.shipId = item.meta?.shipId;
      formatted.onClick = ({ openDialog }) => {
        openDialog(isGuests ? 'EJECT_GUEST_CREW' : 'EJECT_CREW', { origin: item.meta?.origin });
      };
      break;
    }

    case 'ActivateEmergency': {
      formatted.icon = <EmergencyModeEnterIcon />;
      formatted.label = `Activate Emergency`;
      formatted.asteroidId = item.meta?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.shipId = item.meta?.shipId;
      formatted.onClick = ({ openDialog }) => {
        openDialog('EMERGENCY_MODE_TOGGLE');
      };
      break;
    }

    case 'DeactivateEmergency': {
      formatted.icon = <EmergencyModeExitIcon />;
      formatted.label = `Deactivate Emergency`;
      formatted.asteroidId = item.meta?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.shipId = item.meta?.shipId;
      formatted.onClick = ({ openDialog }) => {
        openDialog('EMERGENCY_MODE_TOGGLE');
      };
      break;
    }

    case 'CollectEmergencyPropellant': {
      formatted.icon = <EmergencyModeCollectIcon />;
      formatted.label = `Collect Propellant`;
      formatted.asteroidId = item.meta?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.shipId = item.meta?.shipId;
      formatted.onClick = ({ openDialog }) => {
        openDialog('EMERGENCY_MODE_COLLECT');
      };
      break;
    }

    case 'InitializeAndStartTransit':
    case 'TransitBetweenStart': {
      formatted.icon = <SetCourseIcon />;
      formatted.label = item.meta?.destination ? `Departure for ${formatters.asteroidName(item.meta?.destination)}` : `Departure Sequence`;
      formatted.asteroidId = item.vars.origin?.id;
      formatted.shipId = item.meta?.shipId;
      formatted.onClick = ({ openDialog }) => {
        openDialog('SET_COURSE');
      };
      break;
    }

    case 'TransitBetweenFinish': {
      formatted.icon = <SetCourseIcon />;
      formatted.label = item.meta?.destination ? `Arrival to ${formatters.asteroidName(item.meta?.destination)}` : `Arrival Sequence`;
      formatted.asteroidId = item.meta?.destination?.id;
      formatted.shipId = item.meta?.shipId;
      formatted.onClick = ({ openDialog }) => {
        openDialog('SET_COURSE');
      };
      break;
    }

    case 'UpdateAllowlists': {
      formatted.icon = <PermissionIcon />;
      formatted.label = 'Update Allowlist';
      formatted.asteroidId = item.meta?.asteroidId || Lot.toPosition(item.meta?.lotId)?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.shipId = item.meta?.shipId;
      // formatted.onClick = () => {};
      break;
    }

    case 'UpdatePolicy':
    case 'UpdatePolicyAndAuctionSettings': {
      formatted.icon = <PermissionIcon />;
      formatted.label = 'Update Permissions';
      formatted.asteroidId = Lot.toPosition(item.meta?.lotId)?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.shipId = item.meta?.shipId;
      // formatted.onClick = () => {};
      break;
    }

    case 'ConfigurePrepaidAuction': {
      formatted.icon = <PermissionIcon />;
      formatted.label = 'Lease Auction Settings';
      break;
    }

    case 'StartPrepaidAgreementAuction': {
      formatted.icon = <AgreementIcon />;
      formatted.label = 'Start Lease Auction';
      formatted.asteroidId = Lot.toPosition(item.meta?.lotId)?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      break;
    }

    case 'CancelPrepaidAgreementAuction': {
      formatted.icon = <AgreementIcon />;
      formatted.label = 'Cancel Lease Auction';
      formatted.asteroidId = Lot.toPosition(item.meta?.lotId)?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      break;
    }

    case 'AcceptContractAgreement': {
      formatted.icon = <PermissionIcon />;
      formatted.label = 'Contract Agreement';
      formatted.asteroidId = Lot.toPosition(item.meta?.lotId)?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.shipId = item.meta?.shipId;
      formatted.onClick = ({ openDialog }) => {
        openDialog(
          'FORM_AGREEMENT',
          { entity: item.vars.target, permission: item.vars.permission }
        );
      };
      break;
    }

    case 'AcceptPrepaidAgreement': {
      formatted.icon = <PermissionIcon />;
      formatted.label = 'Prepaid Lease Agreement';
      formatted.asteroidId = Lot.toPosition(item.meta?.lotId)?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.shipId = item.meta?.shipId;
      formatted.onClick = ({ openDialog }) => {
        openDialog(
          'FORM_AGREEMENT',
          { entity: item.vars.target, permission: item.vars.permission }
        );
      };
      break;
    }

    case 'ExtendPrepaidAgreement': {
      formatted.icon = <PermissionIcon />;
      formatted.label = 'Extend Prepaid Agreement';
      formatted.asteroidId = Lot.toPosition(item.meta?.lotId)?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.shipId = item.meta?.shipId;
      formatted.onClick = ({ openDialog }) => {
        openDialog(
          'FORM_AGREEMENT',
          { entity: item.vars.target, permission: item.vars.permission, isExtension: true }
        );
      };
      break;
    }

    case 'TransferPrepaidAgreement': {
      formatted.icon = <PermissionIcon />;
      formatted.label = 'Transfer Prepaid Agreement';
      formatted.asteroidId = Lot.toPosition(item.meta?.lotId)?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.shipId = item.meta?.shipId;
      formatted.onClick = ({ openDialog }) => {
        openDialog(
          'TRANSFER_AGREEMENT',
          { entity: item.vars.target, permission: item.vars.permission }
        );
      };
      break;
    }

    case 'CancelPrepaidAgreement': {
      formatted.icon = <PermissionIcon />;
      formatted.label = 'Cancel Prepaid Agreement';
      formatted.asteroidId = Lot.toPosition(item.meta?.lotId)?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.shipId = item.meta?.shipId;
      formatted.onClick = ({ openDialog }) => {
        // TODO: ...
      };
      break;
    }

    case 'AcceptPrepaidMerkleAgreement': {
      formatted.icon = <PermissionIcon />;
      formatted.label = 'TODO...';
      formatted.asteroidId = Lot.toPosition(item.meta?.lotId)?.asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.shipId = item.meta?.shipId;
      formatted.onClick = ({ openDialog }) => {
        // TODO: ...
      };
      break;
    }

    case 'ClaimArrivalReward': {
      formatted.icon = <ClaimRewardIcon />;
      formatted.label = 'Claim Starter Pack';
      formatted.asteroidId = item.vars.asteroid.id;
      break;
    }

    case 'ClaimPrepareForLaunchReward': {
      formatted.icon = <ClaimRewardIcon />;
      formatted.label = 'Claim Crewmate Credit';
      formatted.asteroidId = item.vars.asteroid.id;
      break;
    }

    case 'ResolveRandomEvent': {
      formatted.icon = <RandomEventIcon isPaused />;
      formatted.label = `Resolve Random Event`;
      formatted.onClick = ({ history }) => {
        history.push(`/random-event`);
      }
      break;
    }

    case 'RepossessBuilding':
    case 'RepossessBuildingAndCancelAuction': {
      const { asteroidId } = Lot.toPosition(item.meta?.lotId) || {};
      formatted.icon = <KeysIcon />;
      formatted.label = `Repossess Building`;
      formatted.asteroidId = asteroidId;
      formatted.lotId = item.meta?.lotId;
      formatted.onClick = ({ openDialog }) => {
        openDialog('REPO_BUILDING');
      }
      break;
    }

    case 'FillNftSellOrder': {
      const location = locationsArrToObj(item.meta?.entity?.Location?.locations || []);
      const prettyLabel = item.meta?.entity?.label === Entity.IDS.SHIP ? 'Ship' : 'Asset';
      formatted.icon = <ShipIcon />; // TODO: update if support other types
      formatted.label = `Purchase ${prettyLabel}`;
      formatted.asteroidId = location?.asteroidId;
      formatted.lotId = location?.lotId;
      formatted.shipId = location?.shipId;
      break;
    }

    case 'SetNftSellOrder': {
      const location = locationsArrToObj(item.meta?.entity?.Location?.locations || []);
      const prettyLabel = item.meta?.entity?.label === Entity.IDS.SHIP ? 'Ship' : 'Asset';
      formatted.icon = <ShipIcon />; // TODO: update if support other types
      formatted.label = `Update ${prettyLabel} Listing`;
      formatted.asteroidId = location?.asteroidId;
      formatted.lotId = location?.lotId;
      formatted.shipId = location?.shipId;
      break;
    }

    case 'ListDepositForSale':
    case 'UnlistDepositForSale': {
      const location = locationsArrToObj(item.meta?.deposit?.Location?.locations || []);
      formatted.icon = <CoreSampleIcon />;
      formatted.label = `Update Deposit Listing`;
      formatted.asteroidId = location?.asteroidId;
      formatted.lotId = location?.lotId;
      break;
    }

    case 'PurchaseDeposit': {
      const location = locationsArrToObj(item.meta?.deposit?.Location?.locations || []);
      formatted.icon = <CoreSampleIcon />;
      formatted.label = `Purchase Deposit`;
      formatted.asteroidId = location?.asteroidId;
      formatted.lotId = location?.lotId;
      break;
    }

    case 'FinishAllReady': {
      formatted.icon = <CheckCircleIcon />;
      formatted.label = `Finish Multiple Actions`;
      break;
    }

    case 'PurchaseStarterPack': {
      formatted.icon = <StarIcon />;
      formatted.label = `Purchase Starter Pack`;
      break;
    }

    case 'DirectMessage': {
      formatted.icon = <InboxIcon />;
      formatted.label = `Send Direct Message`;
      formatted.onClick = ({ history }) => {
        history.push('/launcher/inbox');
      }
      break;
    }
    
    case 'RekeyInbox': {
      formatted.icon = <InboxIcon />;
      formatted.label = `Configure Inbox`;
      formatted.onClick = ({ history }) => {
        history.push('/launcher/inbox');
      }
      break;
    }

    default:
      console.log('Unhandled ActionItems tx', item);
      break;
  }

  if (formatted?.asteroidId) formatted.asteroidId = Number(formatted.asteroidId);
  if (formatted?.lotId) formatted.lotId = Number(formatted.lotId);
  if (formatted?.resourceId) formatted.resourceId = Number(formatted.resourceId);
  return formatted;
};

export const formatActionItem = (item, actionItem) => {
  try {
    if (item.type === 'pending' || item.type === 'failed') return formatAsTx(item);
    if (item.type === 'randomEvent') return formatAsRandomEvent(item);
    if (item.type === 'plan') return formatAsPlan(item);
    if (item.type === 'agreement') return formatAsAgreement(item);
    return formatAsItem(item, actionItem);
  } catch (e) {
    console.error('Error formatting action item', item, e);
    return null;
  }
}

export const itemColors = {
  pending: hexToRGB(theme.colors.lightPurple),
  failed: '241, 131, 97',
  randomEvent: '232, 211, 117',
  ready: hexToRGB('#00fff0'),
  unready: theme.colors.brightMainRGB,
  unstarted: hexToRGB(theme.colors.sequenceLight),
  plan: hexToRGB(theme.colors.lightOrange),
  agreement: hexToRGB(theme.colors.orange),
  _expired: hexToRGB(theme.colors.red)
};

export const backgroundColors = {
  pending: hexToRGB(theme.colors.backgroundPurple),
  failed: hexToRGB('#7a211c'),
  randomEvent: hexToRGB('#8c8148'),
  ready: hexToRGB('#006962'),
  unready: theme.colors.darkMainRGB,
  unstarted: hexToRGB('#1e558c'),
  plan: hexToRGB(theme.colors.backgroundOrange),
  agreement: hexToRGB(theme.colors.darkOrange),
  _expired: hexToRGB('#7a211c')
};

export const statuses = {
  pending: 'Processing',
  failed: 'Failed',
  randomEvent: 'Event',
  ready: 'Ready',
  unready: 'In Progress',
  unstarted: 'Scheduled',
  plan: 'Staging',
  agreement: 'Lease Expiring',
  _expired: 'Expired'
};
