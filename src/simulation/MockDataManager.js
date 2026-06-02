import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building, Deposit, DryDock, Entity, Extractor, Inventory, Lot, Order, Permission, Processor, Product, Ship } from '@influenceth/sdk';

import useSimulationState from '~/hooks/useSimulationState';
import SIMULATION_CONFIG from './simulationConfig';
import { useEffect, useMemo, useState } from 'react';
import { entitiesCacheKey } from '~/lib/cacheKey';
import { entityToAgreements } from '~/lib/utils';
import { statuses as walletBuildingStatuses } from '~/hooks/useWalletBuildings';

const nowSec = () => Math.floor(Date.now() / 1e3);

const contentsObjToArray = (contentsObj) => {
  return Object.keys(contentsObj || {}).map((product) => ({ product: Number(product), amount: contentsObj[product] }));
}

export const getMockBuildingInventories = (buildingType, buildingStatus, contentsBySlot = {}) => {
  const { siteSlot, siteType } = Building.TYPES[buildingType];

  const inv = [];
  inv.push({
    slot: siteSlot,
    inventoryType: siteType,
    mass: 0,
    reservedMass: 0,
    reservedVolume: 0,
    volume: 0,
    contents: contentsObjToArray(contentsBySlot?.[siteSlot]),
    status: buildingStatus === Building.CONSTRUCTION_STATUSES.PLANNED ? Inventory.STATUSES.AVAILABLE : Inventory.STATUSES.UNAVAILABLE
  });
  if (buildingType === Building.IDS.WAREHOUSE) {
    inv.push({
      slot: 2,
      inventoryType: Inventory.IDS.WAREHOUSE_PRIMARY,
      mass: 0,
      reservedMass: 0,
      reservedVolume: 0,
      volume: 0,
      contents: contentsObjToArray(contentsBySlot?.[2]),
      status: buildingStatus === Building.CONSTRUCTION_STATUSES.OPERATIONAL ? Inventory.STATUSES.AVAILABLE :  Inventory.STATUSES.UNAVAILABLE
    });
  }

  // TODO: it feels inelegant how we are doing this... 
  return inv.map((i) => {
    const [mass, volume] = (i.contents || []).reduce((acc, { product, amount }) => {
      acc[0] += amount * Product.TYPES[product].massPerUnit;
      acc[1] += amount * Product.TYPES[product].volumePerUnit;
      return acc;
    }, [0, 0]);
    return { ...i, mass, volume }
  });
};

const getMockShipInventories = (shipType, contentsBySlot) => {
  const { cargoSlot, cargoInventoryType, propellantSlot, propellantInventoryType } = Ship.TYPES[shipType];
  const inv = [];
  if (cargoSlot && cargoInventoryType) {
    inv.push({
      slot: cargoSlot,
      inventoryType: cargoInventoryType,
      mass: 0,
      reservedMass: 0,
      reservedVolume: 0,
      volume: 0,
      contents: contentsObjToArray(contentsBySlot?.[cargoSlot]),
      status: Inventory.STATUSES.AVAILABLE
    });
  }
  if (propellantSlot && propellantInventoryType) {
    inv.push({
      slot: propellantSlot,
      inventoryType: propellantInventoryType,
      mass: 0,
      reservedMass: 0,
      reservedVolume: 0,
      volume: 0,
      contents: contentsObjToArray(contentsBySlot?.[propellantSlot]),
      status: Inventory.STATUSES.AVAILABLE
    });
  }

  // TODO: it feels inelegant how we are doing this... 
  return inv.map((i) => {
    const [mass, volume] = (i.contents || []).reduce((acc, { product, amount }) => {
      acc[0] += amount * Product.TYPES[product].massPerUnit;
      acc[1] += amount * Product.TYPES[product].volumePerUnit;
      return acc;
    }, [0, 0]);
    return { ...i, mass, volume }
  });
}

