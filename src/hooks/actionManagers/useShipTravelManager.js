import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { lambert } from '@influenceth/astro';
import { GM_ADALIA, AdalianOrbit, Crewmate, Entity, Ship, Time } from '@influenceth/sdk';
import { Vector3 } from 'three';

import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useAsteroid from '~/hooks/useAsteroid';
import useBlockTime from '~/hooks/useBlockTime';
import useConstants from '~/hooks/useConstants';
import useShip from '~/hooks/useShip';
import useStore from '~/hooks/useStore';
import useUnresolvedActivities from '~/hooks/useUnresolvedActivities';
import actionStages from '~/lib/actionStages';
import { arrToXYZ, getCrewAbilityBonuses } from '~/lib/utils';

const toV3 = ({ x, y, z }) => new Vector3(x, y, z);

const useShipTravelManager = (shipId) => {
  const blockTime = useBlockTime();
  const { execute, getPendingTx, getStatus } = useContext(ChainTransactionContext);
  const { data: ship, dataUpdatedAt: shipUpdatedAt } = useShip(shipId);
  const { data: actionItems } = useUnresolvedActivities({ label: Entity.IDS.SHIP, id: shipId });

  const { data: TIME_ACCELERATION } = useConstants('TIME_ACCELERATION');
  const proposedTravelSolution = useStore(s => s.asteroids.travelSolution);

  const [currentTravelSolution, setCurrentTravelSolution] = useState();

  const caller_crew = useMemo(() => {
    return ship?.label === Entity.IDS.CREW ? ship : ship?.Control?.controller;
  }, [ship?.Control?.controller?.id]);

  // READY > DEPARTING > IN_FLIGHT > READY_TO_ARRIVE > ARRIVING
  const [currentTravelAction, status, stage] = useMemo(() => {
    let current = {
      _cachedData: null,
      _isAccessible: true,
      finishTime: null,
    };

    let status = 'READY';
    let stage = actionStages.NOT_STARTED;

    // ship has transit_destination while in flight
    if (ship?.Ship?.transitDeparture > 0) {
      let actionItem = (actionItems || []).findLast((item) => (
        item.event.name === 'TransitStarted'
        // caller_crew matches ship's owner (the ship in flight must have been launched by its controller)
        // TODO: this might cause issues if the ship's controller changes in flight... perhaps we should
        //       just include the shipId in the activity record
        && item.event.returnValues.callerCrew.id === caller_crew?.id
      ));
      if (actionItem) {
        current._cachedData = actionItem.data;
        current.startTime = actionItem.event.timestamp;
      } else {
        current._isAccessible = false;
      }
      current.originId = ship.Ship.transitOrigin?.id;
      current.destinationId = ship.Ship.transitDestination?.id;
      current.departureTime = ship.Ship.transitDeparture / 86400;
      current.arrivalTime = ship.Ship.transitArrival / 86400;
      current.finishTime = Math.ceil(Time.fromOrbitADays(current.arrivalTime, TIME_ACCELERATION).toDate().getTime() / 1000);

      if (getStatus('TransitBetweenFinish', { caller_crew }) === 'pending') {
        status = 'ARRIVING';
        stage = actionStages.COMPLETING;
      } else if (current.finishTime && current.finishTime <= blockTime) {
        status = 'READY_TO_ARRIVE';
        stage = actionStages.READY_TO_COMPLETE;
      } else {
        status = 'IN_FLIGHT';
        stage = actionStages.IN_PROGRESS;
      }
    } else {
      const startTx = getPendingTx('TransitBetweenStart', { caller_crew }) || getPendingTx('InitializeAndStartTransit', { caller_crew });
      if (startTx) {
        status = 'DEPARTING';
        stage = actionStages.STARTING;
        current.originId = startTx.vars.origin.id;
        current.destinationId = startTx.vars.destination.id;
        current.departureTime = startTx.vars.departure_time / 86400;
        current.arrivalTime = startTx.vars.arrival_time / 86400;
      }
    }

    return [
      status === 'READY' ? null : current,
      status,
      stage
    ];
  }, [actionItems, blockTime, getPendingTx, getStatus, caller_crew, ship, TIME_ACCELERATION]);

  const { data: origin } = useAsteroid(currentTravelAction?.originId || proposedTravelSolution?.originId);
  const { data: destination } = useAsteroid(currentTravelAction?.destinationId || proposedTravelSolution?.destinationId);

  const shipConfig = Ship.TYPES[ship?.Ship?.shipType];

  const cargoInv = useMemo(() => {
    return (ship?.Inventories || []).find(i => i.slot === shipConfig?.cargoSlot);
  }, [ship, shipConfig?.cargoSlot]);

  const propellantInv = useMemo(() => {
    return (ship?.Inventories || []).find(i => i.slot === shipConfig?.propellantSlot);
  }, [ship, shipConfig?.propellantSlot]);

  useEffect(() => {
    setCurrentTravelSolution();
    if (!origin || !destination || !propellantInv || !currentTravelAction) return;

    const originOrbit = new AdalianOrbit(origin.Orbit, { units: 'km' });
    const oPos = toV3(originOrbit.getPositionAtTime(currentTravelAction.departureTime));
    const oVel = (new Vector3())
      .subVectors(
        oPos,
        toV3(originOrbit.getPositionAtTime(currentTravelAction.departureTime - 1))
      )
      .divideScalar(86400);

    const destinationOrbit = new AdalianOrbit(destination.Orbit, { units: 'km' });
    const dPos = toV3(destinationOrbit.getPositionAtTime(currentTravelAction.arrivalTime));
    const dVel = (new Vector3())
      .subVectors(
        dPos,
        toV3(destinationOrbit.getPositionAtTime(currentTravelAction.arrivalTime - 1))
      )
      .divideScalar(86400);

    lambert.multiSolver(
      GM_ADALIA,
      oPos.toArray(),
      dPos.toArray(),
      (currentTravelAction.arrivalTime - currentTravelAction.departureTime) * 86400, // convert orbit days to seconds
      oVel.toArray(),
      dVel.toArray(),
    ).then((solution) => {
      
      // if this gets more complicated, use useActionCrew as a reference for
      // what should be included in this pseudo-crew object
      const exhaustBonus = getCrewAbilityBonuses(
        Crewmate.ABILITY_IDS.PROPELLANT_EXHAUST_VELOCITY,
        {
          ...currentTravelAction._cachedData?.crew || {},  // includes id, label, uuid, Crew, Location (if v2)
          _crewmates: currentTravelAction._cachedData?.crewmates || [],  // each includes id, label, uuid, Crewmate
          _station: { ...currentTravelAction._cachedData?.station || {} },
        }
      );
      const variantMod = 1 + (ship ? Ship.Entity.getVariant(ship)?.exhaustVelocityModifier : 0);
      const exhaustVelocity = shipConfig?.exhaustVelocity * (exhaustBonus?.totalBonus || 1) * variantMod;

      // treat leftover propellant as dry mass so can use simpler equation
      // TODO: this will be incorrect if propellant not yet deducted from the inventory

      // TODO: in dialog, add used mass to total mass if there is a current action

      // deltav = v_e * ln(wetmass / drymass)
      // deltav = v_e * ln((drymass + propused) / drymass)

      // deltav = v_e * ln(preMass / postMass)
      // preMass = postMass * e^(deltav / v_e)
      const postMass = shipConfig?.hullMass + cargoInv?.mass + propellantInv?.mass;
      const preMass = Math.round(postMass * Math.exp(solution.deltaV / exhaustVelocity));
      const usedPropellantMass = preMass - postMass;
      const prePropellantMass = preMass - (shipConfig?.hullMass + cargoInv?.mass);
      setCurrentTravelSolution({
        ...solution,
        originId: currentTravelAction.originId,
        destinationId: currentTravelAction.destinationId,
        departureTime: currentTravelAction.departureTime,
        arrivalTime: currentTravelAction.arrivalTime,
        originPosition: oPos.toArray(),
        originVelocity: oVel.toArray(),
        destinationPosition: dPos.toArray(),
        usedPropellantMass,
        usedPropellantPercent: 100 * usedPropellantMass / prePropellantMass,
        key: Date.now()
      })
    });
  }, [
    currentTravelAction?.originId,
    currentTravelAction?.destinationId,
    currentTravelAction?.departureTime,
    currentTravelAction?.arrivalTime,
    origin,
    destination,
    propellantInv?.mass,
    shipUpdatedAt
  ]);

  const depart = useCallback(() => {
    const {
      v1,
      originId,
      destinationId,
      departureTime,
      arrivalTime,
      originPosition,
      destinationPosition,
      usedPropellantMass
    } = proposedTravelSolution;

    // TODO: make sure travelSolution origin is where ship is? or just let the
    // contract fail if they manage to create that scenario

    const solutionOrbit = AdalianOrbit.fromStateVectors([...originPosition], v1);
    // console.log('travelSolution', proposedTravelSolution);
    // console.log('originPosition', originPosition);
    // console.log('solutionOrbit', solutionOrbit);
    console.log(
      destination?.AsteroidProof?.used ? 'TransitBetweenStart' : 'InitializeAndStartTransit',
      {
        asteroid: destination,
        origin: { id: originId, label: Entity.IDS.ASTEROID },
        destination: { id: destinationId, label: Entity.IDS.ASTEROID },
        departure_time: Math.round(departureTime * 86400), // in-game seconds since orbit epoch
        arrival_time: Math.round(arrivalTime * 86400), // in-game seconds since orbit epoch
        transit_p: solutionOrbit.orbit.p,
        transit_ecc: solutionOrbit.orbit.ecc,
        transit_inc: solutionOrbit.orbit.inc,
        transit_raan: solutionOrbit.orbit.raan,
        transit_argp: solutionOrbit.orbit.argp,
        transit_nu_start: solutionOrbit.getTrueAnomalyAtPos(arrToXYZ(originPosition)),
        transit_nu_end: solutionOrbit.getTrueAnomalyAtPos(arrToXYZ(destinationPosition)),
        caller_crew
      },
      {
        destination,
        shipId,
        usedPropellantMass: usedPropellantMass / 1e3
      }
    );
    execute(
      destination?.AsteroidProof?.used ? 'TransitBetweenStart' : 'InitializeAndStartTransit',
      {
        asteroid: destination, // in case needs initialization
        origin: { id: originId, label: Entity.IDS.ASTEROID },
        destination: { id: destinationId, label: Entity.IDS.ASTEROID },
        departure_time: Math.round(departureTime * 86400), // in-game seconds since orbit epoch
        arrival_time: Math.round(arrivalTime * 86400), // in-game seconds since orbit epoch
        transit_p: solutionOrbit.orbit.p,
        transit_ecc: solutionOrbit.orbit.ecc,
        transit_inc: solutionOrbit.orbit.inc,
        transit_raan: solutionOrbit.orbit.raan,
        transit_argp: solutionOrbit.orbit.argp,
        transit_nu_start: solutionOrbit.getTrueAnomalyAtPos(arrToXYZ(originPosition)),
        transit_nu_end: solutionOrbit.getTrueAnomalyAtPos(arrToXYZ(destinationPosition)),
        caller_crew
      },
      {
        destination,
        shipId,
        usedPropellantMass: usedPropellantMass / 1e3
      }
    );
  }, [caller_crew, destination, execute, proposedTravelSolution, shipId]);

  const arrive = useCallback(() => {
    execute(
      'TransitBetweenFinish',
      {
        caller_crew
      },
      {
        destination,
        shipId
      }
    );
  }, [caller_crew, destination, execute, shipId]);

  return {
    depart,
    arrive,
    currentTravelAction,
    currentTravelSolution,
    // TODO: proposedTravelSolution?

    travelStatus: status,
    actionStage: stage,

    inOrbit: !ship?._location?.lotId,
    isLoading: currentTravelAction && !currentTravelSolution
  };
};

export default useShipTravelManager;
