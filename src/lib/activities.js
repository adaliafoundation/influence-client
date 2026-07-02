import { Address, Building, Delivery, Entity, Lot, Permission, Process, Product, RandomEvent, Ship } from '@influenceth/sdk';
import { AiFillEdit as NameIcon } from 'react-icons/ai';
import { BiTransfer as TransferIcon } from 'react-icons/bi';
import { pick } from 'lodash';

import { appConfig } from '~/appConfig';
import AddressLink from '~/components/AddressLink';
import EntityLink from '~/components/EntityLink';
import {
  ClaimRewardIcon,
  ConstructIcon,
  CoreSampleIcon,
  CrewIcon,
  CrewmateIcon,
  EjectPassengersIcon,
  EmergencyModeEnterIcon,
  EmergencyModeExitIcon,
  EmergencyModeCollectIcon,
  ExtractionIcon,
  FoodIcon,
  ImproveCoreSampleIcon,
  KeysIcon,
  LaunchShipIcon,
  NewCoreSampleIcon,
  PlanBuildingIcon,
  ProductionIcon,
  PromoteIcon,
  PurchaseAsteroidIcon,
  ScanAsteroidIcon,
  ShipIcon,
  StationCrewIcon,
  SurfaceTransferIcon,
  UnplanBuildingIcon,
  SetCourseIcon,
  LimitBuyIcon,
  MarketSellIcon,
  LimitSellIcon,
  MarketBuyIcon,
  BecomeAdminIcon,
  EjectMyCrewIcon,
  SwayIcon,
  LandShipIcon,
  DeconstructIcon
} from '~/components/Icons';
import LotLink from '~/components/LotLink';

import { andList, cleanseTxHash, formatPrice, getProcessorProps, locationsArrToObj, safeEntityId, ucfirst } from './utils';
import api from './api';
import formatters from './formatters';
import EntityName from '~/components/EntityName';
import { formatResourceAmount, formatResourceMass } from '~/game/interface/hud/actionDialogs/components';
import { RandomEventIcon } from '~/components/AnimatedIcons';

const addressMaxWidth = '100px';

const getNamedAddress = (address) => {
  if (Address.areEqual(address, appConfig.get('Starknet.Address.asteroidToken'))) return 'the Asteroid Bridge';
  else if (Address.areEqual(address, appConfig.get('Starknet.Address.crewmateToken'))) return 'the Crewmate Bridge';
}

const getEntityName = (entity) => {
  if (!entity) return '';
  switch (entity.label) {
    case Entity.IDS.CREW: return formatters.crewName(entity);
    case Entity.IDS.CREWMATE: return formatters.crewmateName(entity);
    case Entity.IDS.ASTEROID: return formatters.asteroidName(entity);
    case Entity.IDS.LOT: return formatters.lotName(entity.id);
    case Entity.IDS.BUILDING: return formatters.buildingName(entity);
    case Entity.IDS.SHIP: return formatters.shipName(entity);
    default: return '';
  }
};

const getComponentNames = (entity) => {
  const { id, label, uuid, ...Components } = entity || {};
  return Object.keys(Components).filter((k) => {
    const v = Components[k];
    return v !== null && v !== undefined
      && (!Array.isArray(v) || v?.length > 0)
  });
}

const getApplicablePermissions = (entity) => {
  if (!entity) return [];
  return Object.keys(Permission.TYPES)
    .filter((id) =>Permission.TYPES[id].isApplicable(entity))
    .map((id) => id)
}

const isInFinishAllTx = (tx, txCheck) => tx.key === 'FinishAllReady' && (tx.vars.finishCalls || []).find(txCheck);


// TODO: instead of guessing at what should be invalidated with each event,
//  should we just have a more standard invalidation on ComponentUpdated
//  (that also travels up to lot since lot is an aggregation)
// ... would need to emit these from the server to the relevant crew and asteroid rooms

// TODO: if finishTime, add ActionItems to invalidations? if getActionItem entry?
//  these work for Start event, but not finish, so probably better to do explicitly
//  so the invalidation isn't forgotten

// NOTE: we mostly exclude permissionCrewId here since the permission change
// is what is important to trigger an invalidate; permissionCrewId is mostly
// to represent the logged-in crew, and there isn't much overhead to invalidate
// these queries on all logged-in crews

const getPolicyAndAgreementConfig = (couldAddToCollection = false, invalidateAgreements = false, invalidateSway = false) => {
  return {
    getInvalidations: ({ event: { returnValues } }, { entity = {} }) => {
      const entityId = returnValues.entity ? returnValues.entity : returnValues.target;
      const entityInvalidation = { ...entityId };
      if (couldAddToCollection) {
        const _location = locationsArrToObj(entity?.Location?.locations || []) || {};
        entityInvalidation.newGroupEval = {
          updatedValues: { hasPermission: returnValues.permission },
          filters: {
            asteroidId: _location.asteroidId,
            controllerId: entity?.Control?.controller?.id,
            hasComponent: getComponentNames(entity),
            lotId: _location.lotId,
            status:
              entity?.label === Entity.IDS.SHIP
                ? entity?.Ship?.status
                : (entity?.label === Entity.IDS.BUILDING ? entity?.Building?.status : undefined)
          }
        };
      }

      const invs = [entityInvalidation];
      if (invalidateAgreements) {
        // if (returnValues.permitted?.id) {
        //   invs.push(['agreements', returnValues.permitted.id]);
        //   if (entity?.Control?.controller?.id) {
        //     invs.push(['agreements', entity?.Control?.controller?.id]);
        //   }

        // // if account whitelist, just invalidate all agreements (for all crews)
        // // TODO (maybe): in the future, we potentially separate the queries for agreements and account-agreements
        // //  so could have separate cacheKeys and thus separate invalidations
        // // TODO (maybe): we could also use onBeforeReceived to query and uncover more accurate invalidations, but
        // //  it seems unlikely that would ever be worth the extra queries
        // } else if (returnValues.permitted) {
        //   invs.push(['agreements']);
        // }

        // since there is now just one query to manage user's agreements (as lessor and lessee),
        // just invalidate that whole thing... this may be overkill in the future
        invs.push(['agreements']);
      }

      if (invalidateSway) {
        invs.push(['walletBalance', 'sway' ]);
      }

      return invs;
    },
    getPrepopEntities: ({ event: { returnValues } }) => ({
      entity: returnValues.entity ? returnValues.entity : returnValues.target,
    })
  };
};

// NOTE: activities.getInvalidations should return an array of cache key invalidation configs
// - config of type array will be passed as-is to queryClient.invalidateQueries
// - config of type object is a special "entity" invalidation
//    - id, label are the minimum keys for "entity" invalidation
//    - newGroupEval may also be included... explanation for that structure is
//      included in lib/cacheKey.js

