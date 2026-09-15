import { useCallback, useMemo } from 'react';
import { Deposit, Permission } from '@influenceth/sdk';

import { ExtractionIcon } from '~/components/Icons';
import useExtractionManager from '~/hooks/actionManagers/useExtractionManager';
import ActionButton, { getCrewDisabledReason } from './ActionButton';
import useCrewContext from '~/hooks/useCrewContext';
import useCoachmarkRefSetter from '~/hooks/useCoachmarkRefSetter';
import { COACHMARK_IDS } from '~/contexts/CoachmarkContext';
import { getProcessorLeaseConfig } from '~/lib/utils';

const labelDict = {
  READY: 'Extract Resource',
  EXTRACTING: 'Extracting...',
  READY_TO_FINISH: 'Finish Extraction',
  FINISHING: 'Finishing Extraction...'
};

const isVisible = ({ building, crew }) => {
  // zoomStatus === 'in'?
  return crew && building && building.Extractors?.length > 0;
};

// TODO: for multiple extractors, need one of these (and an extraction manager) per extractor
const Extract = ({ onSetAction, asteroid, blockTime, crew, lot, preselect, simulation, simulationActions, _disabled }) => {
  const { accountCrewIds, crewCan } = useCrewContext();
  const { currentExtraction, extractionStatus } = useExtractionManager(lot?.id);
  const setCoachmarkRef = useCoachmarkRefSetter();

  const handleClick = useCallback(() => {
    onSetAction('EXTRACT_RESOURCE', { preselect });
  }, [onSetAction, preselect]);

  const prepaidLeaseConfig = useMemo(() => {
    return getProcessorLeaseConfig(lot?.building, Permission.IDS.EXTRACT_RESOURCES, crew, blockTime);
  }, [blockTime, crew, lot?.building])

  // badge shows full count of *useable* core samples of crew
  // TODO: this should ideally also check for pending use of samples (i.e. in core sample improvement)
  const myUsableSamples = useMemo(() => {
    // if no access to use extractor, then 0 usable samples
    if (!crewCan(Permission.IDS.EXTRACT_RESOURCES, lot?.building) && !prepaidLeaseConfig) return 0;
    
    // else, samples are usable if i control them or they are for sale
    // TODO: need to check delegation of the deposit controller
    return (lot?.deposits || []).filter((c) => (
      c.Deposit.status >= Deposit.STATUSES.SAMPLED
      && c.Deposit.remainingYield > 0
      && (accountCrewIds?.includes(c.Control.controller.id) || (c.PrivateSale?.amount > 0))
    ));
  }, [accountCrewIds, crewCan, lot?.building, lot?.deposits, prepaidLeaseConfig]);

  // const attention = !_disabled && (extractionStatus === 'READY_TO_FINISH' || (myUsableSamples?.length > 0) && extractionStatus === 'READY');
  const attention = !_disabled && (simulation || extractionStatus === 'READY_TO_FINISH');
  const badge = ((extractionStatus === 'READY' && !preselect) ? myUsableSamples?.length : 0);
  let disabledReason = useMemo(() => {
    if (_disabled) return 'loading...';
    if (extractionStatus === 'READY') {
      const crewDisabledReason = getCrewDisabledReason({
        asteroid,
        blockTime,
        crew,
        isSequenceable: true,
        isAllowedInSimulation: simulationActions.includes('Extract'),
        prepaidLeaseConfig,
        permission: Permission.IDS.EXTRACT_RESOURCES,
        permissionTarget: lot?.building
      });
      if (crewDisabledReason) return crewDisabledReason;
      if (myUsableSamples?.length === 0) return 'requires core sample';
    } else if (!currentExtraction?._isAccessible) {
      return 'in use';
    }
  }, [_disabled, blockTime, crew, currentExtraction, extractionStatus, prepaidLeaseConfig, lot?.building, simulationActions, myUsableSamples?.length]);
  
  const loading = ['EXTRACTING', 'FINISHING'].includes(extractionStatus);
  return (
    <ActionButton
      ref={setCoachmarkRef(COACHMARK_IDS.actionButtonExtract)}
      label={`${labelDict[extractionStatus]}`}
      labelAddendum={disabledReason}
      flags={{
        badge,
        disabled: disabledReason,
        attention: !disabledReason && attention,
        loading,
        finishTime: lot?.building?.Extractors?.[0]?.finishTime
      }}
      icon={<ExtractionIcon />}
      onClick={handleClick}
      prepaidLeaseConfig={prepaidLeaseConfig}
      sequenceDelay={!crew?._ready && extractionStatus === 'READY' ? crew?.Crew?.readyAt : null}
      badgeProps={{ isWide: true, overrideColor: '#a97c4f' }} />
  );
};

const actionDefinition = { Component: Extract, isVisible };

export default actionDefinition;