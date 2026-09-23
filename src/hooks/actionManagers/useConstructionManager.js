import { useCallback, useContext, useMemo } from 'react';
import { Asteroid, Building, Entity, Lot } from '@influenceth/sdk';

import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useStarterMissionExecution from '~/hooks/useStarterMissionExecution';
import useBlockTime from '~/hooks/useBlockTime';
import useUnresolvedActivities from '~/hooks/useUnresolvedActivities';
import useCrewContext from '~/hooks/useCrewContext';
import useLot from '~/hooks/useLot';
import useAsteroid from '~/hooks/useAsteroid';
import actionStage from '~/lib/actionStages';

const useConstructionManager = (lotId, missionId) => {
  const execute = useStarterMissionExecution(missionId);
  const { getPendingTx, getStatus } = useContext(ChainTransactionContext);
  const blockTime = useBlockTime();
  const { accountCrewIds, crew } = useCrewContext();
  const { data: lot } = useLot(lotId);

  const asteroidId = useMemo(() => Lot.toPosition(lotId)?.asteroidId, [lotId]);
  const { data: asteroid } = useAsteroid(asteroidId);
  const buildingId = lot?.building?.id;

  const { data: actionItems } = useUnresolvedActivities(buildingId ? { label: Entity.IDS.BUILDING, id: buildingId } : { label: Entity.IDS.LOT, id: lotId });

  const planPayload = useMemo(() => ({
    lot: { id: lotId, label: Entity.IDS.LOT },
    caller_crew: { id: crew?.id, label: Entity.IDS.CREW }
  }), [lotId, crew?.id]);

  const payload = useMemo(() => ({
    building: { id: buildingId, label: Entity.IDS.BUILDING },
    caller_crew: { id: crew?.id, label: Entity.IDS.CREW }
  }), [buildingId, crew?.id]);

  // UNBUILDABLE (before asteroid is scanned)
  // READY_TO_PLAN > PLANNING  > PLANNED > UNDER_CONSTRUCTION > READY_TO_FINISH > FINISHING > OPERATIONAL
  //               < CANCELING <         <                  DECONSTRUCTING                  <
  const [currentConstructionAction, constructionStatus, isAtRisk, stageByActivity] = useMemo(() => {
    let current = {
      _cachedData: null,
      _isAccessible: true,
      buildingId: null,
      buildingType: null,
      finishTime: null,
      crewId: null,
      startTime: null
    };
    const stages = {
      plan: actionStage.NOT_STARTED,
      unplan: actionStage.NOT_STARTED,
      construct: actionStage.NOT_STARTED,
      deconstruct: actionStage.NOT_STARTED,
    };

    let status = asteroid?.Celestial?.scanStatus === Asteroid.SCAN_STATUSES.RESOURCE_SCANNED
      ? 'READY_TO_PLAN'
      : 'UNBUILDABLE';
    let isAtRisk = false;
    if (lot?.building) {
      let actionItem = (actionItems || []).find((item) => (
        item.event.name === 'ConstructionStarted'
        && item.event.returnValues.building.id === lot.building.id
      ));

      if (actionItem) {
        current._cachedData = actionItem.data;
        current.startTime = actionItem._startTime || actionItem.event.timestamp;
      } else {
        current._isAccessible = false;
      }

      current.buildingId = lot.building.id;
      current.buildingType = lot.building.Building?.buildingType;
      current.finishTime = lot.building.Building?.finishTime;
      current.crewId = lot.building.Control?.controller?.id;

      if (lot.building.Building.status === Building.CONSTRUCTION_STATUSES.PLANNED) {
        if (getStatus('ConstructionStart', payload) === 'pending') {
          status = 'UNDER_CONSTRUCTION';
          stages.construct = actionStage.STARTING;
        } else if (getStatus('ConstructionAbandon', payload) === 'pending') {
          status = 'CANCELING';
          stages.unplan = actionStage.COMPLETING;
        } else if (lot.building.Building.plannedAt + Building.GRACE_PERIOD >= blockTime) {
          status = 'PLANNED';
          stages.plan = actionStage.COMPLETED;
        } else {
          isAtRisk = true;

          // if at-risk is being rebuilt on, check transaction to see if a new occupier is re-planning
          const planTx = getPendingTx('ConstructionPlan', planPayload);
          if (planTx) {
            current.buildingType = planTx.vars.buildingType;
            current.crewId = planTx.vars.crewId;
            current.finishTime = null;
            current.startTime = null;
            status = 'PLANNING';
            stages.plan = actionStage.COMPLETING;

          // if at risk, but i was the occupier, still treat as "planned" (will go back to "ready to plan" for other crews)
          } else if (accountCrewIds?.includes(lot.building?.Control?.controller?.id)) {
            status = 'PLANNED';
            stages.plan = actionStage.COMPLETED;
          }
        }

      } else if (lot.building.Building.status === Building.CONSTRUCTION_STATUSES.UNDER_CONSTRUCTION) {
        if (getStatus('ConstructionFinish', payload) === 'pending') {
          status = 'FINISHING';
          stages.construct = actionStage.COMPLETING;
        } else if (lot.building.Building.finishTime && (lot.building.Building.finishTime <= blockTime)) {
          status = 'READY_TO_FINISH';
          stages.construct = actionStage.READY_TO_COMPLETE;
        } else {
          status = 'UNDER_CONSTRUCTION';
          stages.construct = current.startTime > blockTime ? actionStage.SCHEDULED : actionStage.IN_PROGRESS;
        }

      } else if (lot.building.Building.status === Building.CONSTRUCTION_STATUSES.OPERATIONAL) {
        if (getStatus('ConstructionDeconstruct', payload) === 'pending') {
          status = 'DECONSTRUCTING';
          stages.deconstruct = actionStage.STARTING;
        } else {
          status = 'OPERATIONAL';
          stages.construct = actionStage.COMPLETED;
        }
      }
    } else {
      const planTx = getPendingTx('ConstructionPlan', planPayload);
      if (planTx) {
        current.buildingType = planTx.vars.building_type;
        current.crewId = planTx.vars.caller_crew.id;
        status = 'PLANNING';
        stages.plan = actionStage.COMPLETING;
      }
    }

    return [
      current,
      status,
      isAtRisk,
      stages
    ];
  }, [accountCrewIds, actionItems, asteroid, getPendingTx, getStatus, payload, planPayload, lot?.building]);

  const txMeta = useMemo(() => ({ asteroidId, lotId }), [asteroidId, lotId]);

  const planConstruction = useCallback((buildingType) => {
    execute(
      'ConstructionPlan',
      {
        building_type: buildingType,
        ...planPayload
      }
    )
  }, [execute, planPayload]);

  const unplanConstruction = useCallback(() => {
    execute(
      'ConstructionAbandon',
      payload,
      { ...txMeta, buildingType: lot?.building?.Building?.buildingType }
    )
  }, [execute, payload]);

  const startConstruction = useCallback(() => {
    execute('ConstructionStart', payload, txMeta)
  }, [execute, payload]);

  const finishConstruction = useCallback(() => {
    execute('ConstructionFinish', payload, txMeta)
  }, [execute, payload]);

  const deconstruct = useCallback(() => {
    execute(
      'ConstructionDeconstruct',
      payload,
      { ...txMeta, buildingType: lot?.building?.Building?.buildingType }
    )
  }, [execute, payload]);

  return {
    planConstruction,
    unplanConstruction,
    startConstruction,
    finishConstruction,
    deconstruct,
    constructionStatus,
    currentConstructionAction,
    isAtRisk,
    stageByActivity
  };
};

export default useConstructionManager;
