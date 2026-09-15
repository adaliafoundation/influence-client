import { useCallback, useMemo } from 'react';
import { Asteroid, Building, Deposit, Lot, Product } from '@influenceth/sdk';

import { NewCoreSampleIcon, ImproveCoreSampleIcon } from '~/components/Icons';
import useCoreSampleManager from '~/hooks/actionManagers/useCoreSampleManager';
import useStore from '~/hooks/useStore';
import actionStage from '~/lib/actionStages';
import { formatFixed } from '~/lib/utils';
import ActionButton, { getCrewDisabledReason } from './ActionButton';
import ActionButtonStack from './ActionButtonStack';
import useCoachmarkRefSetter from '~/hooks/useCoachmarkRefSetter';
import { COACHMARK_IDS } from '~/contexts/CoachmarkContext';

const labelDict = {
  READY: 'Start Core Sample',
  SAMPLING: 'Sampling...',
  READY_TO_FINISH: 'Analyze Sample',
  FINISHING: 'Analyzing...'
};

const isVisible = ({ asteroid, crew, lot, openHudMenu }) => {
  // if asteroid has been scanned, can core sample...
  // (only offer as main button if no building or the building is an extractor)
  // (can still zoom to lot and do through resources panel)
  return crew && asteroid && lot
    && asteroid.Celestial.scanStatus === Asteroid.SCAN_STATUSES.RESOURCE_SCANNED
    && (
      // (operational or planned extractor)
      lot?.building?.Building?.buildingType === Building.IDS.EXTRACTOR
      || openHudMenu === 'RESOURCES'
    );
};

const NewCoreSample = ({ asteroid, crew, lot, onSetAction, overrideResourceId, improveSample, simulation, simulationActions, _disabled }) => {
  const defaultResourceId = useStore(s => s.asteroids.resourceMap?.active && s.asteroids.resourceMap?.selected);
  const { currentSamplingActions } = useCoreSampleManager(lot?.id);
  const setCoachmarkRef = useCoachmarkRefSetter();

  const resourceId = overrideResourceId || defaultResourceId;

  const currentSamplingStack = useMemo(() => {
    return (currentSamplingActions || [])
      .map((sampling) => ({
        label: `${labelDict[sampling.status]} (${Product.TYPES[sampling?.action?.resourceId]?.name})`,
        finishTime: [actionStage.IN_PROGRESS, actionStage.READY_TO_COMPLETE].includes(sampling.stage) ? sampling.action?.finishTime : null,
        onClick: () => onSetAction(
          sampling.action?.isNew ? 'NEW_CORE_SAMPLE' : 'IMPROVE_CORE_SAMPLE',
          { sampleId: sampling.action?.sampleId }
        )
      }))
      .sort((a, b) => (a.finishTime || 0) - (b.finishTime || 0));
  }, [currentSamplingActions, onSetAction]);

  // get lot abundance
  const lotAbundance = useMemo(() => {
    if (!resourceId || !asteroid?.Celestial?.abundanceSeed || !asteroid.Celestial?.abundances) return 0;
    return Asteroid.Entity.getAbundanceAtLot(asteroid, Lot.toIndex(lot.id), resourceId);
  }, [asteroid, lot, resourceId]);

  const handleClick = useCallback(() => {
    if (improveSample) {
      onSetAction('IMPROVE_CORE_SAMPLE', { preselect: { ...improveSample, sampleId: improveSample.id } });
    } else {
      onSetAction('NEW_CORE_SAMPLE', resourceId ? { preselect: { resourceId } } : undefined);
    }
  }, [improveSample, onSetAction, resourceId]);

  const disabledReason = useMemo(() => {
    if (_disabled) return 'loading...';
    if (improveSample && improveSample?.Deposit?.status === Deposit.STATUSES.USED) return 'already used';
    if (improveSample && improveSample?.Deposit?.status !== Deposit.STATUSES.SAMPLED) return 'not yet analyzed';
    if (currentSamplingActions.find((c) => c.stage === 'STARTING')) return 'pending';
    return getCrewDisabledReason({
      asteroid,
      crew,
      isSequenceable: true,
      isAllowedInSimulation: simulationActions.includes('CoreSample')
    });
  }, [_disabled, asteroid, crew, currentSamplingActions, improveSample, simulationActions]);

  let label = labelDict.READY;
  if (improveSample) label = 'Improve Core Sample';
  else if (lotAbundance > 0) label += ` (${formatFixed(100 * lotAbundance, 1)}%)`;

  const stackIsImprovement = useMemo(() => {
    return !currentSamplingActions.find((a) => a.action?.isNew);
  }, [currentSamplingActions]);

  return (
    <>
      {currentSamplingStack.length > 0 && (
        <ActionButtonStack
          setRef={setCoachmarkRef(COACHMARK_IDS.actionButtonCoreSample)}
          stack={currentSamplingStack}
          stackLabel={
            currentSamplingStack.length > 1
            ? `${currentSamplingStack.length} Core Samples Started`
            : `${labelDict[currentSamplingStack[0].status]} (${Product.TYPES[currentSamplingStack[0]?.action?.resourceId]?.name})`
          }
          icon={stackIsImprovement ? <ImproveCoreSampleIcon /> : <NewCoreSampleIcon />}
        />
      )}

      {(!simulation || currentSamplingStack.length === 0) && (
        <ActionButton
          ref={setCoachmarkRef(COACHMARK_IDS.actionButtonCoreSample)}
          label={label}
          labelAddendum={disabledReason}
          flags={{
            attention: simulation && !disabledReason,
            disabled: disabledReason
          }}
          icon={improveSample ? <ImproveCoreSampleIcon /> : <NewCoreSampleIcon />}
          onClick={handleClick}
          sequenceDelay={!crew?._ready ? crew?.Crew?.readyAt : null} />
      )}
    </>
  );
};

const actionDefinition = { Component: NewCoreSample, isVisible };

export default actionDefinition;