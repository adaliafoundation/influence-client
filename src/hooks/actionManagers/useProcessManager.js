import { useCallback, useContext, useMemo } from 'react';
import { Entity, Permission, Processor } from '@influenceth/sdk';

import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useStarterMissionExecution from '~/hooks/useStarterMissionExecution';
import useBlockTime from '~/hooks/useBlockTime';
import useCrewContext from '~/hooks/useCrewContext';
import useLot from '~/hooks/useLot';
import useUnresolvedActivities from '~/hooks/useUnresolvedActivities';
import actionStages from '~/lib/actionStages';

const useProcessManager = (lotId, slot, missionId) => {
  const execute = useStarterMissionExecution(missionId);
  const blockTime = useBlockTime();
  const { getPendingTx, getStatus } = useContext(ChainTransactionContext);
  const { crew, crewCan } = useCrewContext();
  const { data: lot } = useLot(lotId);
  const { data: actionItems } = useUnresolvedActivities(lot?.building);

  const payload = useMemo(() => ({
    processor: { id: lot?.building?.id, label: Entity.IDS.BUILDING },
    processor_slot: slot,
    caller_crew: { id: crew?.id, label: Entity.IDS.CREW }
  }), [lot?.building, crew?.id, slot]);

  const processor = useMemo(() => lot?.building?.Processors?.find((e) => e.slot === slot), [lot?.building, slot]);

  // status flow
  // READY > PROCESSING > READY_TO_FINISH > FINISHING
  const [currentProcess, processStatus, actionStage] = useMemo(() => {
    let current = {
      _cachedData: null,
      _isAccessible: false,
      finishTime: null,
      destination: null,
      destinationSlot: null,
      origin: null,
      originSlot: null,
      primaryOutputId: null,
      processId: null,
      recipeTally: null,
      startTime: null,
    };
  
    let status = 'READY';
    let stage = actionStages.NOT_STARTED;
    if (processor?.status === Processor.STATUSES.RUNNING) {
      let actionItem = (actionItems || []).find((item) => (
        item.event.name === 'MaterialProcessingStarted'
        && item.event.returnValues.processor.id === lot.building.id
        && item.event.returnValues.processorSlot === slot
      ));
      if (actionItem) {
        current._cachedData = actionItem.data;
        current.origin = actionItem.event.returnValues.origin;
        current.originSlot = actionItem.event.returnValues.originSlot;
        current.startTime = actionItem._startTime || actionItem.event.timestamp;
        current._isAccessible = (
          (actionItem.event.returnValues.callerCrew.id === crew?.id)
          || crewCan(Permission.IDS.RUN_PROCESS, lot.building)
        );
      }
      current.destination = processor?.destination;
      current.destinationSlot = processor?.destinationSlot;
      current.finishTime = processor?.finishTime;
      current.primaryOutputId = processor?.outputProduct;
      current.processId = processor?.runningProcess;
      current.recipeTally = processor?.recipes;
      
      if(getStatus('ProcessProductsFinish', payload) === 'pending') {
        status = 'FINISHING';
        stage = actionStages.COMPLETING;
      } else if (processor?.finishTime && processor.finishTime <= blockTime) {
        status = 'READY_TO_FINISH';
        stage = actionStages.READY_TO_COMPLETE;
      } else {
        status = 'PROCESSING';
        stage = current.startTime > blockTime ? actionStages.SCHEDULED : actionStages.IN_PROGRESS;
      }
    } else {
      const startTx = getPendingTx('LeaseAndProcessProductsStart', payload) || getPendingTx('ProcessProductsStart', payload);
      if (startTx) {
        current.destination = startTx.vars.destination;
        current.destinationSlot = startTx.vars.destination_slot;
        current.origin = startTx.vars.origin;
        current.originSlot = startTx.vars.origin_slot;
        current.primaryOutputId = startTx.vars.target_output;
        current.processId = startTx.vars.process;
        current.recipeTally = startTx.vars.recipes;

        status = 'PROCESSING';
        stage = actionStages.STARTING;
      }
    }

    return [
      status === 'READY' ? null : current,
      status,
      stage
    ];
  }, [actionItems, blockTime, crew?.id, crewCan, getPendingTx, getStatus, payload, processor?.status]);

  const startProcess = useCallback(({ processId, primaryOutputId, recipeTally, origin, originSlot, destination, destinationSlot, leaseDetails }) => {
    execute(
      leaseDetails ? 'LeaseAndProcessProductsStart' : 'ProcessProductsStart',
      {
        ...payload,
        process: processId,
        target_output: primaryOutputId,
        recipes: recipeTally,
        origin: { id: origin.id, label: origin.label },
        origin_slot: originSlot,
        destination: { id: destination.id, label: destination.label },
        destination_slot: destinationSlot,
        lease: leaseDetails
      },
      {
        lotId,
      }
    )
  }, [execute, lotId, payload, processor?.processorType]);

  const finishProcess = useCallback(() => {
    execute('ProcessProductsFinish', payload, { lotId, process: processor?.runningProcess });
  }, [execute, lotId, payload, processor?.runningProcess]);

  return {
    startProcess,
    finishProcess,

    processStatus,
    currentProcess,
    actionStage
  };
};

export default useProcessManager;