// TODO: write a test to make sure all activities (from sdk) have a config
const activities = {
  AsteroidInitialized: {
    getInvalidations: ({ event: { returnValues } }) => {
      return [{ ...returnValues.asteroid }]
    },
  },

  AsteroidManaged: {
    getInvalidations: ({ event: { returnValues } }) => {
      return [
        {
          ...returnValues.asteroid,
          newGroupEval: {
            updatedValues: { controllerId: returnValues.callerCrew.id }
          }
        },
      ]
    },
    getLogContent: ({ event: { returnValues } }) => ({
      icon: <BecomeAdminIcon />,
      content: (
        <>
          <EntityLink {...returnValues.callerCrew} />
          {' '}granted management rights for <EntityLink {...returnValues.asteroid} />
        </>
      ),
    }),
  },

  AsteroidPurchased: {
    getInvalidations: ({ event: { returnValues } }) => {
      return [
        {
          ...returnValues.asteroid,
          newGroupEval: {
            updatedValues: { owner: returnValues.caller }
          }
        },
        [ 'walletBalance', 'eth' ],
        [ 'walletBalance', 'usdc' ],
      ]
    },
    getLogContent: ({ event: { returnValues } }) => ({
      icon: <PurchaseAsteroidIcon />,
      content: (
        <>
          Asteroid <EntityLink {...returnValues.asteroid} />
          {' '}purchased by <AddressLink address={returnValues.caller} maxWidth={addressMaxWidth} />
        </>
      ),
    }),
    triggerAlert: true
  },

  AsteroidScanned: {
    getInvalidations: ({ event: { returnValues } }) => {
      return [{ ...returnValues.asteroid }]
    },
    getLogContent: ({ event: { returnValues } }) => {
      const entity = { label: Entity.IDS.ASTEROID, id: returnValues.asteroidId };

      return {
        icon: <ScanAsteroidIcon />,
        content: (
          <>
            Long-range surface scan completed on asteroid
            {' '}<EntityLink {...entity} />
          </>
        )
      };
    }
  },

  // TODO: do any of these need invalidations or logs?
  //  ^ or some specialized version of an actionitem
  BridgeFromStarknet: {},
  BridgeToStarknet: {},
  BridgedFromL1: {},
  BridgedToL1: {},

  BuildingRepossessed: {
    // TODO: need to invalidate for the original crew (through asteroid ws?) AND trigger alert for them
    getInvalidations: ({ event: { returnValues } }, { building = {} }) => {
      const _location = locationsArrToObj(building?.locations || []) || {};
      return [
        {
          ...returnValues.building,
          newGroupEval: {
            updatedValues: {
              controllerId: returnValues.callerCrew.id,
              hasPermission: getApplicablePermissions(building || returnValues.building), // new controller may now all relevant permissions
            },
            filters: {
              asteroidId: _location.asteroidId,
              hasComponent: getComponentNames(building),
              lotId: _location.lotId,
              status: building?.Building?.status
            }
          }
        }
      ]
    },

    getPrepopEntities: ({ event: { returnValues } }) => ({
      building: returnValues.building,
    }),

    getLogContent: ({ event: { returnValues } }, viewingAs, { building = {} }) => {
      return {
        icon: <KeysIcon />,
        content: <>Repossessed <EntityLink label={Entity.IDS.LOT} id={building?.Location?.location?.id} /></>
      }
    },
  },

  BuyOrderCancelled: {
    getInvalidations: ({ event: { returnValues } }, { exchange = {} }) => {
      const { asteroidId, lotId } = locationsArrToObj(exchange?.Location?.locations || []) || {};
      return [
        { ...returnValues.exchange },
        { ...returnValues.storage },
        [ 'walletBalance', 'sway' ],
        [ 'orderList', returnValues.exchange.id, returnValues.product ],
        [ 'crewOpenOrders', returnValues.buyerCrew.id ],
        [ 'exchangeOrderSummary', asteroidId, returnValues.product ],
        [ 'inventoryOrders', returnValues.storage?.label, returnValues.storage?.id ],
        [ 'productOrderSummary', Entity.IDS.ASTEROID, asteroidId ],
        [ 'productOrderSummary', Entity.IDS.LOT, lotId ],
      ]
    },

    getPrepopEntities: ({ event: { returnValues } }) => ({
      exchange: returnValues.exchange,
    }),
  },
  BuyOrderCreated: {
    getInvalidations: ({ event: { returnValues } }, { exchange = {} }) => {
      const { asteroidId, lotId } = locationsArrToObj(exchange?.Location?.locations || []) || {};
      return [
        { ...returnValues.exchange },
        { ...returnValues.storage },
        [ 'walletBalance', 'sway' ],
        [ 'orderList', returnValues.exchange.id, returnValues.product ],
        [ 'crewOpenOrders', returnValues.callerCrew.id ],
        [ 'exchangeOrderSummary', asteroidId, returnValues.product ],
        [ 'inventoryOrders', returnValues.storage?.label, returnValues.storage?.id ],
        [ 'productOrderSummary', Entity.IDS.ASTEROID, asteroidId ],
        [ 'productOrderSummary', Entity.IDS.LOT, lotId ],
      ];
    },

    getPrepopEntities: ({ event: { returnValues } }) => ({
      exchange: returnValues.exchange,
    }),

    getBusyItem: ({ event: { returnValues } }) => ({
      icon: <LimitBuyIcon />,
      label: `Place Buy Order`,
    }),

    getVisitedLot: ({}, { exchange = {} }) => {
      const _location = locationsArrToObj(exchange?.Location?.locations || []) || {};
      return _location.lotId;
    },

    requiresCrewTime: true
  },
  BuyOrderFilled: {
    // amount, buyerCrew, caller, callerCrew, exchange, origin, originSlot, price, product, storage, storageSlot
    getInvalidations: ({ event: { returnValues } }, { exchange = {} }) => {
      const { asteroidId, lotId } = locationsArrToObj(exchange?.Location?.locations || []) || {};
      return [
        { ...returnValues.exchange },
        { ...returnValues.origin },
        { ...returnValues.storage },
        [ 'walletBalance', 'sway' ],
        [ 'orderList', returnValues.exchange.id, returnValues.product ],
        [ 'crewOpenOrders', returnValues.buyerCrew.id ],
        [ 'exchangeOrderSummary', asteroidId, returnValues.product ],
        [ 'inventoryOrders', returnValues.storage?.label, returnValues.storage?.id ],
        [ 'productOrderSummary', Entity.IDS.ASTEROID, asteroidId ],
        [ 'productOrderSummary', Entity.IDS.LOT, lotId ],
      ]
    },

    getLogContent: ({ event: { returnValues } }, viewingAs, { exchange = {} }) => {
      // TODO: add marketplace owner? how do they keep track of fees?
      // TODO: is this accounting for fees?
      const payload = (
        <>
          {formatResourceAmount(returnValues.amount, returnValues.product)}{' '}
          {Product.TYPES[returnValues.product]?.name} for{' '}
          {formatPrice(returnValues.amount * returnValues.price / 1e6)} SWAY{' '}
          at <EntityLink {...returnValues.exchange} />
        </>
      );
      if (viewingAs.label === Entity.IDS.CREW && viewingAs.id === returnValues.buyerCrew.id) {
        return {
          icon: <LimitBuyIcon />,
          content: <>Purchased {payload}</>,
        }
      }
      return {
        icon: <MarketSellIcon />,
        content: <>Sold {payload}</>,
      }
    },

    getPrepopEntities: ({ event: { returnValues } }) => ({
      exchange: returnValues.exchange,
    }),

    triggerAlert: true
  },

  ConstructionPlanned: {
    getInvalidations: ({ event: { returnValues } }, { building = {} }) => {
      const extraUpdatedValues = building?.id
        ? {
          hasComponent: getComponentNames(building),
          hasPermission: getApplicablePermissions(building)
        }
        : {};
      return [
        {
          ...returnValues.building,
          newGroupEval: {
            updatedValues: {
              asteroidId: returnValues.asteroid?.id,
              controllerId: returnValues.callerCrew?.id,
              lotId: returnValues.lot?.id,
              status: Building.CONSTRUCTION_STATUSES.PLANNED,
              ...extraUpdatedValues
            }
          }
        }
      ]
    },
    getPrepopEntities: ({ event: { returnValues } }) => ({
      building: returnValues.building,
    }),
    getLogContent: ({ event: { returnValues } }) => ({
      icon: <PlanBuildingIcon />,
      content: (
        <>
          <span>{Building.TYPES[returnValues.buildingType]?.name} site plan created for </span>
          <LotLink lotId={returnValues.lot.id} />
        </>
      ),
    }),
    getBusyItem: ({ event: { returnValues } }, { building = {} }) => ({
      icon: <PlanBuildingIcon />,
      label: `Plan ${Building.TYPES[building?.Building?.buildingType]?.name || 'Building'} Site`,
    }),
    getVisitedLot: ({}, { building = {} }) => {
      const _location = locationsArrToObj(building?.Location?.locations || []) || {};
      return _location.lotId;
    },
    requiresCrewTime: true
  },

  ConstructionAbandoned: {
    getInvalidations: ({ event: { returnValues } }, { building = {} }) => {
      const { asteroidId, lotId } = locationsArrToObj(building?.Location?.locations || []) || {};
      return [
        {
          ...returnValues.building,
          newGroupEval: {
            updatedValues: {
              status: Building.CONSTRUCTION_STATUSES.UNPLANNED
            },
            filters: {
              asteroidId,
              controllerId: returnValues.callerCrew.id,
              hasComponent: getComponentNames(building),
              lotId
            }
          }
        }
      ]
    },
    getLogContent: ({ event: { returnValues } }, viewingAs, { building = {} }) => ({
      icon: <UnplanBuildingIcon />,
      content: (
        <>
          <span>Construction plans abandoned on </span>
          <LotLink lotId={locationsArrToObj(building?.Location?.locations || [])?.lotId} />
        </>
      ),
    }),
    getPrepopEntities: ({ event: { returnValues } }) => ({
      building: returnValues.building,
    }),
  },

  ConstructionStarted: {
    getActionItem: ({ returnValues }, viewingAs, { building = {} }) => {
      const { asteroidId, lotId, lotIndex } = locationsArrToObj(building?.Location?.locations || []) || {};
      return {
        icon: <ConstructIcon />,
        label: `${Building.TYPES[building?.Building?.buildingType]?.name || 'Building'} Construction`,
        asteroidId,
        lotId,
        locationDetail: lotIndex ? formatters.lotName(lotIndex) : undefined,
        onClick: ({ openDialog }) => {
          openDialog('CONSTRUCT');
        }
      };
    },
    getIsActionItemHidden: ({ returnValues }) => (pendingTransactions) => {
      const txCheck = (tx) => tx.key === 'ConstructionFinish' && tx.vars.building.id === returnValues.building.id;
      return pendingTransactions.find((tx) => txCheck(tx) || isInFinishAllTx(tx, txCheck));
    },
    getActionItemFinishCall: (actionItem) => (caller_crew) => ({
      key: 'ConstructionFinish',
      vars: {
        building: actionItem?.event?.returnValues?.building,
        caller_crew
      }
    }),

    getInvalidations: ({ event: { returnValues } }, { building = {} }) => {
      const { asteroidId, lotId } = locationsArrToObj(building?.Location?.locations || []) || {};
      return [
        {
          ...returnValues.building,
          newGroupEval: {
            updatedValues: {
              status: Building.CONSTRUCTION_STATUSES.UNDER_CONSTRUCTION
            },
            filters: {
              asteroidId,
              controllerId: returnValues.callerCrew.id,
              hasComponent: getComponentNames(building),
              lotId
            }
          }
        },
        ['actionItems'],
      ]
    },
    getPrepopEntities: ({ event: { returnValues } }) => ({
      building: returnValues.building,
    }),
    getVisitedLot: ({}, { building = {} }) => {
      const _location = locationsArrToObj(building?.Location?.locations || []) || {};
      return _location.lotId;
    },
    requiresCrewTime: true
  },

  ConstructionFinished: {
    getInvalidations: ({ event: { returnValues } }, { building = {} }) => {
      const { asteroidId, lotId } = locationsArrToObj(building?.Location?.locations || []) || {};
      return [
        {
          ...returnValues.building,
          newGroupEval: {
            updatedValues: {
              status: Building.CONSTRUCTION_STATUSES.OPERATIONAL,
              hasComponent: getComponentNames(building),
              hasPermission: getApplicablePermissions(building)
            },
            filters: {
              asteroidId,
              controllerId: returnValues.callerCrew?.id,
              lotId
            }
          }
        },
        ['actionItems'],
      ];
    },
    getLogContent: ({ event: { returnValues } }, viewingAs, { building = {} }) => {
      return {
        icon: <ConstructIcon />,
        content: (
          <>
            <span>{Building.TYPES[building?.Building?.buildingType]?.name || 'Building'} construction finished on </span>
            <LotLink lotId={locationsArrToObj(building?.Location?.locations || [])?.lotId} />
          </>
        ),
      };
    },
    getPrepopEntities: ({ event: { returnValues } }) => ({
      building: returnValues.building,
    }),
    triggerAlert: true
  },

  ConstructionDeconstructed: {
    getInvalidations: ({ event: { returnValues } }, { building = {} }) => {
      const { asteroidId, lotId } = locationsArrToObj(building?.Location?.locations || []) || {};
      return [
        {
          ...returnValues.building,
          newGroupEval: {
            updatedValues: {
              status: Building.CONSTRUCTION_STATUSES.PLANNED,
              hasComponent: getComponentNames(building),
              hasPermission: getApplicablePermissions(building)
            },
            filters: {
              asteroidId,
              controllerId: returnValues.callerCrew.id,
              lotId
            }
          }
        },
        ['actionItems'],
      ];
    },
    getLogContent: ({ event: { returnValues } }, viewingAs, { building = {} }) => ({
      icon: <DeconstructIcon />,
      content: (
        <>
          <span>{Building.TYPES[building?.Building?.buildingType]?.name || 'Building'} deconstructed on </span>
          <LotLink lotId={locationsArrToObj(building?.Location?.locations || [])?.lotId} />
        </>
      ),
    }),
    getPrepopEntities: ({ event: { returnValues } }) => ({
      building: returnValues.building,
    }),
    getBusyItem: ({ event: { returnValues } }, { building = {} }) => ({
      icon: <DeconstructIcon />,
      label: `Deconstruct ${Building.TYPES[building?.Building?.buildingType]?.name || 'Building'}`,
    }),
    getVisitedLot: ({}, { building = {} }) => {
      const _location = locationsArrToObj(building?.Location?.locations || []) || {};
      return _location.lotId;
    },
    requiresCrewTime: true
  },

  CrewDelegated: {
    getInvalidations: ({ event: { returnValues } }) => {
      return [
        {
          ...returnValues.crew,
          newGroupEval: {
            updatedValues: { owner: returnValues.delegatedTo }
          }
        },
        // must invalidate crew agreements here to catch WhitelistAccountAgreements
        ['agreements', returnValues.crew?.id]
      ]
    },
    getLogContent: ({ event: { returnValues } }) => ({
      icon: <CrewIcon />,
      content: (
        <>
          <EntityLink {...returnValues.crew} />
          {' '}delegated to <AddressLink address={returnValues.delegatedTo} maxWidth={addressMaxWidth} />
        </>
      ),
    }),
    triggerAlert: true
  },

  CrewmatePurchased: {
    getInvalidations: ({ event: { returnValues } }) => {
      return [
        {
          ...returnValues.crewmate,
          newGroupEval: {
            updatedValues: { owner: returnValues.caller }
          }
        },
        [ 'walletBalance' ],  // eth, usdc, sway (in case purchased directly or through starter pack)
      ]
    },
    getLogContent: ({ event: { returnValues } }) => ({
      icon: <CrewmateIcon />,
      content: (
        <>
          <EntityLink {...returnValues.crewmate} /> purchased by
          {' '}<AddressLink address={returnValues.caller} maxWidth={addressMaxWidth} />
        </>
      ),
    }),
    triggerAlert: true
  },

  CrewmateRecruited: {
    getInvalidations: ({ event: { returnValues } }, { crew = {} }) => {
      return [
        {
          ...returnValues.crewmate,
          // (this crewmate may or may not have already existed as a credit)
          newGroupEval: {
            updatedValues: { owner: returnValues.caller }
          },
        },
        // crew roster (+- entirely new crew)
        {
          ...returnValues.callerCrew,
          newGroupEval: crew?.Crew?.roster?.length <= 1  // if roster length of 0/1, assume crew is new
            ? {
              updatedValues: {
                owner: crew?.Crew?.delegatedTo || returnValues.caller,
                stationUuid: safeEntityId(returnValues.station)?.uuid
              }
            }
            : undefined
        },
        { ...returnValues.station }, // station population
      ];
    },
    // v0 and v1 are the same content
    getLogContent: ({ event: { returnValues, version } }) => ({
      icon: <CrewmateIcon />,
      content: (
        <>
          <EntityLink {...returnValues.crewmate} /> recruited to
          {' '}<EntityLink {...returnValues.callerCrew} />
        </>
      ),
    }),

    getPrepopEntities: ({ event: { returnValues } }) => ({
      crew: returnValues.callerCrew,
    }),

    triggerAlert: true
  },

  CrewmatesArranged: {
    getInvalidations: ({ event: { returnValues } }) => ([
      { ...returnValues.callerCrew }
    ]),
    getLogContent: ({ event: { returnValues, version } }, viewingAs = {}) => {
      if (version === 0) {
        // v0 does not have oldCrew included, so this is presumptive and potentially inaccurate
        const newCaptain = returnValues.composition?.[0];
        if (!newCaptain) return null;
        return {
          icon: <PromoteIcon />,
          content: (
            <>
              <EntityLink label={Entity.IDS.CREWMATE} id={newCaptain} />
              {' '}promoted to Captain of <EntityLink {...returnValues.callerCrew} />
            </>
          ),
        };
      }

      // v1: ...
      const newCaptain = returnValues.compositionNew[0];
      const oldCaptain = returnValues.compositionOld[0];

      // if captain changed
      if (newCaptain !== oldCaptain) {

        // if viewingAs crew or new captain, show promotion
        if (newCaptain && (viewingAs.label === Entity.IDS.CREW || (viewingAs.label === Entity.IDS.CREWMATE && viewingAs.id === newCaptain))) {
          return {
            icon: <PromoteIcon />,
            content: (
              <>
                <EntityLink label={Entity.IDS.CREWMATE} id={newCaptain} />
                {' '}promoted to Captain of <EntityLink {...returnValues.callerCrew} />
              </>
            ),
          };

        // else if viewingAs crew or old captain, show promotion
        } else if (oldCaptain && (viewingAs.label === Entity.IDS.CREW || (viewingAs.label === Entity.IDS.CREWMATE && viewingAs.id === oldCaptain))) {
          return {
            icon: <CrewmateIcon />,
            content: (
              <>
                <EntityLink label={Entity.IDS.CREWMATE} id={newCaptain} />
                {' '}relieved of command of <EntityLink {...returnValues.callerCrew} />
              </>
            ),
          };
        }
      }
      return null;
    }
  },

  CrewmatesExchanged: {
    getInvalidations: ({ event: { returnValues } }) => ([
      { ...returnValues.crew1 },
      {
        ...returnValues.crew2,
        // in case created new crew:
        newGroupEval: {
          updatedValues: { owner: returnValues.caller }
        }
      },
    ]),
    getLogContent: ({ event: { returnValues } }, viewingAs = {}) => {
      const crew1CompositionOld = returnValues.crew1CompositionOld.map(({ id }) => id);
      const crew2CompositionOld = returnValues.crew2CompositionOld.map(({ id }) => id);
      const crew1CompositionNew = returnValues.crew1CompositionNew.map(({ id }) => id);
      const crew2CompositionNew = returnValues.crew2CompositionNew.map(({ id }) => id);

      const to1 = crew1CompositionNew.filter((id) => crew2CompositionOld.includes(id));
      const to2 = crew2CompositionNew.filter((id) => crew1CompositionOld.includes(id));

      if (viewingAs.label === Entity.IDS.CREW) {
        // this tx theoretically should have been blocked by UI, but just in case... this will avoid empty logs
        if (to1.length === 0 && to2.length === 0) return null;

        const toCrew = viewingAs.id === returnValues.crew1.id ? returnValues.crew1 : returnValues.crew2;
        const fromCrew = viewingAs.id === returnValues.crew1.id ? returnValues.crew2 : returnValues.crew1;
        const toList = viewingAs.id === returnValues.crew1.id ? to1 : to2;
        const fromList = viewingAs.id === returnValues.crew1.id ? to2 : to1;
        return {
          icon: <CrewIcon />,
          content: (
            <>
              {toList.length > 0 && fromList.length > 0 && (
                <>
                  {andList(toList.map((id) => <EntityLink key={id} label={Entity.IDS.CREWMATE} id={id} />))}
                  {' '}recruited from <EntityLink {...fromCrew} /> in exchange for
                  {' '}{andList(fromList.map((id) => <EntityLink key={id} label={Entity.IDS.CREWMATE} id={id} />))}
                </>
              )}
              {toList.length > 0 && fromList.length === 0 && (
                <>
                  {andList(toList.map((id) => <EntityLink key={id} label={Entity.IDS.CREWMATE} id={id} />))}
                  {' '}transferred from <EntityLink {...fromCrew} />{' '}
                  {' '}to <EntityLink {...toCrew} />
                </>
              )}
              {fromList.length > 0 && toList.length === 0 && (
                <>
                  {andList(fromList.map((id) => <EntityLink key={id} label={Entity.IDS.CREWMATE} id={id} />))}
                  {' '}transferred from <EntityLink {...toCrew} />
                  {' '}to <EntityLink {...fromCrew} />
                </>
              )}
            </>
          ),
        };

      } else if (viewingAs.label === Entity.IDS.CREWMATE) {
        const wasCaptain = viewingAs.id === crew1CompositionOld[0] ? 'crew1' : (viewingAs.id === crew2CompositionOld[0] ? 'crew2' : '');
        const isCaptain = viewingAs.id === crew1CompositionNew[0] ? 'crew1' : (viewingAs.id === crew2CompositionNew[0] ? 'crew2' : '');
        const wasCrew = crew1CompositionOld.includes(viewingAs.id) ? 'crew1' : 'crew2';
        const isCrew = crew1CompositionNew.includes(viewingAs.id) ? 'crew1' : 'crew2';

        if (isCaptain && isCaptain !== wasCaptain) {
          return {
            icon: <PromoteIcon />,
            content: (
              <>
                <EntityLink label={Entity.IDS.CREWMATE} id={viewingAs.id} />
                {isCrew !== wasCrew && <>{' '}transferred from <EntityLink {...returnValues[wasCrew]} /> and</>}
                {' '}promoted to Captain of <EntityLink {...returnValues[isCaptain]} />
              </>
            )
          };
        } else if (wasCaptain && isCaptain !== wasCaptain) {
          return {
            icon: <CrewIcon />,
            content: (
              <>
                <EntityLink label={Entity.IDS.CREWMATE} id={viewingAs.id} />
                {' '}relieved of command of <EntityLink {...returnValues[wasCaptain]} />
                {isCrew !== wasCrew && <>{' '}and transferred to <EntityLink {...returnValues[isCrew]} /></>}
              </>
            )
          };
        } else if (isCrew !== wasCrew) {
          return {
            icon: <CrewIcon />,
            content: (
              <>
                <EntityLink label={Entity.IDS.CREWMATE} id={viewingAs.id} /> transferred
                {' '}from <EntityLink {...returnValues[wasCrew]} />
                {' '}to <EntityLink {...returnValues[isCrew]} />
              </>
            )
          };
        }
      }
      return null;
    }
  },

  CrewEjected: {
    // This is for crew ejection from a ship in transit
    getActionItem: (_, viewingAs, { ejectedCrew = {}}) => {
      return {
        icon: <SetCourseIcon />,
        label: `In Flight`,
        asteroidId: ejectedCrew.Ship?.transitDestination?.id,
        locationDetail: getEntityName(ejectedCrew.Ship?.transitOrigin),
        onClick: ({ openDialog }) => {
          openDialog('SET_COURSE');
        }
      };
    },

    getIsActionItemHidden: ({ returnValues }) => (pendingTransactions) => {
      const txCheck = (tx) => tx.key === 'TransitBetweenFinish';
      return pendingTransactions.find((tx) => txCheck(tx) || isInFinishAllTx(tx, txCheck));
    },

    getActionItemFinishCall: (actionItem) => (caller_crew) => ({
      key: 'TransitBetweenFinish',
      vars: { caller_crew }
    }),

    getPrepopEntities: ({ event: { returnValues } }) => ({
      ejectedCrew: returnValues.ejectedCrew
    }),

    getInvalidations: ({ event: { returnValues } }) => ([
      {
        ...returnValues.ejectedCrew,
        newGroupEval: {
          updatedValues: {
            stationUuid: safeEntityId(returnValues.ejectedCrew)?.uuid // new station is crew's escape module
          }
        }
      },
      { ...returnValues.station }
    ]),

    getLogContent: ({ event: { returnValues } }, { viewingAs }) => {
      const selfEjection = returnValues.ejectedCrew.id === returnValues.callerCrew.id;
      return {
        icon: selfEjection ? <EjectMyCrewIcon /> : <EjectPassengersIcon />,
        content: (
          <>
          <EntityLink {...returnValues.ejectedCrew} />
          {selfEjection ? ' self-ejected' : ' force-ejected'}
          {' '}from <EntityLink {...returnValues.station} />
          {selfEjection ? '' : <>{' '}by <EntityLink {...returnValues.callerCrew} /></>}
        </>
        ),
      };
    },

    getBusyItem: ({ event: { returnValues } }) => ({
      icon: <EjectMyCrewIcon />,
      label: `Eject Crew`,
    }),
    getVisitedLot: ({}, { building = {} }) => {
      // TODO: ...?
      return null;
    },
    requiresCrewTime: true
  },

  CrewStationed: {
    getInvalidations: ({ event: { returnValues } }) => ([
      {
        ...returnValues.callerCrew,
        newGroupEval: {
          updatedValues: { stationUuid: safeEntityId(returnValues.station)?.uuid }
        }
      },
      returnValues.station ? { ...returnValues.station } : null, // v0
      returnValues.originStation ? { ...returnValues.originStation } : null, // v1
      returnValues.destinationStation ? { ...returnValues.destinationStation } : null, // v1
    ]),

    getPrepopEntities: ({ event: { returnValues } }) => ({
      originStation: returnValues.originStation
    }),

    getLogContent: ({ event: { returnValues } }) => {
      return {
        icon: <StationCrewIcon />,
        content: (
          <>
          <EntityLink {...returnValues.callerCrew} />
          {' '}stationed in <EntityLink {...(returnValues.destinationStation || returnValues.station)} />
        </>
        ),
      };
    },

    getBusyItem: ({ event: { returnValues } }) => ({
      icon: <StationCrewIcon />,
      label: `Restation Crew`,
    }),
    getVisitedLot: ({}, { originStation = {} }) => {
      const _location = locationsArrToObj(originStation?.Location?.locations || []) || {};
      return _location.lotId;
    },
    requiresCrewTime: true
  },

  DeliveryCancelled: {
    getInvalidations: ({ event: { returnValues, version } }) => ([
      { ...returnValues.delivery },
      { ...returnValues.origin },
      ['actionItems']
    ]),
  },
  DeliveryPackaged: {
    getActionItem: ({ returnValues }, viewingAs, { destination = {} }) => {
      const _location = locationsArrToObj(destination?.Location?.locations || []);
      return {
        icon: <SurfaceTransferIcon />,
        label: `${destination?.Control?.controller?.id === viewingAs?.id ? 'Incoming' : 'Outgoing'} Transfer Proposal`,
        asteroidId: _location.asteroidId,
        lotId: _location.lotId,
        locationDetail: getEntityName(destination),
        onClick: ({ openDialog }) => {
          openDialog('SURFACE_TRANSFER', { deliveryId: returnValues.delivery.id });
        }
      };
    },
    getIsActionItemHidden: ({ returnValues }) => (pendingTransactions) => {
      return pendingTransactions.find((tx) => (
        (tx.key === 'AcceptDelivery' || tx.key === 'CancelDelivery')
        && tx.vars.delivery.id === returnValues.delivery.id
      ))
    },

    getInvalidations: ({ event: { returnValues, version } }) => ([
      {
        ...returnValues.delivery,
        newGroupEval: {
          updatedValues: {
            origin: returnValues.origin,
            destination: returnValues.dest,
            status: Delivery.STATUSES.PACKAGED
          }
        }
      },
      { ...returnValues.origin },
      ['actionItems']
    ]),

    getPrepopEntities: ({ event: { returnValues } }) => ({
      destination: returnValues.dest,
      origin: returnValues.origin,
    }),

    // getLogContent: ({ event: { returnValues } }, viewingAs, { destination = {} }) => {
    //   const _location = locationsArrToObj(destination?.Location?.locations || []);
    //   return {
    //     icon: <SurfaceTransferIcon />,
    //     content: (
    //       <>
    //         <span>Delivery proposed to </span>
    //         <EntityLink {...returnValues.dest} />
    //         {_location.lotId && <>at<LotLink lotId={_location.lotId} /></>}
    //       </>
    //     ),
    //   };
    // },

    // requiresCrewTime: true
  },

  DeliveryReceived: {
    getInvalidations: ({ event: { returnValues } }) => ([
      {
        ...returnValues.delivery,
        newGroupEval: {
          updatedValues: {
            status: Delivery.STATUSES.COMPLETE
          },
          filters: {
            destination: returnValues.dest,
            origin: returnValues.origin
          }
        }
      },
      { ...returnValues.origin },
      { ...returnValues.dest },
      ['actionItems']
    ]),
    getLogContent: ({ event: { returnValues } }) => {
      return {
        icon: <SurfaceTransferIcon />,
        content: (
          <>
            <span>Delivery completed to </span> <EntityLink {...returnValues.dest} />
          </>
        ),
      };
    },
    triggerAlert: true
  },

  DeliverySent: {
    getActionItem: ({ returnValues }, viewingAs, { destination = {} }) => {
      const _location = locationsArrToObj(destination?.Location?.locations || []);
      return {
        icon: <SurfaceTransferIcon />,
        label: 'Surface Transfer',
        asteroidId: _location.asteroidId,
        lotId: _location.lotId,
        locationDetail: getEntityName(destination),
        onClick: ({ openDialog }) => {
          openDialog('SURFACE_TRANSFER', { deliveryId: returnValues.delivery.id });
        }
      };
    },
    getIsActionItemHidden: ({ returnValues }) => (pendingTransactions) => {
      const txCheck = (tx) => tx.key === 'ReceiveDelivery' && tx.vars.delivery.id === returnValues.delivery.id;
      return pendingTransactions.find((tx) => txCheck(tx) || isInFinishAllTx(tx, txCheck));
    },
    getActionItemFinishCall: (actionItem) => (caller_crew) => ({
      key: 'ReceiveDelivery',
      vars: {
        delivery: actionItem?.event?.returnValues?.delivery,
        caller_crew
      }
    }),

    getInvalidations: ({ event: { returnValues, version } }) => ([
      {
        ...returnValues.delivery,
        newGroupEval: {
          updatedValues: {
            origin: returnValues.origin,
            destination: returnValues.dest,
            status: Delivery.STATUSES.SENT
          }
        }
      },
      { ...returnValues.origin },
      { ...returnValues.dest },
      ['actionItems'],
      ['walletBalance', 'sway'] // (in case this was p2p)
    ]),

    getPrepopEntities: ({ event: { returnValues } }) => ({
      destination: returnValues.dest,
      // origin: returnValues.origin,
    }),

    // getLogContent: ({ event: { returnValues } }, viewingAs, { destination = {} }) => {
    //   const _location = locationsArrToObj(destination?.Location?.locations || []);
    //   return {
    //     icon: <SurfaceTransferIcon />,
    //     content: (
    //       <>
    //         <span>Delivery started to </span>
    //         <EntityLink {...returnValues.dest} />
    //         {_location.lotId && <>at<LotLink lotId={_location.lotId} /></>}
    //       </>
    //     ),
    //   };
    // },
  },

  DeliveryDumped: {
    getInvalidations: ({ event: { returnValues, version } }) => ([
      { ...returnValues.origin },
      ['actionItems'],
    ]),
  },

  EmergencyActivated: {
    getInvalidations: ({ event: { returnValues } }) => ([
      { ...returnValues.ship }
    ]),
    getLogContent: ({ event: { returnValues } }) => {
      return {
        icon: <EmergencyModeEnterIcon />,
        content: (
          <>
            <span>
              <EntityName {...returnValues.ship} /> activated Emergency Mode
            </span>
          </>
        ),
      };
    },
    triggerAlert: true
  },
  EmergencyDeactivated: {
    getInvalidations: ({ event: { returnValues } }) => ([
      { ...returnValues.ship }
    ]),
    getLogContent: ({ event: { returnValues } }) => {
      return {
        icon: <EmergencyModeExitIcon />,
        content: (
          <>
            <span>
              <EntityName {...returnValues.ship} /> deactivated Emergency Mode
            </span>
          </>
        ),
      };
    },
    triggerAlert: true
  },
  EmergencyPropellantCollected: {
    getInvalidations: ({ event: { returnValues } }) => ([
      { ...returnValues.ship }
    ]),
    // TODO: log content seems like overkill here?
    getLogContent: ({ event: { returnValues } }) => {
      return {
        icon: <EmergencyModeCollectIcon />,
        content: (
          <>
            <span>
              <EntityName {...returnValues.ship} /> collected {formatResourceMass(returnValues.amount, Product.IDS.HYDROGEN_PROPELLANT)} of Emergency Propellant
            </span>
          </>
        ),
      };
    },
  },

  EventAnnotated: {
    onBeforeReceived: ({ event: { returnValues } }) => async (pendingTransaction) => {
      await api.saveAnnotation({
        annotation: pendingTransaction?.meta?.annotation,
        crewId: returnValues.callerCrew?.id,
        ...returnValues
      });

      return (pendingTransaction?.meta?.entities || []).map(
        (entity) => (['activities', entity.label, entity.id])
      );
    },
    getInvalidations: ({ event: { returnValues } }) => ([
      ['annotations', cleanseTxHash(returnValues.transactionHash), `${returnValues.logIndex}`]
    ])
  },

  DirectMessageSent: {
    onBeforeReceived: ({ event }) => async (pendingTransaction) => {
      await api.saveDirectMessage({
        encryptedMessage: {
          content: pendingTransaction?.meta?.encryptedMessage,
          type: 'DirectMessage',
          version: 1
        },
        recipient: event.returnValues?.recipient,
        event: pick(event, ['transactionHash', 'logIndex'])
      });
    },
    getInvalidations: ({ event: { returnValues } }) => ([
      ['inbox', returnValues.caller],
      ['inbox', returnValues.recipient]
    ])
  },

  RekeyedInbox: {
    getInvalidations: ({ event: { returnValues } }) => ([
      ['user'],
      ['inbox']
    ]),
  },

  ExchangeConfigured: {
    getInvalidations: ({ event: { returnValues } }) => ([
      { ...returnValues.exchange }
    ]),
  },

  FoodSupplied: {
    // TODO: replace lastFed in place
    getInvalidations: ({ event: { returnValues } }) => ([
      { ...returnValues.callerCrew },
      returnValues.origin ? { ...returnValues.origin } : null
    ]),
    getLogContent: ({ event: { returnValues } }, viewingAs) => {
      return {
        icon: <FoodIcon />,
        content: (
          <>
            <span>
              <EntityName {...returnValues.callerCrew} /> resupplied with{' '}
              {formatResourceMass(returnValues.food, Product.IDS.FOOD)} food
            </span>
          </>
        ),
      };
    },
    getBusyItem: ({ event: { returnValues } }) => ({
      icon: <FoodIcon />,
      label: `Resupply Food`,
    }),
    requiresCrewTime: true,
    triggerAlert: true
  },

  ArrivalRewardClaimed: {
    getInvalidations: ({ event: { returnValues } }) => ([
      { ...returnValues.asteroid },
      { ...returnValues.callerCrew },
    ]),
    getLogContent: ({ event: { returnValues } }, viewingAs) => {
      return {
        icon: <ClaimRewardIcon />,
        content: (
          <>
            <span>
              <EntityLink {...returnValues.callerCrew} /> claimed the starter pack for
              {' '}<EntityLink {...returnValues.asteroid} />
            </span>
          </>
        ),
      };
    },
    triggerAlert: true
  },

  PrepareForLaunchRewardClaimed: {
    getInvalidations: ({ event: { returnValues } }) => ([
      { ...returnValues.asteroid },
    ]),
    getLogContent: ({ event: { returnValues } }, viewingAs) => {
      return {
        icon: <ClaimRewardIcon />,
        content: (
          <>
            <span>
              Crewmate credit claimed for
              {' '}<EntityLink {...returnValues.asteroid} />
            </span>
          </>
        ),
      };
    },
    triggerAlert: true
  },

  MaterialProcessingStarted: {
    getActionItem: ({ returnValues }, viewingAs, { building = {} }) => {
      const _location = locationsArrToObj(building?.Location?.locations || []);
      const process = Process.TYPES[returnValues.process];
      const processorProps = getProcessorProps(process?.processorType);
      return {
        icon: processorProps?.icon || <ProductionIcon />,
        label: processorProps?.label || 'Running Process',
        asteroidId: _location.asteroidId,
        lotId: _location.lotId,
        locationDetail: getEntityName(building),
        onClick: ({ openDialog }) => {
          openDialog('PROCESS', { processorSlot: returnValues.processorSlot });
        }
      };
    },
    getIsActionItemHidden: ({ returnValues }) => (pendingTransactions) => {
      const txCheck = (tx) => (
        tx.key === 'ProcessProductsFinish'
        && tx.vars.processor.id === returnValues.processor.id
        && tx.vars.processor_slot === returnValues.processorSlot
      );
      return pendingTransactions.find((tx) => txCheck(tx) || isInFinishAllTx(tx, txCheck));
    },
    getActionItemFinishCall: (actionItem) => (caller_crew) => ({
      key: 'ProcessProductsFinish',
      vars: {
        processor: actionItem?.event?.returnValues?.processor,
        processor_slot: actionItem?.event?.returnValues?.processorSlot,
        caller_crew
      }
    }),

    getInvalidations: ({ event: { returnValues, version } }) => ([
      { ...returnValues.processor },
      { ...returnValues.destination },
      returnValues.origin ? { ...returnValues.origin } : null, // (v1 only)
      ['actionItems']
    ]),

    getPrepopEntities: ({ event: { returnValues } }) => ({
      building: returnValues.processor,
    }),

    // getLogContent: ({ event: { returnValues } }, viewingAs, { building = {} }) => {
    //   const _location = locationsArrToObj(building?.Location?.locations || []);
    //   const process = Process.TYPES[returnValues.process];
    //   const processorProps = getProcessorProps(process?.processorType);
    //   return {
    //     icon: processorProps?.icon || <ProductionIcon />,
    //     content: (
    //       <>
    //         <span>{process?.name || processorProps?.label || 'Process'} started at </span>
    //         <LotLink lotId={_location.lotId} />
    //       </>
    //     ),
    //   };
    // },

    getVisitedLot: ({}, { building = {} }) => {
      const _location = locationsArrToObj(building?.Location?.locations || []) || {};
      return _location.lotId;
    },
    requiresCrewTime: true
  },
  MaterialProcessingFinished: {
    getInvalidations: ({ event: { returnValues, version } }, { building = {} }) => {
      const processor = (building?.Processors || []).find((p) => p.slot === returnValues.processorSlot);
      return [
        { ...returnValues.processor },
        processor?.destination ? { ...processor.destination } : null,
        ['actionItems']
      ];
    },

    getPrepopEntities: ({ event: { returnValues } }) => ({
      // destination: returnValues.destination,
      building: returnValues.processor,
    }),

    getLogContent: ({ event: { returnValues } }, viewingAs, { building = {} }) => {
      const _location = locationsArrToObj(building?.Location?.locations || []);
      const process = Process.TYPES[returnValues.process];
      const processorProps = getProcessorProps(process?.processorType);
      return {
        icon: processorProps?.icon || <ProductionIcon />,
        content: (
          <>
            <span>{process?.name || processorProps?.label || 'Process'} completed at </span>
            <LotLink lotId={_location.lotId} />
          </>
        ),
      };
    },

    triggerAlert: true
  },

  NameChanged: {
    getInvalidations: ({ event: { returnValues } }) => {
      let invalidation;

      if (returnValues.entity) {
        invalidation = returnValues.entity;
      } else if (returnValues.asteroidId) {
        invalidation = { label: Entity.IDS.ASTEROID, id: returnValues.asteroidId };
      } else if (returnValues.crewId) {
        invalidation = { label: Entity.IDS.CREWMATE, id: returnValues.crewId };
      }

      return [
        invalidation,
        ['activities'], // (to update name in already-fetched activities)
        returnValues.asteroidId ? ['watchlist'] : null
      ];
    },
    getLogContent: ({ event: { returnValues } }) => {
      let entity;

      if (returnValues.entity) {
        entity = returnValues.entity;
      } else if (returnValues.asteroidId) {
        entity = { label: Entity.IDS.ASTEROID, id: returnValues.asteroidId };
      } else if (returnValues.crewId) {
        entity = { label: Entity.IDS.CREWMATE, id: returnValues.crewId };
      }

      return {
        icon: <NameIcon />,
        content: (
          <>
            {ucfirst(Entity.TYPES[entity?.label]?.label || '')}
            {' '}<EntityLink {...entity} forceBaseName />
            {' '}re-named to "{returnValues.name || returnValues.newName}"
          </>
        )
      };
    }
    // TODO: prepop as needed (i.e. if building name changed, to update lot)
  },

  RandomEventResolved: {
    getInvalidations: ({ event: { returnValues } }) => ([
      { ...returnValues.callerCrew }, // this is redundant to `requiresCrewTime`
      [ 'walletBalance', 'sway' ],
    ]),

    getLogContent: ({ event: { returnValues } }, viewingAs) => {
      return {
        icon: <RandomEventIcon isPaused />,
        content: (
          <>
            <span><EntityLink {...returnValues.callerCrew} /> completed "{RandomEvent.TYPES[returnValues.randomEvent]?.name || 'Random Event'}"</span>
          </>
        ),
      };
    },

    requiresCrewTime: true, // to reset random event crew data
    triggerAlert: true
  },

  ResourceExtractionStarted: {
    getActionItem: ({ returnValues }, viewingAs, { extractor = {} }) => {
      const _location = locationsArrToObj(extractor?.Location?.locations || []);
      return {
        icon: <ExtractionIcon />,
        label: `${Product.TYPES[returnValues?.resource]?.name || 'Resource'} Extraction`,
        asteroidId: _location.asteroidId,
        lotId: _location.lotId,
        // resourceId: returnValues.resource,
        locationDetail: getEntityName(extractor),
        onClick: ({ openDialog }) => {
          openDialog('EXTRACT_RESOURCE');
        }
      };
    },
    getIsActionItemHidden: ({ returnValues }) => (pendingTransactions) => {
      const txCheck = (tx) => (
        tx.key === 'ExtractResourceFinish'
        && tx.vars.extractor.id === returnValues.extractor.id
        && tx.vars.extractor_slot === returnValues.extractorSlot
      );
      return pendingTransactions.find((tx) => txCheck(tx) || isInFinishAllTx(tx, txCheck));
    },
    getActionItemFinishCall: (actionItem) => (caller_crew) => ({
      key: 'ExtractResourceFinish',
      vars: {
        extractor: actionItem?.event?.returnValues?.extractor,
        extractor_slot: actionItem?.event?.returnValues?.extractorSlot,
        caller_crew
      }
    }),

    getInvalidations: ({ event: { returnValues, version } }, { extractor = {} }) => {
      const { asteroidId, lotId } = locationsArrToObj(extractor?.Location?.locations || []) || {};
      return [
        {
          ...returnValues.deposit,
          newGroupEval: {
            updatedValues: { isDepleted: true }, // optimistic
            filters: {
              asteroidId,
              resourceId: returnValues.resource,
              controllerId: returnValues.callerCrew?.id,
              lotId
            }
          }
        },
        { ...returnValues.extractor },
        { ...returnValues.destination },
        ['actionItems'],
      ];
    },

    getPrepopEntities: ({ event: { returnValues } }) => ({
      // destination: returnValues.destination,
      extractor: returnValues.extractor,
    }),

    // getLogContent: ({ event: { returnValues } }, viewingAs, { extractor = {} }) => {
    //   const _location = locationsArrToObj(extractor?.Location?.locations || []);
    //   return {
    //     icon: <ExtractionIcon />,
    //     content: (
    //       <>
    //         <span>{Product.TYPES[returnValues.resource]?.name || 'Resource'} extraction started at </span>
    //         <LotLink lotId={_location.lotId} />
    //       </>
    //     ),
    //   };
    // },
    getVisitedLot: ({}, { extractor = {} }) => {
      const _location = locationsArrToObj(extractor?.Location?.locations || []) || {};
      return _location.lotId;
    },
    requiresCrewTime: true
  },

  ResourceExtractionFinished: {
    getInvalidations: ({ event: { returnValues, version } }) => {
      return [
        { ...returnValues.extractor },
        { ...returnValues.destination },
        ['actionItems'],
      ];
    },

    getPrepopEntities: ({ event: { returnValues } }) => ({
      // destination: returnValues.destination,
      extractor: returnValues.extractor,
    }),

    getLogContent: ({ event: { returnValues } }, viewingAs, { extractor = {} }) => {
      return {
        icon: <ExtractionIcon />,
        content: (
          <>
            <span>{Product.TYPES[returnValues.resource]?.name || 'Resource'} extraction completed at </span>
            <LotLink lotId={locationsArrToObj(extractor?.Location?.locations || []).lotId} />
          </>
        ),
      };
    },

    triggerAlert: true
  },

  ResourceScanFinished: {
    getInvalidations: ({ event: { returnValues } }) => ([
      { ...returnValues.asteroid },
      ['actionItems'],
      ['watchlist']
    ]),
    getLogContent: ({ event: { returnValues } }) => ({
      icon: <ScanAsteroidIcon />,
      content: (
        <>
          Orbital surface scan completed on asteroid
          {' '}<EntityLink {...returnValues.asteroid} />
        </>
      )
    }),
    triggerAlert: true
  },

  ResourceScanStarted: {
    getActionItem: ({ returnValues }) => ({
      icon: <ScanAsteroidIcon />,
      label: 'Orbital Scan',
      asteroidId: returnValues.asteroid.id,
      onClick: ({ history }) => {
        history.push(`/asteroids/${returnValues.asteroid.id}/resources`);
      }
    }),
    getIsActionItemHidden: ({ returnValues }) => (pendingTransactions) => {
      const txCheck = (tx) => tx.key === 'ScanResourcesFinish' && tx.vars.asteroid.id === returnValues.asteroid.id;
      return pendingTransactions.find((tx) => txCheck(tx) || isInFinishAllTx(tx, txCheck));
    },
    getActionItemFinishCall: (actionItem) => (caller_crew) => ({
      key: 'ScanResourcesFinish',
      vars: {
        asteroid: actionItem?.event?.returnValues?.asteroid,
        caller_crew
      }
    }),

    getInvalidations: ({ event: { returnValues } }) => ([
      { ...returnValues.asteroid },
      ['actionItems'],
      ['watchlist']
    ]),
    // getLogContent: ({ event: { returnValues } }) => ({
    //   icon: <ScanAsteroidIcon />,
    //   content: (
    //     <>
    //       <span>Orbital surface scan initiated on asteroid </span>
    //       <EntityLink {...returnValues.asteroid} />
    //     </>
    //   ),
    // }),
  },

  SamplingDepositFinished: {
    getInvalidations: ({ event: { returnValues } }) => ([
      { ...returnValues.deposit },
      ['actionItems']
    ]),
    getLogContent: (activity, viewingAs, { deposit = {} }) => {
      const _location = locationsArrToObj(deposit?.Location?.locations || []);
      return {
        icon: <CoreSampleIcon />,
        content: (
          <>
            <span>{Product.TYPES[deposit.Deposit?.resource]?.name} core sample analyzed at </span>
            <LotLink lotId={_location.lotId} resourceId={deposit.Deposit?.resource} />
          </>
        ),
      };
    },
    getPrepopEntities: ({ event: { returnValues } }) => ({
      deposit: { label: Entity.IDS.DEPOSIT, id: returnValues.deposit?.id }
    }),
    triggerAlert: true
  },

  SamplingDepositStarted: {
    getActionItem: ({ returnValues }) => ({
      icon: returnValues.improving ? <ImproveCoreSampleIcon /> : <NewCoreSampleIcon />,
      label: `Core ${returnValues.improving ? 'Improvement' : 'Sample'}`,
      asteroidId: Lot.toPosition(returnValues.lot.id)?.asteroidId,
      lotId: returnValues.lot.id,
      resourceId: returnValues.resource,
      locationDetail: Product.TYPES[returnValues.resource].name,
      onClick: ({ openDialog }) => {
        openDialog(
          returnValues.improving ? 'IMPROVE_CORE_SAMPLE' : 'NEW_CORE_SAMPLE',
          { sampleId: returnValues.deposit?.id }
        );
      }
    }),
    getIsActionItemHidden: ({ returnValues }) => (pendingTransactions) => {
      const txCheck = (tx) => tx.key === 'SampleDepositFinish' && tx.vars.deposit.id === returnValues.deposit.id;
      return pendingTransactions.find((tx) => txCheck(tx) || isInFinishAllTx(tx, txCheck));
    },
    getActionItemFinishCall: (actionItem) => (caller_crew) => ({
      key: 'SampleDepositFinish',
      vars: {
        deposit: actionItem?.event?.returnValues?.deposit,
        lot: actionItem?.event?.returnValues?.lot,
        caller_crew
      }
    }),

    getInvalidations: ({ event: { returnValues } }) => ([
      {
        ...returnValues.deposit,
        newGroupEval: {
          updatedValues: {
            asteroidId: Lot.toPosition(returnValues.lot.id)?.asteroidId,
            controllerId: returnValues.callerCrew?.id,
            lotId: returnValues.lot?.id,
            resourceId: returnValues.resource
          }
        }
      },
      returnValues.origin ? { ...returnValues.origin } : null, // source inventory (v1+ only)
      ['actionItems'],
    ]),
    // getLogContent: ({ event: { returnValues } }) => {
    //   return {
    //     icon: returnValues.improving ? <ImproveCoreSampleIcon /> : <NewCoreSampleIcon />,
    //     content: (
    //       <>
    //         <span>{Product.TYPES[e.returnValues.resource]?.name} core sample {returnValues.improving ? 'improvement ' : ' '}started at </span>
    //         <LotLink lotId={e.returnValues.lotId} resourceId={e.returnValues.resource} />
    //       </>
    //     ),
    //   };
    // },
    getVisitedLot: ({ returnValues }) => returnValues.lot?.id,
    requiresCrewTime: true
  },

  SellOrderCancelled: {
    getInvalidations: ({ event: { returnValues } }, { exchange = {} }) => {
      const { asteroidId, lotId } = locationsArrToObj(exchange?.Location?.locations || []) || {};
      return [
        { ...returnValues.exchange },
        { ...returnValues.storage },
        [ 'walletBalance', 'sway' ],
        [ 'orderList', returnValues.exchange.id, returnValues.product ],
        [ 'shoppingOrderList', asteroidId ],  // TODO: should filter by productId (3rd part of cacheKey)
        [ 'crewOpenOrders', returnValues.sellerCrew.id ],
        [ 'exchangeOrderSummary', asteroidId, returnValues.product ],
        [ 'inventoryOrders', returnValues.storage?.label, returnValues.storage?.id ],
        [ 'productOrderSummary', Entity.IDS.ASTEROID, asteroidId ],
        [ 'productOrderSummary', Entity.IDS.LOT, lotId ],
      ];
    },

    getPrepopEntities: ({ event: { returnValues } }) => ({
      exchange: returnValues.exchange,
    })
  },
  SellOrderCreated: {
    getInvalidations: ({ event: { returnValues } }, { exchange = {} }) => {
      const { asteroidId, lotId } = locationsArrToObj(exchange?.Location?.locations || []) || {};
      return [
        { ...returnValues.exchange },
        { ...returnValues.storage },
        [ 'walletBalance', 'sway' ],
        [ 'orderList', returnValues.exchange.id, returnValues.product ],
        [ 'shoppingOrderList', asteroidId ],  // TODO: should filter by productId (3rd part of cacheKey)
        [ 'crewOpenOrders', returnValues.callerCrew.id ],
        [ 'exchangeOrderSummary', asteroidId, returnValues.product ],
        [ 'inventoryOrders', returnValues.storage?.label, returnValues.storage?.id ],
        [ 'productOrderSummary', Entity.IDS.ASTEROID, asteroidId ],
        [ 'productOrderSummary', Entity.IDS.LOT, lotId ],
      ];
    },
    // getLogContent: ({ event: { returnValues } }) => ({}),

    getPrepopEntities: ({ event: { returnValues } }) => ({
      exchange: returnValues.exchange,
    }),

    getBusyItem: ({ event: { returnValues } }) => ({
      icon: <LimitSellIcon />,
      label: `Place Sell Order`,
    }),
    getVisitedLot: ({}, { exchange = {} }) => {
      const _location = locationsArrToObj(exchange?.Location?.locations || []) || {};
      return _location.lotId;
    },
    requiresCrewTime: true
  },

  // this applies ONLY to nfts being sold for sway
  SellOrderSet: {
    getInvalidations: ({ entities, event: { returnValues } }) => {
      // TODO: entities should be coming back from ws now, so should be able to remove the else...
      const [entity] = entities || [];
      return [
        entity ? { ...entity } : { label: Entity.IDS.SHIP, id: returnValues.tokenId }
      ];
    },
  },
  // this applies BOTH to nfts being sold for sway AND marketplace sell orders
  SellOrderFilled: {
    getInvalidations: ({ entities, event: { returnValues } }, { exchange = {} }) => {
      // nft
      if (returnValues.tokenId) {
        // TODO: use entities here? currently just relying on Transfer event to invalidate entity
        return [[ 'walletBalance', 'sway' ]];

      // marketplace
      } else {
        const { asteroidId, lotId } = locationsArrToObj(exchange?.Location?.locations || []) || {};
        return [
          { ...returnValues.exchange },
          { ...returnValues.destination },
          { ...returnValues.storage },
          [ 'walletBalance', 'sway' ],
          [ 'orderList', returnValues.exchange.id, returnValues.product ],
          [ 'shoppingOrderList', asteroidId ],  // TODO: should filter by productId (3rd part of cacheKey)
          [ 'crewOpenOrders', returnValues.sellerCrew.id ],
          [ 'exchangeOrderSummary', asteroidId, returnValues.product ],
          [ 'inventoryOrders', returnValues.storage?.label, returnValues.storage?.id ],
          [ 'productOrderSummary', Entity.IDS.ASTEROID, asteroidId ],
          [ 'productOrderSummary', Entity.IDS.LOT, lotId ],
        ];
      }
    },

    getLogContent: ({ entities, event: { returnValues } }, viewingAs, { exchange = {} }) => {
      // nft
      if (returnValues.tokenId) {
        // TODO: use entities here? currently just relying on Transfer event for log
        return null;

      // marketplace
      } else {

        // TODO: add marketplace owner? how do they keep track of fees?
        // TODO: is this accounting for fees?
        const payload = (
          <>
            {formatResourceAmount(returnValues.amount, returnValues.product)}{' '}
            {Product.TYPES[returnValues.product]?.name} for{' '}
            {formatPrice(returnValues.amount * returnValues.price / 1e6)} SWAY{' '}
            at <EntityLink {...returnValues.exchange} />
          </>
        );
        if (viewingAs.label === Entity.IDS.CREW && viewingAs.id === returnValues.sellerCrew.id) {
          return {
            icon: <LimitSellIcon />,
            content: <>Sold {payload}</>,
          }
        }
        return {
          icon: <MarketBuyIcon />,
          content: <>Purchased {payload}</>,
        }
      }
    },

    getPrepopEntities: ({ event: { returnValues } }) => {
      // nft
      if (returnValues.tokenId) {
        return {};

      // marketplace
      } else {
        return { exchange: returnValues.exchange };
      }
    },

    triggerAlert: true
  },

  ShipAssemblyStarted: {
    getActionItem: ({ returnValues }, viewingAs, { building = {} }) => {
      const _location = locationsArrToObj(building?.Location?.locations || []);
      return {
        icon: <ShipIcon />,
        label: `${Ship.TYPES[returnValues.shipType]?.name || 'Ship'} Assembly`,
        asteroidId: _location.asteroidId,
        lotId: _location.lotId,
        locationDetail: getEntityName(building),
        onClick: ({ openDialog }) => {
          openDialog('ASSEMBLE_SHIP', { dryDockSlot: returnValues.dryDockSlot });
        }
      };
    },
    getIsActionItemHidden: ({ returnValues }) => (pendingTransactions) => {
      return pendingTransactions.find((tx) => (
        tx.key === 'AssembleShipFinish'
        && tx.vars.dry_dock.id === returnValues.dryDock.id
        && tx.vars.dry_dock_slot === returnValues.dryDockSlot
      ))
    },

    getInvalidations: ({ event: { returnValues, version } }, { building = {}, ship = {} }) => {
      const _location = locationsArrToObj(building?.Location?.locations || []);
      return [
        { ...returnValues.dryDock },
        { ...returnValues.origin },
        {
          ...returnValues.ship,
          newGroupEval: {
            updatedValues: {
              asteroidId: _location?.asteroidId,
              controllerId: returnValues.callerCrew?.id,
              hasComponent: getComponentNames(ship),
              hasPermission: getApplicablePermissions(ship || returnValues.ship),
              isOnSurface: true,
              owner: returnValues.caller,
              lotId: _location?.lotId,
              status: Ship.STATUSES.UNDER_CONSTRUCTION
            }
          }
        },
        ['actionItems']
      ];
    },

    getPrepopEntities: ({ event: { returnValues } }) => ({
      building: returnValues.dryDock,
      ship: returnValues.ship,
    }),

    // getLogContent: ({ event: { returnValues } }, viewingAs, { building = {} }) => {
    //   const _location = locationsArrToObj(building?.Location?.locations || []);
    //   return {
    //     icon: <ShipIcon />,
    //     content: (
    //       <>
    //         <span>{Ship.TYPES[returnValues.shipType]?.name || 'Ship'} assembly started at </span>
    //         <LotLink lotId={_location.lotId} />
    //       </>
    //     ),
    //   };
    // },
    getVisitedLot: ({}, { building = {} }) => {
      const _location = locationsArrToObj(building?.Location?.locations || []) || {};
      return _location.lotId;
    },
    requiresCrewTime: true
  },
  ShipAssemblyFinished: {
    getInvalidations: ({ event: { returnValues } }, { destination = {}, ship = {} }) => {
      const lotId = destination?.label === Entity.IDS.LOT ? destination.id : locationsArrToObj(destination?.Location?.locations || [])?.lotId;
      const asteroidId = lotId ? Lot.toPosition(lotId).asteroidId : undefined;
      return [
        { ...returnValues.dryDock },
        { ...returnValues.destination },
        {
          ...returnValues.ship,
          newGroupEval: {
            updatedValues: {
              lotId,
              status: Ship.STATUSES.AVAILABLE,
              hasComponent: getComponentNames(ship),
              hasPermission: getApplicablePermissions(ship || returnValues.ship),
            },
            filters: {
              asteroidId,
              controllerId: returnValues.callerCrew?.id,
              isOnSurface: true
            }
          }
        },
        ['actionItems'],
      ];
    },

    getPrepopEntities: ({ event: { returnValues } }) => ({
      building: returnValues.dryDock,
      destination: returnValues.destination,
      ship: returnValues.ship
    }),

    getLogContent: ({ event: { returnValues } }, viewingAs, { building = {}, destination = {} }) => {
      const _location = locationsArrToObj(building?.Location?.locations || []);
      const _dlocation = locationsArrToObj(destination?.Location?.locations || []);
      return {
        icon: <ShipIcon />,
        content: (
          <>
            <span><EntityLink {...returnValues.ship} /> assembled at </span>
            <span><LotLink lotId={_location.lotId} /> and delivered to <LotLink lotId={_dlocation?.lotId || returnValues.destination?.id} /></span>
          </>
        ),
      };
    },

    triggerAlert: true
  },

  ShipDocked: {
    getInvalidations: ({ event: { returnValues } }, { dock = {} }) => {
      const lotId = dock?.label === Entity.IDS.LOT ? dock.id : locationsArrToObj(dock?.Location?.locations || [])?.lotId;
      const asteroidId = lotId ? Lot.toPosition(lotId).asteroidId : undefined;
      return [
        {
          ...returnValues.ship,
          newGroupEval: {
            updatedValues: {
              lotId,
              isOnSurface: true
            },
            filters: {
              asteroidId,
              controllerId: returnValues.callerCrew?.id,
            }
          }
        },
        { ...returnValues.dock },
        { ...returnValues.callerCrew }, // location change
        // TODO: any others? passenger crews?
      ];
    },
    getPrepopEntities: ({ event: { returnValues } }) => ({
      dock: returnValues.dock
    }),
    getLogContent: ({ event: { returnValues } }) => ({
      icon: <LandShipIcon />,
      content: (
        <>
          <EntityLink {...returnValues.ship} /> docked at <EntityLink {...returnValues.dock} />
        </>
      )
    }),
    getBusyItem: ({ event: { returnValues } }) => ({
      icon: <LandShipIcon />,
      label: `Land Ship`,
    }),
    getVisitedLot: ({}, { dock = {} }) => {
      const _location = locationsArrToObj(dock?.Location?.locations || []) || {};
      return _location.lotId; // TODO: ?
    },
    requiresCrewTime: true, // only true currently if !powered
    triggerAlert: true
  },

  ShipUndocked: {
    getInvalidations: ({ event: { returnValues } }, { dock = {} }) => {
      // dock might be lot or building
      let asteroidId;
      if (dock?.label === Entity.IDS.BUILDING) {
        asteroidId = locationsArrToObj(dock.Location?.locations || []).asteroidId;
      } else {
        asteroidId = Lot.toPosition(dock.id)?.asteroidId;
      }
      return [
        {
          ...returnValues.ship,
          newGroupEval: {
            updatedValues: {
              lotId: 0,
              isOnSurface: false
            },
            filters: {
              asteroidId,
              // controllerId: returnValues.callerCrew?.id // TODO: if ship is evicted, callerCrew does not match
            }
          }
        },
        { ...returnValues.dock },
        { ...returnValues.callerCrew }, // location change
        // TODO: any others? passenger crews?
      ];
    },
    getPrepopEntities: ({ event: { returnValues } }) => ({
      dock: returnValues.dock
    }),
    getLogContent: ({ event: { returnValues } }) => {
      return {
        icon: <LaunchShipIcon />,
        content: (
          <>
            <EntityLink {...returnValues.ship} /> {returnValues.dock.label === Entity.IDS.BUILDING ? 'undocked' : 'launched'} from <EntityLink {...returnValues.dock} />
          </>
        )
      };
    },
    getBusyItem: ({ event: { returnValues } }) => ({
      icon: <LaunchShipIcon />,
      label: `Launch Ship`,
    }),
    // getVisitedLot: ({}, { dock = {} }) => {
    //   const _location = locationsArrToObj(dock?.Location?.locations || []) || {};
    //   return _location.lotId;
    // },
    requiresCrewTime: true, // only true currently if !powered
    triggerAlert: true
  },

  SurfaceScanFinished: {
    getInvalidations: ({ event: { returnValues } }) => ([
      { ...returnValues.asteroid },
      ['actionItems'],
      ['watchlist']
    ]),
    getLogContent: ({ event: { returnValues } }) => ({
      icon: <ScanAsteroidIcon />,
      content: (
        <>
          Long-range surface scan completed on asteroid
          {' '}<EntityLink {...returnValues.asteroid} />
        </>
      )
    }),
    triggerAlert: true
  },

  SurfaceScanStarted: {
    getActionItem: ({ returnValues }) => ({
      icon: <ScanAsteroidIcon />,
      label: 'Long-Range Surface Scan',
      asteroidId: returnValues.asteroid.id,
      onClick: ({ history }) => {
        history.push(`/asteroids/${returnValues.asteroid.id}/resources`);
      }
    }),
    getIsActionItemHidden: ({ returnValues }) => (pendingTransactions) => {
      const txCheck = (tx) => tx.key === 'ScanSurfaceFinish' && tx.vars.asteroid.id === returnValues.asteroid.id;
      return pendingTransactions.find((tx) => txCheck(tx) || isInFinishAllTx(tx, txCheck));
    },
    getActionItemFinishCall: (actionItem) => (caller_crew) => ({
      key: 'ScanSurfaceFinish',
      vars: {
        asteroid: actionItem?.event?.returnValues?.asteroid,
        caller_crew
      }
    }),

    getInvalidations: ({ event: { returnValues } }) => ([
      { ...returnValues.asteroid },
      ['actionItems'],
      ['watchlist']
    ]),
    // getLogContent: ({ event: { returnValues } }) => ({
    //   icon: <ScanAsteroidIcon />,
    //   content: (
    //     <>
    //       <span>Long-range surface scan initiated on asteroid </span>
    //       <EntityLink {...returnValues.asteroid} />
    //     </>
    //   ),
    // }),
  },

  Transfer: {
    getInvalidations: ({ entities, event: { returnValues } }) => {
      const entity = entities?.[0];
      if (!entity?.label) return [];
      return [
        {
          ...entity,
          newGroupEval: {
            updatedValues: {
              owner: returnValues.to,
              hasPermission: getApplicablePermissions(entity) // may not be necessary... probably controller is more relevant
            }
          }
        }
      ];
    },
    getLogContent: ({ entities, event: { returnValues } }) => {
      if (!entities?.[0]?.label) {
        return {
          icon: <TransferIcon />,
          content: <>Transfer complete.</>
        }
      }

      const entity = entities[0];

      if (parseInt(returnValues.from) === 0) {
        return {
          icon: <TransferIcon />,
          content: (
            <>
              {/*ucfirst(Entity.TYPES[entity?.label]?.label || '')*/}
              {' '}<EntityLink {...entity} /> minted to
              {' '}<AddressLink address={returnValues.to} maxWidth={addressMaxWidth} />
            </>
          ),
        };
      }

      let namedFrom = getNamedAddress(returnValues.from);
      let namedTo = getNamedAddress(returnValues.to);
      return {
        icon: <TransferIcon />,
        content: (
          <>
            {ucfirst(Entity.TYPES[entity?.label]?.label || '')}
            {' '}<EntityLink {...entity} /> transferred from
            {' '}{namedFrom || <AddressLink address={returnValues.from} maxWidth={addressMaxWidth} />}
            {' '}to {namedTo || <AddressLink address={returnValues.to} maxWidth={addressMaxWidth} />}
          </>
        ),
      };
    },
    triggerAlert: true
  },

  TransitStarted: {
    getActionItem: ({ returnValues }, viewingAs, { origin = {} }) => {
      return {
        icon: <SetCourseIcon />,
        label: `In Flight`,
        asteroidId: returnValues.destination.id,
        // lotId: _location.lotId,
        locationDetail: getEntityName(origin),
        onClick: ({ openDialog }) => {
          openDialog('SET_COURSE');
        }
      };
    },
    getIsActionItemHidden: ({ returnValues }) => (pendingTransactions) => {
      const txCheck = (tx) => tx.key === 'TransitBetweenFinish';
      return pendingTransactions.find((tx) => txCheck(tx) || isInFinishAllTx(tx, txCheck));
    },
    getActionItemFinishCall: (actionItem) => (caller_crew) => ({
      key: 'TransitBetweenFinish',
      vars: { caller_crew }
    }),

    getInvalidations: ({ event: { returnValues, version } }) => ([
      {
        ...returnValues.ship,
        newGroupEval: {
          updatedValues: { asteroidId: undefined, },
          filters: { controllerId: returnValues.callerCrew?.id }
        }
      },
      { ...returnValues.callerCrew }, // location update
      ['actionItems'],
    ]),

    getPrepopEntities: ({ event: { returnValues } }) => ({
      origin: returnValues.origin,
    }),

    getLogContent: ({ event: { returnValues } }) => {
      return {
        icon: <SetCourseIcon />,
        content: (
          <>
            <EntityLink {...returnValues.callerCrew} />
            <span> set course from </span>
            <EntityLink {...returnValues.origin} />{' to '}<EntityLink {...returnValues.destination} />
          </>
        ),
      };
    },

    requiresCrewTime: true,
    triggerAlert: true
  },

  TransitFinished: {
    getInvalidations: ({ event: { returnValues, version } }) => ([
      {
        ...returnValues.ship,
        newGroupEval: {
          updatedValues: { asteroidId: returnValues.destination.id, },
          filters: {
            controllerId: returnValues.callerCrew?.id
          }
        }
      },
      { ...returnValues.callerCrew }, // location update
      ['actionItems'],
    ]),

    getLogContent: ({ event: { returnValues } }) => {
      return {
        icon: <SetCourseIcon />,
        content: (
          <>
            <EntityLink {...returnValues.callerCrew} />
            <span> entered orbit around </span>
            <EntityLink {...returnValues.destination} />
          </>
        ),
      };
    },

    triggerAlert: true
  },

  ShipCommandeered: {
    getInvalidations: ({ event: { returnValues } }, { ship = {} }) => {
      const _location = locationsArrToObj(ship?.Location?.locations || []) || {};
      return [
        {
          ...returnValues.ship,
          newGroupEval: {
            updatedValues: {
              // TODO: in this case, if was commandeered from self, should technically
              //  not have to invalidate the useWalletShips response, but it will anyway
              controllerId: returnValues.callerCrew?.id,
              hasPermission: getApplicablePermissions(ship || returnValues.ship)
            },
            filters: {
              asteroidId: _location?.asteroidId,
              hasComponent: getComponentNames(ship),
              lotId: _location?.lotId,
              status: ship?.Ship?.status,
            }
          }
        }
      ];
    },
    getPrepopEntities: ({ event: { returnValues } }) => ({
      ship: returnValues.ship,
    }),
    getLogContent: ({ event: { returnValues } }, viewingAs, { ship = {} }) => ({
      icon: <BecomeAdminIcon />,
      content: (
        <>
          <EntityLink {...returnValues.callerCrew} />
          {' '}commandeered {Ship.TYPES[ship?.Ship?.shipType]?.name} <EntityLink {...returnValues.ship} />
        </>
      ),
    }),
  },

  DepositListedForSale: {
    getInvalidations: ({ event: { returnValues } }) => ([
      { ...returnValues.deposit }
    ]),
    getPrepopEntities: ({ event: { returnValues } }) => ({
      deposit: returnValues.deposit,
    }),
    getLogContent: ({ event: { returnValues } }, viewingAs, { deposit = {} }) => ({
      icon: <LimitSellIcon />,
      content: (
        <>
          {Product.TYPES[deposit?.Deposit?.resource]?.name} deposit listed for
          {' '}<SwayIcon />{formatPrice(returnValues.price / 1e6)}
          {' '}at <EntityLink {...deposit?.Location?.location} />
        </>
      ),
    }),
    // TODO: trigger alert to extractor / lot controller?
  },

  DepositUnlistedForSale: {
    getInvalidations: ({ event: { returnValues } }) => ([
      { ...returnValues.deposit }
    ]),
    getPrepopEntities: ({ event: { returnValues } }) => ({
      deposit: returnValues.deposit,
    }),
    getLogContent: ({ event: { returnValues } }, viewingAs, { deposit = {} }) => ({
      icon: <LimitSellIcon />,
      content: (
        <>
          {Product.TYPES[deposit?.Deposit?.resource]?.name} deposit sale cancelled at
          {' '}<EntityLink {...deposit?.Location?.location} />
        </>
      ),
    }),
  },

  DepositPurchased: {
    getInvalidations: ({ event: { returnValues } }, { deposit = {} }) => {
      const _location = locationsArrToObj(deposit?.Location?.locations || []) || {};
      return [
        {
          ...returnValues.deposit,
          newGroupEval: {
            updatedValues: {
              controllerId: returnValues.callerCrew.id
            },
            filters: {
              asteroidId: _location?.asteroidId,
              isDepleted: false,
              resourceId: deposit.Deposit?.resource,
              lotId: _location?.lotId,
            }
          }
        },
        ['walletBalance', 'sway']
      ];
    },
    getPrepopEntities: ({ event: { returnValues } }) => ({
      deposit: returnValues.deposit,
    }),
    getLogContent: ({ event: { returnValues } }, viewingAs, { deposit = {} }) => ({
      icon: <MarketBuyIcon />,
      content: (
        <>
          {Product.TYPES[deposit?.Deposit?.resource]?.name} deposit
          {' '}{(viewingAs?.label === Entity.IDS.CREW && viewingAs?.id === returnValues.sellerCrew?.id) ? 'sold' : 'purchased'} for
          {' '}<SwayIcon />{formatPrice(returnValues.price / 1e6)}
          {' '}at <EntityLink {...deposit?.Location?.location} />
        </>
      ),
    }),
    triggerAlert: true
  },

  // if policy was changed, the only way it resulted this entity
  //  entering a new permissioned collection would be if it became public,
  //  so adding a public policy is handled differently from the others
  AddedToWhitelist: getPolicyAndAgreementConfig(true, true),
  AddedAccountToWhitelist: getPolicyAndAgreementConfig(true, true),
  RemovedFromWhitelist: getPolicyAndAgreementConfig(false, true),
  RemovedAccountFromWhitelist: getPolicyAndAgreementConfig(false, true),
  PublicPolicyAssigned: getPolicyAndAgreementConfig(true),
  PublicPolicyRemoved: getPolicyAndAgreementConfig(),
  ContractPolicyAssigned: getPolicyAndAgreementConfig(),
  ContractPolicyRemoved: getPolicyAndAgreementConfig(),
  PrepaidPolicyAssigned: getPolicyAndAgreementConfig(),
  PrepaidPolicyRemoved: getPolicyAndAgreementConfig(),
  PrepaidMerklePolicyAssigned: getPolicyAndAgreementConfig(),
  PrepaidMerklePolicyRemoved: getPolicyAndAgreementConfig(),
  PrepaidAgreementAuctionConfigured: {
    getInvalidations: ({ event: { returnValues } }) => [{ ...returnValues.asteroid }]
  },
  ComponentUpdated_PrepaidAgreementAuctionSet: {
    getInvalidations: ({ event: { returnValues } }) => [{ ...returnValues.entity }]
  },
  PrepaidAgreementAuctionStarted: {
    getInvalidations: ({ event: { returnValues } }) => [{ ...returnValues.lot }]
  },
  PrepaidAgreementAuctionCancelled: {
    getInvalidations: ({ event: { returnValues } }) => [{ ...returnValues.lot }]
  },
  ComponentUpdated_PrepaidAgreementAuction: {
    getInvalidations: ({ event: { returnValues } }) => [{ ...returnValues.entity }]
  },

  ContractAgreementAccepted: getPolicyAndAgreementConfig(true, true),
  PrepaidMerkleAgreementAccepted: getPolicyAndAgreementConfig(true, true, true),
  PrepaidAgreementAccepted: getPolicyAndAgreementConfig(true, true, true),
  PrepaidAgreementExtended: getPolicyAndAgreementConfig(false, true, true),
  PrepaidAgreementCancelled: getPolicyAndAgreementConfig(false, true, true),
  PrepaidAgreementTransferred: getPolicyAndAgreementConfig(true, true, false),
};