const MockDataItem = ({ overwrite }) => {
  const queryClient = useQueryClient();
  const [overwriteAt, setOverwriteAt] = useState(-1);
  const [overwrittenAt, setOverwrittenAt] = useState(-1);

  // (this will listen to updates on that queryKey and assumes they will come from elsewhere in the application)
  const { dataUpdatedAt } = useQuery({
    queryKey: overwrite.queryKey,
    queryFn: () => null,
    enabled: false,
    staleTime: Infinity
  });

  // if new overwrite, always overwrite
  useEffect(() => {
    setOverwriteAt((dataUpdatedAt || 0) + 0.5);
  }, [overwrite]);

  // if new dataUpdatedAt, always overwrite UNLESS caused by the most recent overwrite
  useEffect(() => {
    if (dataUpdatedAt !== overwrittenAt) {
      setOverwriteAt((dataUpdatedAt || 0) + 0.5);
    }
  }, [dataUpdatedAt]);

  // transform and overwrite data
  useEffect(() => {
    const { queryKey, transformer } = overwrite;
    const transformedData = transformer(queryClient.getQueryData(queryKey));
    if (transformedData !== undefined) {
      setOverwrittenAt(overwriteAt);
      queryClient.setQueryData(
        queryKey,
        transformedData,
        { updatedAt: overwriteAt }
      );
    }
  }, [overwriteAt]);

  return null;
};

