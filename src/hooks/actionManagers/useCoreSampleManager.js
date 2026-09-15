import { useCallback, useContext, useMemo, useState } from 'react';
import { Deposit, Entity } from '@influenceth/sdk';

import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useBlockTime from '~/hooks/useBlockTime';
import useCrewContext from '~/hooks/useCrewContext';
import useLot from '~/hooks/useLot';
import useUnresolvedActivities from '~/hooks/useUnresolvedActivities';
import actionStages from '~/lib/actionStages';
import { getStarterCoreSampleSource } from '~/lib/starterPacks';

const useCoreSampleManager = (lotId) => {
  const blockTime = useBlockTime();
  const { execute, getPendingTx, getStatus } = useContext(ChainTransactionContext);
  const { accountCrewIds, crew, pendingTransactions } = useCrewContext();
  const { data: lot } = useLot(lotId);
  const { data: actionItems } = useUnresolvedActivities({ label: Entity.IDS.LOT, id: lotId });

  // * only used by SampleDepositStart contract, but used for equality check on others
  const payload = useMemo(() => ({
    lot: { id: lotId, label: Entity.IDS.LOT },
    caller_crew: { id: crew?.id, label: Entity.IDS.CREW }
  }), [lotId]);

  const [completingSamples, setCompletingSamples] = useState([]);

  const [currentSamplings, completedSamplings, currentSamplingsVersion] = useMemo(() => {
    const template = {
      _cachedData: null,
      finishTime: null,
      isNew: null,
      origin: null,
      originSlot: null,
      owner: null,
      resourceId: null,
      sampleId: null,
      startTime: null,
      active: false
    };

    const activeSamples = (lot?.deposits || [])
      .filter((c) => (
        accountCrewIds?.includes(c.Control.controller.id) && (
          c.Deposit.status < Deposit.STATUSES.SAMPLED || completingSamples.includes(c.id)
        )
      ))
      .map((activeSample) => {
        let current = { ...template };

        // status flow
        // READY > SAMPLING > READY_TO_FINISH > FINISHING
        let status = 'READY';
        let stage = actionStages.NOT_STARTED;
        if (activeSample) {
          let actionItem = (actionItems || []).find((item) => (
            item.event.name === 'SamplingDepositStarted'
            && item.event.returnValues.deposit.id === activeSample.id
          ));
          if (actionItem) {
            current._cachedData = actionItem.data;
            current.origin = actionItem.event.returnValues.origin;
            current.originSlot = actionItem.event.returnValues.originSlot;
            current.startTime = actionItem._startTime || actionItem.event.timestamp;
          };
          current.finishTime = activeSample.Deposit.finishTime;
          current.isNew = !activeSample.Deposit.initialYield;
          current.owner = activeSample.Control.controller.id;
          current.resourceId = activeSample.Deposit.resource;
          current.sampleId = activeSample.id;

          if (activeSample.Deposit.finishTime <= blockTime) {
            if (getStatus('SampleDepositFinish', { deposit: { id: activeSample.id, label: Entity.IDS.DEPOSIT } }) === 'pending') {
              status = 'FINISHING';
              stage = actionStages.COMPLETING;
              if (!completingSamples.includes(current.sampleId)) {
                setCompletingSamples([...completingSamples, current.sampleId]);
              }
            } else {
              status = 'READY_TO_FINISH';
              stage = actionStages.READY_TO_COMPLETE;
            }
          } else {
            status = 'SAMPLING';
            stage = current.startTime > blockTime ? actionStages.SCHEDULED : actionStages.IN_PROGRESS;
          }
        }

        // if did not update status beyond NOT_STARTED but there was a completingSample
        //  previously, must now be COMPLETED
        // NOTE: if ever change this to output different status as well (and / or
        //  currentSamplingAction), then need to review references to this hook to make sure
        //  behavior doesn't change (i.e. actionButtons)
        if (stage !== actionStages.COMPLETING && completingSamples.includes(current.sampleId)) {
          stage = actionStages.COMPLETED;
        }

        return {
          action: current,
          status,
          stage
        }
      });

    pendingTransactions.forEach((tx) => {
      if (tx.key === 'SampleDepositStart') {
        if (tx.vars.lot?.id === lotId && tx.vars.caller_crew?.id === crew?.id) {
          const current = { ...template };
          current.isNew = true;
          current.owner = tx.vars.caller_crew.id;
          current.origin = tx.vars.origin;
          current.originSlot = tx.vars.origin_slot;
          current.resourceId = tx.vars.resource;
          current.sampleId = null;

          activeSamples.push({
            action: current,
            status: 'SAMPLING',
            stage: actionStages.STARTING
          })
        }
      } else if (['PurchaseDepositAndImprove', 'SampleDepositImprove'].includes(tx.key)) {
        const pendingImprovementSample = lot?.deposits?.find((d) => d.id === tx.vars.deposit?.id);
        if (pendingImprovementSample) {
          const current = {
            ...template,
            finishTime: pendingImprovementSample.Deposit.finishTime,
            isNew: false,
            owner: pendingImprovementSample.Control.controller.id,
            resourceId: pendingImprovementSample.Deposit.resource,
            sampleId: pendingImprovementSample.id,
            origin: tx.vars.origin,
            originSlot: tx.vars.origin_slot,
            origin: tx.vars.origin,
          };

          const alreadySample = activeSamples.find((a) => a.action.sampleId === pendingImprovementSample.id);
          if (alreadySample) {
            Object.keys(current).forEach((k) => {
              alreadySample.action[k] = current[k];
            });
            alreadySample.status = 'SAMPLING';
            alreadySample.stage = actionStages.STARTING;
          } else {
            activeSamples.push({
              action: current,
              status: 'SAMPLING',
              stage: actionStages.STARTING
            })
          }
        }
      }
    });

    return [
      activeSamples.filter((c) => c.stage !== actionStages.COMPLETED),
      activeSamples.filter((c) => c.stage === actionStages.COMPLETED),
      Date.now()
    ];
  }, [actionItems, blockTime, completingSamples, pendingTransactions, getPendingTx, getStatus, payload, lot?.deposits]);

  const startSampling = useCallback((resourceId, coreDrillSource) => {
    const source = coreDrillSource || getStarterCoreSampleSource(crew);
    if (!source) return;

    execute('SampleDepositStart', {
      resource: resourceId,
      origin: { id: source.id, label: source.label },
      origin_slot: source.slot,
      ...payload
    })
  }, [crew, execute, payload]);

  const startImproving = useCallback((depositId, coreDrillSource, depositOwnerCrew) => {
    const sample = (lot?.deposits || []).find((c) => c.id === depositId);
    execute(
      depositOwnerCrew ? 'PurchaseDepositAndImprove' : 'SampleDepositImprove',
      {
        ...payload,
        deposit: { id: depositId, label: Entity.IDS.DEPOSIT },
        origin: { id: coreDrillSource.id, label: coreDrillSource.label },
        origin_slot: coreDrillSource.slot,
        recipient: depositOwnerCrew?.Crew?.delegatedTo,
        price: sample.PrivateSale?.amount || 0
      },
      {
        lotId,
        resource: sample?.Deposit?.resource
      }
    )
  }, [execute, lotId, payload]);

  const finishSampling = useCallback((sampleId) => {
    const selectedAction = currentSamplings.find((c) => c.action?.sampleId === sampleId);
    if (!selectedAction) return;
    execute(
      'SampleDepositFinish',
      {
        deposit: { id: selectedAction.action?.sampleId, label: Entity.IDS.DEPOSIT },
        ...payload
      },
      { lotId, isNew: selectedAction.action?.isNew }
    )
  }, [currentSamplings, execute, payload]);

  return {
    currentSamplingActions: currentSamplings,
    completedSamplingActions: completedSamplings,
    currentVersion: currentSamplingsVersion,

    startSampling,
    startImproving,
    finishSampling,
  }
};

export default useCoreSampleManager;