/**
 * Hydration and Prepopulation
 */
export const getHydrationQueryKey = ({ label, id }) => ['entity', label, Number(id)];

export const getAndCacheEntity = async ({ label, id }, queryClient) => {
  const queryKey = getHydrationQueryKey({ id, label });

  let data = queryClient.getQueryData(queryKey);
  if (!data) {
    data = await api.getEntityById({ label, id });
    if (data) queryClient.setQueryData(queryKey, data);
  }
  return data;
};

const prepopping = {};
export const hydrateActivities = async (newActivities, queryClient) => {
  return Promise.allSettled(
    newActivities.map((activity) => {
      const name = activity?.event?.name || activity?.event?.event;
      if (activities[name]?.getPrepopEntities) {
        const entities = activities[name].getPrepopEntities(activity) || {};
        return Promise.allSettled(
          Object.values(entities).filter((x) => !!x).map(({ id, label }) => new Promise((resolve) => {
            const queryKey = getHydrationQueryKey({ id, label });

            // if data is not yet available
            if (!queryClient.getQueryData(queryKey)) {
              const key = queryKey.join('_');
              // and not already prepopping
              if (!prepopping[key]) {
                // prepop it, then resolve
                prepopping[key] = true;
                return api.getEntityById({ label, id })
                  .then((data) => {
                    // console.log({ label, id, data });
                    queryClient.setQueryData(queryKey, data);
                  })
                  .catch((e) => console.warn('Error with activity prepop', queryKey, e))
                  .finally(() => {
                    delete prepopping[key];
                    resolve(); // TODO: should resolve after entire loop
                  });
              }
            }
            // otherwise, go ahead and resolve
            resolve();
          }))
        )
      }
      return null;
    })
  );
};

export const typesWithLogContent = Object.keys(activities).filter((type) => !!activities[type].getLogContent);

export default activities;

// TODO: move toward entity-based cache naming
// ['entity', label, id]
// ['entities', label, query/queryLabel, data ] --> should mutate individual results in above value
//                                                  (and then return a reference to those individual results)
// (...special stuff)