const MockDataManager = () => {
  const queryClient = useQueryClient();
  const simulation = useSimulationState();

  const overwrites = useMemo(() => {
    const myCrewEntity = Entity.formatEntity({ id: SIMULATION_CONFIG.crewId, label: Entity.IDS.CREW });

    const configs = [];

    // sway balance
    configs.push({
      queryKey: [ 'walletBalance', 'sway', SIMULATION_CONFIG.accountAddress ],
      transformer: () => simulation.sway || 0
    });

    // lot-related
    if (simulation.lots) {
      
      // packed lot data
      configs.push({
        queryKey: [ 'asteroidPackedLotData', SIMULATION_CONFIG.asteroidId ],
        transformer: (data) => {
          if (data) {
            Object.keys(simulation.lots).forEach((lotId) => {
              const lotIndex = Lot.toIndex(lotId);
              let buildingType = 0;
              if (simulation.lots[lotId]?.shipId && !simulation.lots[lotId]?.shipIsUndocked) {
                buildingType = 15; // ship
              } else if (simulation.lots[lotId]?.buildingType) {
                if (simulation.lots[lotId]?.buildingStatus !== Building.CONSTRUCTION_STATUSES.OPERATIONAL) {
                  buildingType = 14; // construction site
                } else {
                  buildingType = simulation.lots[lotId]?.buildingType;
                }
              }
              data[lotIndex] = ((buildingType || 0) << 4) // capable type
                + (2 << 2) // leased
                + (0 << 1) // crew present
                + (0);     // samples for sale
            });
            return data;
          }
        }
      });

      // TODO: build out lots by id for quick access from transformers?
      // (i.e. can use entityToAgreements for agreements, etc)

      const simulatedAgreements = [];
      const simulatedBuildings = [];
      const simulatedLots = [];
      const simulatedShips = [];

      Object.keys(simulation.lots).map((stringLotId) => {
        const lotId = Number(stringLotId);
        const {
          buildingId,
          buildingStatus,
          buildingType,
          depositId,
          depositYield,
          depositYieldRemaining,
          entityName,
          leaseRate,
          leaseTerm,
          inventoryContents,
          shipId,
          shipIsInFlight,
          shipIsUndocked,
        } = simulation.lots[lotId];

        const lotEntity = Entity.formatEntity({ id: lotId, label: Entity.IDS.LOT });
        const asteroidEntity = Entity.formatEntity({ id: Lot.toPosition(lotId)?.asteroidId, label: Entity.IDS.ASTEROID });
        
        const lot = {
          ...lotEntity,
          Location: { location: asteroidEntity, locations: [asteroidEntity] },
          PrepaidAgreements: [{
            permission: Permission.IDS.USE_LOT,
            permitted: myCrewEntity,
            endTime: nowSec() + parseInt(leaseTerm),
            initialTerm: 30 * 86400,
            noticePeriod: 30 * 86400,
            noticeTime: 0,
            rate: leaseRate,
            startTime: nowSec()
          }]
        };
        simulatedLots.push(lot);
        simulatedAgreements.push(...entityToAgreements(lot));

        // lot entity
        configs.push({
          queryKey: [ 'entity', Entity.IDS.LOT, lotId ],
          transformer: (data) => {
            return data ? { ...data, ...lot } : { ...lot }
          }
        });

        // if building id
        let building;
        if (buildingId) {
          building = {
            ...Entity.formatEntity({ id: buildingId, label: Entity.IDS.BUILDING }),
            Building: {
              buildingType,
              status: buildingStatus,
              plannedAt: nowSec(),
              finishTime: nowSec()
            },
            Control: { controller: myCrewEntity },
            Inventories: getMockBuildingInventories(buildingType, buildingStatus, inventoryContents),
            Location: {
              location: lotEntity,
              locations: [lotEntity, asteroidEntity]
            },
            Name: { name: entityName || '' }
          };

          // per-building components
          switch(buildingType) {
            case Building.IDS.EXTRACTOR:
              building.Extractors = [{
                // TODO: ...
                // destination: {},
                // destinationSlot,
                // finishTime: nowSec() + 123456,
                // yield: 234567,
                slot: 1,
                status: Extractor.STATUSES.IDLE,
              }];
              break;
            case Building.IDS.REFINERY:
              building.Processors = [{
                // TODO: ...
                // destinationSlot,
                // finishTime: nowSec() + 123456,
                // outputProduct: 0,
                // recipes: 0,
                // runningProcess: 0,
                // secondaryEff: 0,
                processorType: Processor.IDS.REFINERY,
                slot: 1,
                status: Processor.STATUSES.IDLE,
              }];
              break;
            case Building.IDS.SHIPYARD:
              building.Processors = [{
                // TODO: ...
                // destinationSlot,
                // finishTime: nowSec() + 123456,
                // outputProduct: 0,
                // recipes: 0,
                // runningProcess: 0,
                // secondaryEff: 0,
                processorType: Processor.IDS.SHIPYARD,
                slot: 1,
                status: Processor.STATUSES.IDLE,
              }];
              building.DryDocks = [{
                dryDockType: DryDock.IDS.BASIC,
                slot: 1,
                status: DryDock.STATUSES.IDLE,
                // finishTime: nowSec(),
                // outputShip
              }];
              break;
          }

          simulatedBuildings.push(building);

          // building entity
          configs.push({
            queryKey: [ 'entity', Entity.IDS.BUILDING, Number(buildingId) ],
            transformer: (data) => building // not merging because choosing ids to avoid collisions
          });
        }

        let deposit;
        if (depositId) {
          deposit = {
            ...Entity.formatEntity({ id: depositId, label: Entity.IDS.DEPOSIT }),
            Deposit: {
              resource: SIMULATION_CONFIG.resourceId,
              initialYield: depositYield,
              remainingYield: depositYieldRemaining,
              finishTime: nowSec() - 100,
              status: (
                depositYield
                ? (
                  depositYieldRemaining === depositYield ? Deposit.STATUSES.SAMPLED : Deposit.STATUSES.USED
                )
                : Deposit.STATUSES.SAMPLING
              )
            },
            Control: { controller: myCrewEntity },
            Location: {
              location: lotEntity,
              locations: [lotEntity, asteroidEntity]
            },
          };

          configs.push({
            queryKey: [ 'entity', Entity.IDS.DEPOSIT, Number(depositId) ],
            transformer: (data) => deposit
          });
        }

        let ship;
        if (shipId) {
          ship = {
            ...Entity.formatEntity({ id: shipId, label: Entity.IDS.SHIP }),
            Control: { controller: myCrewEntity },
            Inventories: getMockShipInventories(Ship.IDS.LIGHT_TRANSPORT, inventoryContents),
            Location: (
              shipIsInFlight
              ? {
                location: { id: 1, label: Entity.IDS.SPACE },
                locations: [{ id: 1, label: Entity.IDS.SPACE }],
              }
              : (
                shipIsUndocked
                ? {
                  location: asteroidEntity,
                  locations: [asteroidEntity]
                }
                : {
                  location: lotEntity,
                  locations: [lotEntity, asteroidEntity]
                }
              )
            ),
            Name: { name: entityName || '' },
            Nft: { // TODO: use standard 
              owners: {
                ethereum: null,
                starknet: SIMULATION_CONFIG.accountAddress,
              },
              owner: SIMULATION_CONFIG.accountAddress,
              chain: "STARKNET"
            },
            Ship: {
              emergencyAt: 0,
              readyAt: nowSec() - 100,
              shipType: Ship.IDS.LIGHT_TRANSPORT,
              status: Ship.STATUSES.AVAILABLE,
              transitArrival: shipIsInFlight ? nowSec() + 86400 : 0,
              transitDeparture: shipIsInFlight ? nowSec() - 100 : 0,
              transitOrigin: shipIsInFlight ? { id: 1, label: Entity.IDS.ASTEROID } : undefined,
              transitDestination: shipIsInFlight ? { id: SIMULATION_CONFIG.destinationAsteroidId, label: Entity.IDS.ASTEROID } : undefined,
              variant: Ship.VARIANTS.STANDARD
            },
            Station: {
              population: simulation.crewLocation?.[0]?.label === Entity.IDS.SHIP ? 5 : 0,
              stationType: Ship.TYPES[Ship.IDS.LIGHT_TRANSPORT].stationType
            },
          };

          simulatedShips.push(ship);

          configs.push({
            queryKey: [ 'entity', Entity.IDS.SHIP, Number(shipId) ],
            transformer: (data) => ship
          });
        }

        // lot entities...
        configs.push({
          queryKey: entitiesCacheKey(Entity.IDS.DEPOSIT, { lotId }),
          transformer: (data) => deposit ? [deposit] : [],
        });
        configs.push({
          queryKey: entitiesCacheKey(Entity.IDS.BUILDING, { lotId }),
          transformer: (data) => building ? [building] : []
        });
        configs.push({
          queryKey: entitiesCacheKey(Entity.IDS.SHIP, { lotId }),
          transformer: (data) => ship && !ship.shipIsUndocked ? [ship] : []
        });
      });

      // wallet agreements
      configs.push({
        queryKey: [ 'agreements', SIMULATION_CONFIG.accountAddress ],
        transformer: (data) => simulatedAgreements
      });

      // wallet assets
      const controllerIds = [SIMULATION_CONFIG.crewId];
      // configs.push({
      //   queryKey: entitiesCacheKey(Entity.IDS.ASTEROID, { owner: accountAddress, controllerId: controllerIds }),
      //   transformer: (data) => data,
      // });
      configs.push({
        queryKey: entitiesCacheKey(Entity.IDS.BUILDING, { controllerId: controllerIds, status: walletBuildingStatuses }),
        transformer: (data) => simulatedBuildings,
      });
      configs.push({
        queryKey: entitiesCacheKey(Entity.IDS.SHIP, { owner: SIMULATION_CONFIG.accountAddress, controllerId: controllerIds }),
        transformer: (data) => simulatedShips,
      });

      // crew accessible inventories
      const invKeyObj = {
        asteroidId: SIMULATION_CONFIG.asteroidId,
        hasComponent: 'Inventories',
        permissionCrewId: SIMULATION_CONFIG.crewId,
        permissionAccount: SIMULATION_CONFIG.accountAddress
      };
      configs.push(
        {
          queryKey: entitiesCacheKey(Entity.IDS.BUILDING, { ...invKeyObj, hasPermission: Permission.IDS.ADD_PRODUCTS }),
          transformer: (data) => [...simulatedBuildings, ...simulatedShips].filter((b) => !!b.Inventories.find((i) => i.status === Inventory.STATUSES.AVAILABLE))
        },
        {
          queryKey: entitiesCacheKey(Entity.IDS.BUILDING, { ...invKeyObj, hasPermission: Permission.IDS.REMOVE_PRODUCTS }),
          transformer: (data) => [...simulatedBuildings, ...simulatedShips].filter((b) => !!b.Inventories.find((i) => i.status === Inventory.STATUSES.AVAILABLE))
        },
      );
    }

    // unresolved activities (action items)
    configs.push({
      queryKey: [ 'actionItems', SIMULATION_CONFIG.crewId ],
      transformer: (data) => (simulation.actionItems || [])
    });

    // unresolved activities (entities)
    const entityUnresolveds = {};
    (simulation.actionItems || []).forEach((actionItem) => {
      actionItem.entities.forEach(({ label, id }) => {
        const entityKey = `${label}|${id}`;
        if (!entityUnresolveds[entityKey]) entityUnresolveds[entityKey] = [];
        entityUnresolveds[entityKey].push(actionItem);
      })
    });
    Object.keys(entityUnresolveds).forEach((entityKey) => {
      configs.push({
        queryKey: [ 'activities', ...entityKey.split('|').map(Number), 'unresolved' ],
        transformer: (data) => entityUnresolveds[entityKey] || []
      });
    });
    
    // open orders
    configs.push({
      queryKey: [ 'crewOpenOrders', SIMULATION_CONFIG.crewId ],
      transformer: (data) => {
        if (!simulation.order) return data;

        const { exchange, caller, callerCrew, storage, ...order } = simulation.order;
        order.entity = Entity.formatEntity(exchange);
        order.crew = Entity.formatEntity(callerCrew);
        order.orderType = Order.IDS.LIMIT_SELL;
        order.storage = Entity.formatEntity(storage);
        order.status = Order.STATUSES.OPEN;
        order.initialCaller = caller;
        order.locations = [
          /* TODO: ? is more detail needed? */
          Entity.formatEntity({ id: SIMULATION_CONFIG.asteroidId, label: Entity.IDS.ASTEROID })
        ];
        return [order];
      }
    });

    return configs.map((c) => ({ ...c, key: JSON.stringify(c.queryKey) }));
  }, [simulation]);

  // on unmount, refetch all overwrites
  useEffect(() => {
    return () => {
      overwrites.forEach(({ queryKey }) => {
        queryClient.invalidateQueries({ queryKey, refetchType: 'active' });
      });
    };
  }, []);

  // console.log('configs', overwrites);


  // entity, entities
  // [ 'entity', label, id ],
  // entitiesCacheKey(label, ids?.join(',')),

  
  // TODO: ...
  // asteroid ships
  // entitiesCacheKey(Entity.IDS.SHIP, { asteroidId, status: Ship.STATUSES.AVAILABLE }),

  // crew orders
  // [ 'crewOpenOrders', controllerId ],

  // crew samples
  // entitiesCacheKey(Entity.IDS.DEPOSIT, { controllerId, isDepleted: false }),

  // deliveries
  // const cacheKey = useMemo(() => {
  //   const k = {};
  //   if (destination) k.destination = safeEntityId(destination);
  //   if (origin) k.origin = safeEntityId(origin);
  //   if (status) k.status = status;
  //   return k;
  // }, [ destination, origin, status ]);

  // const { data: rawData, isLoading, dataUpdatedAt } = useQuery(
  //   entitiesCacheKey(Entity.IDS.DELIVERY, cacheKey),

  // stationed crews
  // entitiesCacheKey(Entity.IDS.CREW, { stationUuid: entityUuid }),

  // asset search
  // [ 'search', esAssetType, query ],

  // asteroid buildings
  // entitiesCacheKey(Entity.IDS.BUILDING, { asteroidId, hasComponent: reqComponent, status: Building.CONSTRUCTION_STATUSES.OPERATIONAL }),

  // asteroid crew samples
  // entitiesCacheKey(Entity.IDS.DEPOSIT, { asteroidId, resourceId, controllerId, isDepleted: false }),

  // entity activities
  // [ 'activities', entity?.label, entity?.id ],

  // "busy item" not really necessary b/c fast forwarding
  // [ 'activities', entity?.label, entity?.id, 'busy' ]

  return overwrites.map((o) => <MockDataItem key={o.key} overwrite={o} />);
};

export default MockDataManager;
