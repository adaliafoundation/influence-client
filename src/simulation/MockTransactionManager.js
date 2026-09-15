import { useCallback, useEffect, useRef } from 'react';
import { Asteroid, Building, Entity, Lot, Process, Product, Ship, Time } from '@influenceth/sdk';
import { camelCase } from 'lodash';

import useCrewContext from '~/hooks/useCrewContext';
import useGetActivityConfig from '~/hooks/useGetActivityConfig';
import useStore from '~/hooks/useStore';
import SIMULATION_CONFIG from './simulationConfig';
import useSimulationState from '~/hooks/useSimulationState';

const getUuid = () => String(performance.now()).replace('.', '');
const transformReturnValues = (obj) => {
  return Object.keys(obj).reduce((acc, k) => ({ ...acc, [camelCase(k)]: obj[k] }), {});
}
const nowSec = () => Math.floor(Date.now() / 1e3);

const MockTransactionManager = () => {
  const { crew, pendingTransactions } = useCrewContext();
  const simulation = useSimulationState();
  const getActivityConfig = useGetActivityConfig();

  const dispatchPendingTransactionComplete = useStore((s) => s.dispatchPendingTransactionComplete);
  const dispatchSimulationActionItems = useStore((s) => s.dispatchSimulationActionItems);
  const dispatchSimulationActionItemResolutions = useStore((s) => s.dispatchSimulationActionItemResolutions);

  const dispatchSimulationAddToInventory = useStore((s) => s.dispatchSimulationAddToInventory);
  const dispatchSimulationLotState = useStore((s) => s.dispatchSimulationLotState);
  const dispatchSimulationState = useStore((s) => s.dispatchSimulationState);

  const createAlert = useStore(s => s.dispatchAlertLogged);

  const simulateResultingEvent = useCallback((tx) => {
    // let activities = [];
    let activityResolutions = [];
    let events = [];

    let createActionItem = false;
    let crewBusyTime = 0;
    let taskBusyTime = 0;
    switch(tx.key) {
      case 'AcceptPrepaidAgreement': {
        // update simulation state
        const { asteroidId, lotIndex } = Lot.toPosition(tx.vars.target.id);
        const closest = Asteroid.getClosestLots({
          centerLot: lotIndex,
          lotTally: Asteroid.getSurfaceArea(asteroidId),
          findTally: 4
        });

        const lotDetails = { leaseTerm: tx.vars.term, leaseRate: Math.floor(tx.vars.termPrice / tx.vars.term) };
        const lotsLeased = { [tx.vars.target.id]: { ...lotDetails } };
        closest.forEach((lotIndex) => {
          lotsLeased[Lot.toId(asteroidId, lotIndex)] = { ...lotDetails };
        });
        dispatchSimulationState('lots', lotsLeased);
        dispatchSimulationState('sway', SIMULATION_CONFIG.startingSway - 5 * tx.vars.termPrice);

        // mimic event
        events.push({
          event: 'PrepaidAgreementAccepted',
          name: 'PrepaidAgreementAccepted',
          logIndex: 1,
          transactionIndex: 1,
          transactionHash: tx.txHash,
          timestamp: Math.floor(Date.now() / 1000),
          returnValues: transformReturnValues({
            ...tx.vars,
            initial_term: 30,
            notice_period: 30, // may not be accurate, but not important
            caller: SIMULATION_CONFIG.accountAddress
          }),
          _entities: [tx.vars.target, tx.vars.permitted, tx.vars.caller_crew]
        });
        break;
      }

      case 'ConstructionPlan': {
        const { asteroidId, lotIndex: destLotIndex } = Lot.toPosition(tx.vars.lot.id);
        const buildingId = SIMULATION_CONFIG.buildingIds[tx.vars.building_type];
        dispatchSimulationLotState(
          tx.vars.lot.id,
          {
            buildingId,
            buildingStatus: Building.CONSTRUCTION_STATUSES.PLANNED,
            buildingType: Number(tx.vars.building_type)
          }
        );

        // mimic event
        events.push({
          event: 'ConstructionPlanned',
          name: 'ConstructionPlanned',
          logIndex: 1,
          transactionIndex: 1,
          transactionHash: tx.txHash,
          timestamp: nowSec(),
          returnValues: transformReturnValues({
            ...tx.vars,
            asteroid: { id: asteroidId, label: Entity.IDS.ASTEROID },
            building: { id: buildingId, label: Entity.IDS.BUILDING },
            grace_period_end: nowSec() + 86400,
            caller: SIMULATION_CONFIG.accountAddress
          }),
          _entities: [
            { id: asteroidId, label: Entity.IDS.ASTEROID },
            { id: buildingId, label: Entity.IDS.BUILDING },
            tx.vars.lot,
            tx.vars.caller_crew
          ]
        });

        crewBusyTime = Time.toRealDuration(
          2 * Asteroid.getLotTravelTime(asteroidId, crew._location.lotIndex, destLotIndex),
          crew?._timeAcceleration
        );
        break;
      }

      case 'ConstructionStart': {
        dispatchSimulationLotState(tx.meta.lotId, { buildingStatus: Building.CONSTRUCTION_STATUSES.OPERATIONAL }); // TODO: under construction

        crewBusyTime = 0; // TODO: travel time + 20% construction time + return
        taskBusyTime = 86400; // TODO: travel time + construction time by type

        // mimic event
        const event = {
          event: 'ConstructionStarted',
          name: 'ConstructionStarted',
          logIndex: 1,
          transactionIndex: 1,
          transactionHash: tx.txHash,
          timestamp: nowSec(),
          returnValues: transformReturnValues({
            ...tx.vars,
            finish_time: nowSec() + taskBusyTime,
            caller: SIMULATION_CONFIG.accountAddress
          }),
          _entities: [ tx.vars.building, tx.vars.caller_crew ]
        };
        events.push(event);

        // TODO: action item?
        break;
      }

      case 'BulkFillSellOrder': {
        tx.vars.forEach((vars) => {
          simulateResultingEvent({
            key: 'FillSellOrder',
            vars,
            meta: tx.meta
          })
        });
        break;
      }

      case 'FillSellOrder': {
        // TODO: ...
        // dispatchSimulationState('deliveries', lotUpdate);
        dispatchSimulationAddToInventory(tx.vars.destination, tx.vars.destination_slot, tx.vars.product, tx.vars.amount);
        dispatchSimulationState('sway', -(tx.vars.payments.toExchange + tx.vars.payments.toPlayer), 'increment');

        // TODO: ...
        crewBusyTime = 3600;
        taskBusyTime = 0;

        // mimic event
        events.push({
          event: 'SellOrderFilled',
          name: 'SellOrderFilled',
          logIndex: 1,
          transactionIndex: 1,
          transactionHash: tx.txHash,
          timestamp: nowSec(),
          returnValues: transformReturnValues({
            ...tx.vars,
            caller: SIMULATION_CONFIG.accountAddress
          }),
          _entities: [ tx.vars.destination, tx.vars.exchange, tx.vars.storage, tx.vars.caller_crew ] // NOTE: missing seller
        });
        break;
      }

      case 'CreateSellOrder': {
        // remove product from warehouse
        dispatchSimulationAddToInventory(tx.vars.storage, tx.vars.storage_slot, tx.vars.product, -tx.vars.amount);

        // TODO: ...
        crewBusyTime = 0;
        taskBusyTime = 0;

        // create order
        const returnValues = transformReturnValues({
          ...tx.vars,
          valid_time: nowSec() - 100,
          maker_fee: 0, // TODO: ...
          caller: SIMULATION_CONFIG.accountAddress
        });
        dispatchSimulationState('order', returnValues);
        
        // mimic event
        events.push({
          event: 'SellOrderCreated',
          name: 'SellOrderCreated',
          logIndex: 1,
          transactionIndex: 1,
          transactionHash: tx.txHash,
          timestamp: nowSec(),
          returnValues,
          _entities: [ tx.vars.exchange, tx.vars.storage, tx.vars.caller_crew ]
        });
        break;
      }

      case 'SampleDepositStart': {
        // create deposit
        dispatchSimulationLotState(tx.vars.lot.id, { depositId: SIMULATION_CONFIG.depositId });

        // remove core drill
        dispatchSimulationAddToInventory(tx.vars.origin, tx.vars.origin_slot, Product.IDS.CORE_DRILL, -1);

        crewBusyTime = 0; // TODO: travel time
        taskBusyTime = 3600; // TODO: + travel time

        // mimic event
        const event = {
          event: 'SamplingDepositStartedV1',
          name: 'SamplingDepositStarted',
          logIndex: 1,
          transactionIndex: 1,
          transactionHash: tx.txHash,
          timestamp: nowSec(),
          returnValues: transformReturnValues({
            ...tx.vars,
            deposit: { id: SIMULATION_CONFIG.depositId, label: Entity.IDS.DEPOSIT },
            finish_time: nowSec() - 100,// + taskBusyTime,
            caller: SIMULATION_CONFIG.accountAddress
          }),
          _entities: [
            { id: SIMULATION_CONFIG.depositId, label: Entity.IDS.DEPOSIT },
            tx.vars.lot,
            tx.vars.origin, // NOTE: this is not in db entities
            tx.vars.caller_crew
          ]
        };
        events.push(event);

        // TODO: for events like these, would be better to set finish_time to actual finish_time,
        //  then have fast-forwarding cleanup set any "unready" to "ready"
        createActionItem = true;
        break;
      }

      case 'SampleDepositFinish': {
        const initialYield = 4621789; // TODO: real number for lots abundance? inflated number?

        // add yield to deposit
        const depositLotId = Object.keys(simulation.lots).find((k) => !!simulation.lots[k].depositId);
        dispatchSimulationLotState(depositLotId, { depositYield: initialYield, depositYieldRemaining: initialYield });

        // mimic event
        events.push({
          event: 'SamplingDepositFinished',
          name: 'SamplingDepositFinished',
          logIndex: 1,
          transactionIndex: 1,
          transactionHash: tx.txHash,
          timestamp: nowSec(),
          returnValues: transformReturnValues({
            ...tx.vars,
            initial_yield: initialYield,
            caller: SIMULATION_CONFIG.accountAddress
          }),
          _entities: [
            tx.vars.deposit,
            tx.vars.caller_crew
          ]
        });
        activityResolutions.push('SamplingDepositStarted')
        break;
      }

      case 'FlexibleExtractResourceStart':
      case 'ExtractResourceStart': {

        // subtract yield from deposit, add to warehouse
        dispatchSimulationLotState(tx.meta.lotId, { depositYieldRemaining: simulation.lots[tx.meta.lotId].depositYield - tx.vars.yield });
        dispatchSimulationAddToInventory(tx.vars.destination, tx.vars.destination_slot, tx.meta.resourceId, tx.vars.yield);

        crewBusyTime = 0; // TODO: travel time + 20% extraction time + return
        taskBusyTime = 86400; // TODO: extraction time + travel time

        // mimic event
        events.push({
          event: 'ResourceExtractionStarted',
          name: 'ResourceExtractionStarted',
          logIndex: 1,
          transactionIndex: 1,
          transactionHash: tx.txHash,
          timestamp: nowSec(),
          returnValues: transformReturnValues({
            ...tx.vars,
            resource: tx.meta.resourceId,
            finish_time: nowSec() + taskBusyTime,
            caller: SIMULATION_CONFIG.accountAddress
          }),
          _entities: [
            tx.vars.deposit,
            tx.vars.destination,
            tx.vars.extractor,
            tx.vars.caller_crew
          ]
        });
        break;
      }

      case 'ProcessProductsStart': {
        const process = Process.TYPES[tx.vars.process];

        // subtract inputs from warehouse
        Object.keys(process.inputs).forEach((resource) => {
          dispatchSimulationAddToInventory(tx.vars.origin, tx.vars.origin_slot, resource, -process.inputs[resource] * tx.vars.recipes);
        });
        
        // add outputs to warehouse
        // TODO (maybe): account for target_output
        Object.keys(process.outputs).forEach((resource) => {
          dispatchSimulationAddToInventory(tx.vars.destination, tx.vars.destination_slot, resource, process.outputs[resource] * tx.vars.recipes);
        });

        crewBusyTime = 0; // TODO: travel time + 20% extraction time + return
        taskBusyTime = 86400; // TODO: processing time + travel time

        // mimic event
        events.push({
          event: 'MaterialProcessingStarted',
          name: 'MaterialProcessingStarted',
          logIndex: 1,
          transactionIndex: 1,
          transactionHash: tx.txHash,
          timestamp: nowSec(),
          returnValues: transformReturnValues({
            ...tx.vars,
            // inputs,
            // outputs,
            finish_time: nowSec() + taskBusyTime,
            caller: SIMULATION_CONFIG.accountAddress
          }),
          _entities: [
            tx.vars.destination,
            tx.vars.origin,
            tx.vars.processor,
            tx.vars.caller_crew
          ]
        });
        break;
      }

      case 'AssembleShipStart': {
        const process = Process.TYPES[Process.IDS.LIGHT_TRANSPORT_INTEGRATION];

        // subtract inputs from warehouse
        Object.keys(process.inputs).forEach((resource) => {
          dispatchSimulationAddToInventory(tx.vars.origin, tx.vars.origin_slot, resource, -process.inputs[resource]);
        });

        // put ship on empty lot
        const emptyLotId = Object.keys(simulation.lots).find((lotId) => !simulation.lots[lotId].buildingId);
        dispatchSimulationLotState(emptyLotId, { shipId: SIMULATION_CONFIG.shipId });

        crewBusyTime = 0; // TODO: travel time + 20% build time + return
        taskBusyTime = 86400; // TODO: assembly time time + travel time

        // mimic event
        events.push({
          event: 'ShipAssemblyStartedV1',
          name: 'ShipAssemblyStarted',
          logIndex: 1,
          transactionIndex: 1,
          transactionHash: tx.txHash,
          timestamp: nowSec(),
          returnValues: transformReturnValues({
            ...tx.vars,
            ship: { id: SIMULATION_CONFIG.shipId, label: Entity.IDS.SHIP },
            finish_time: nowSec() + taskBusyTime,
            caller: SIMULATION_CONFIG.accountAddress
          }),
          _entities: [
            { id: SIMULATION_CONFIG.shipId, label: Entity.IDS.SHIP },
            tx.vars.dry_dock,
            tx.vars.origin,
            tx.vars.caller_crew
          ]
        });
        break;
      }

      case 'StationCrew': {
        dispatchSimulationState('crewLocation', [
          Entity.formatEntity(tx.vars.destination),
          Entity.formatEntity({ id: tx.meta.destLotId, label: Entity.IDS.LOT }),
          Entity.formatEntity({ id: 1, label: Entity.IDS.ASTEROID }),
        ]);

        crewBusyTime = 3600; // TODO: travel time

        // mimic event
        events.push({
          event: 'CrewStationedV1',
          name: 'CrewStationed',
          logIndex: 1,
          transactionIndex: 1,
          transactionHash: tx.txHash,
          timestamp: nowSec(),
          returnValues: transformReturnValues({
            ...tx.vars,
            origin_station: { id: 1, label: Entity.IDS.BUILDING },
            finish_time: nowSec() + crewBusyTime,
            destination_station: tx.vars.destination,
            caller: SIMULATION_CONFIG.accountAddress
          }),
          _entities: [
            tx.vars.destination,
            { id: 1, label: Entity.IDS.BUILDING },
            tx.vars.caller_crew
          ]
        });
        break;
      }

      case 'UndockShip': {
        const shipLotId = Object.keys(simulation.lots).find((lotId) => !!simulation.lots[lotId].shipId);
        dispatchSimulationState('crewLocation', [
          Entity.formatEntity(tx.vars.ship),
          Entity.formatEntity({ id: 1, label: Entity.IDS.ASTEROID }),
        ]);
        dispatchSimulationLotState(shipLotId, { shipId: SIMULATION_CONFIG.shipId, shipIsUndocked: true });

        // mimic event
        events.push({
          event: 'ShipUndocked',
          name: 'ShipUndocked',
          logIndex: 1,
          transactionIndex: 1,
          transactionHash: tx.txHash,
          timestamp: nowSec(),
          returnValues: transformReturnValues({
            ...tx.vars,
            dock: { id: shipLotId, label: Entity.IDS.LOT },
            caller: SIMULATION_CONFIG.accountAddress
          }),
          _entities: [
            { id: shipLotId, label: Entity.IDS.LOT },
            tx.vars.ship,
            tx.vars.caller_crew
          ]
        });
        break;
      }

      case 'InitializeAndStartTransit':
      case 'TransitBetweenStart': {

        // decrement propellant
        dispatchSimulationAddToInventory(
          { id: SIMULATION_CONFIG.shipId, label: Entity.IDS.SHIP },
          Ship.TYPES[Ship.IDS.LIGHT_TRANSPORT].propellantSlot,
          Product.IDS.HYDROGEN_PROPELLANT,
          -tx.meta.usedPropellantMass
        );
        
        // mark ship as inflight to destination (destination, arrival_time)
        const shipLotId = Object.keys(simulation.lots).find((lotId) => !!simulation.lots[lotId].shipId);
        dispatchSimulationLotState(shipLotId, { shipId: SIMULATION_CONFIG.shipId, shipIsUndocked: true, shipIsInFlight: true });

        dispatchSimulationState('crewLocation', [
          Entity.formatEntity({ id: SIMULATION_CONFIG.shipId, label: Entity.IDS.SHIP }),
          Entity.formatEntity({ id: 1, label: Entity.IDS.SPACE }),
        ]);
        
        // TODO: disable fast forwarding before this step
        crewBusyTime = 0; // TODO: ...
        taskBusyTime = 86400; // TODO: ...

        // mimic event
        events.push({
          event: 'TransitStarted',
          name: 'TransitStarted',
          logIndex: 1,
          transactionIndex: 1,
          transactionHash: tx.txHash,
          timestamp: nowSec(),
          returnValues: transformReturnValues({
            ...tx.vars,
            ship: { id: SIMULATION_CONFIG.shipId, label: Entity.IDS.SHIP },
            departure: tx.vars.departure_time,
            arrival: tx.vars.arrival_time,
            finish_time: nowSec() + taskBusyTime,
            caller: SIMULATION_CONFIG.accountAddress
          }),
          _entities: [
            { id: SIMULATION_CONFIG.shipId, label: Entity.IDS.SHIP },
            tx.vars.destination,
            tx.vars.origin,
            tx.vars.caller_crew
          ]
        });
        break;
      }

      case 'ChangeName': {
        // ship or building
        let lotId;
        if (tx.vars.entity.label === Entity.IDS.SHIP) {
          lotId = Object.keys(simulation.lots).find((i) => simulation.lots[i].shipId === tx.vars.entity.id);
        } else if (tx.vars.entity.label === Entity.IDS.BUILDING) {
          lotId = Object.keys(simulation.lots).find((i) => simulation.lots[i].buildingId === tx.vars.entity.id);
        } else {
          break;
        }
        dispatchSimulationLotState(lotId, { entityName: tx.vars.name });

        // mimic event
        events.push({
          event: 'NameChanged',
          name: 'NameChanged',
          logIndex: 1,
          transactionIndex: 1,
          transactionHash: tx.txHash,
          timestamp: nowSec(),
          returnValues: transformReturnValues({
            ...tx.vars,
            caller: SIMULATION_CONFIG.accountAddress
          }),
          _entities: [
            tx.vars.entity,
            tx.vars.caller_crew
          ]
        });
        break;
      }
    }

    // no need to invalidate data b/c no real updates made
    events.forEach(({ _entities, ...e }) => {
      const mockActivity = {
        id: getUuid(),
        // addresses: [],
        data: {
          crew: { id: crew.id, label: crew.label, uuid: crew.uuid, Crew: crew.Crew, Location: crew.Location },
          crewmates: crew._crewmates.map((c) => ({ id: c.id, label: c.label, uuid: c.uuid, Crewmate: c.Crewmate })),
          station: crew._station
        },
        entities: _entities || [],
        event: e,
        hash: getUuid(),
        hiddenBy: [],
        unresolvedFor: [{ id: crew.id, label: crew.label, uuid: crew.uuid }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const config = getActivityConfig(mockActivity);
      // TODO: hydrate activity?
      // triggerAlert as needed
      if (config?.triggerAlert && config?.logContent) {
        createAlert({
          type: 'ActivityLog',
          data: {
            ...config.logContent,
            stackId: mockActivity.event?.name
          },
          duration: 10000,
        })
      }
      
      // dispatchSimulationState('activities', mockActivity, 'append');
      if (createActionItem) {
        dispatchSimulationActionItems([mockActivity]);
      }
      if (activityResolutions?.length) {
        dispatchSimulationActionItemResolutions(activityResolutions);
      }
      if (crewBusyTime) {
        dispatchSimulationState('crewReadyAt', nowSec() + crewBusyTime);
      }
      if (taskBusyTime) {
        dispatchSimulationState('taskReadyAt', nowSec() + taskBusyTime);
      }
    });

    // tx complete
    dispatchPendingTransactionComplete(tx.txHash);
  }, [simulation, crew]);

  const processed = useRef([]);
  useEffect(() => {
    pendingTransactions.forEach((tx) => {
      if (!processed.current.includes(tx.txHash)) {
        processed.current.push(tx.txHash);
        
        // TODO: since fast forwarding in place, should we just skip processing state?
        setTimeout(() => {
          simulateResultingEvent(tx);
        }, 2000);
      }
    });
  }, [pendingTransactions]);

  return null;
};

export default MockTransactionManager;