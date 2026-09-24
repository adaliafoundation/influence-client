import { useCallback, useContext, useMemo } from 'react';
import { Entity, Extractor, Permission } from '@influenceth/sdk';

import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useStarterMissionExecution from '~/hooks/useStarterMissionExecution';
import useBlockTime from '~/hooks/useBlockTime';
import useCrewContext from '~/hooks/useCrewContext';
import useLot from '~/hooks/useLot';
import useUnresolvedActivities from '~/hooks/useUnresolvedActivities';
import actionStages from '~/lib/actionStages';

// TODO: truly support multiple extractors
const useExtractionManager = (lotId, slot = 1, missionId) => {
  const execute = useStarterMissionExecution(missionId);
  const blockTime = useBlockTime();
  const { getPendingTx, getStatus } = useContext(ChainTransactionContext);
  const { crew, crewCan } = useCrewContext();
  const { data: lot } = useLot(lotId);
  const { data: actionItems } = useUnresolvedActivities(lot?.building);

  const payload = useMemo(() => ({
    extractor: { id: lot?.building?.id, label: Entity.IDS.BUILDING },
    extractor_slot: slot,
    caller_crew: { id: crew?.id, label: Entity.IDS.CREW }
  }), [lot?.building, crew?.id, slot]);

  const slotExtractor = useMemo(() => lot?.building?.Extractors?.find((e) => e.slot === slot), [lot?.building, slot]);

  // status flow
  // READY > EXTRACTING > READY_TO_FINISH > FINISHING
  const [currentExtraction, extractionStatus, actionStage] = useMemo(() => {
    let current = {
      _cachedData: null,
      _isAccessible: false,
      finishTime: null,
      destination: null,
      destinationSlot: null,
      resourceId: null,
      depositId: null,
      startTime: null,
      yield: null,
      isCoreSampleUpdated: false
    };
    //
    // TODO: destinationLotId --> destination, destinationInventoryId --> destinationSlot

    let status = 'READY';
    let stage = actionStages.NOT_STARTED;
    if (slotExtractor?.status === Extractor.STATUSES.RUNNING) {
      let actionItem = (actionItems || []).find((item) => (
        item.event.name === 'ResourceExtractionStarted'
        && item.event.returnValues.extractor.id === lot.building.id
        && item.event.returnValues.extractorSlot === slot
      ));
      if (actionItem) {
        current._cachedData = actionItem.data;
        current.depositId = actionItem.event.returnValues.deposit.id;
        current.startTime = actionItem._startTime || actionItem.event.timestamp;
        current._isAccessible = (
          (actionItem.event.returnValues.callerCrew.id === crew?.id)
          || crewCan(Permission.IDS.EXTRACT_RESOURCES, lot.building)
        );
      }
      current.destination = slotExtractor?.destination;
      current.destinationSlot = slotExtractor?.destinationSlot;
      current.finishTime = slotExtractor?.finishTime;
      current.resourceId = slotExtractor?.outputProduct;
      current.yield = slotExtractor?.yield;

      current.isCoreSampleUpdated = true;

      if(getStatus('ExtractResourceFinish', payload) === 'pending') {
        status = 'FINISHING';
        stage = actionStages.COMPLETING;
      } else if (slotExtractor?.finishTime && slotExtractor.finishTime <= blockTime) {
        status = 'READY_TO_FINISH';
        stage = actionStages.READY_TO_COMPLETE;
      } else {
        status = 'EXTRACTING';
        stage = current.startTime > blockTime ? actionStages.SCHEDULED : actionStages.IN_PROGRESS;
      }
    } else {
      const startTx = getPendingTx('FlexibleExtractResourceStart', payload) || getPendingTx('ExtractResourceStart', payload);
      if (startTx) {
        current.depositId = startTx.vars.deposit.id;
        current.destination = startTx.vars.destination;
        current.destinationSlot = startTx.vars.destination_slot;
        current.resourceId = startTx.meta.resourceId;
        current.yield = startTx.vars.yield;
        status = 'EXTRACTING';
        stage = actionStages.STARTING;
      }
    }

    return [
      status === 'READY' ? null : current,
      status,
      stage
    ];
  }, [actionItems, blockTime, crew?.id, crewCan, getPendingTx, getStatus, payload, slotExtractor?.status]);

  const startExtraction = useCallback((amount, deposit, destination, destinationSlot, depositRecipient, lease) => {
    execute(
      'FlexibleExtractResourceStart',
      {
        ...payload,
        yield: amount,
        deposit: { id: deposit.id, label: deposit.label },
        destination: { id: destination.id, label: destination.label },
        destination_slot: destinationSlot,
        purchase: depositRecipient && {
          price: deposit.PrivateSale?.amount || 0,
          recipient: depositRecipient
        },
        lease
      },
      {
        resourceId: deposit.Deposit.resource,
        lotId
      }
    )
  }, [execute, payload]);

  const finishExtraction = useCallback(() => {
    execute('ExtractResourceFinish', payload, { lotId });
  }, [execute, payload]);

  return {
    startExtraction,
    finishExtraction,
    extractionStatus,
    currentExtraction,
    actionStage
  };
};

export default useExtractionManager;
