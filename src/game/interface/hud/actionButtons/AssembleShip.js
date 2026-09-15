import { useCallback, useMemo } from 'react';
import { DryDock, Permission } from '@influenceth/sdk';

import { AssembleShipIcon } from '~/components/Icons';
import useDryDockManager from '~/hooks/actionManagers/useDryDockManager';
import ActionButton, { getCrewDisabledReason } from './ActionButton';
import useCoachmarkRefSetter from '~/hooks/useCoachmarkRefSetter';
import { COACHMARK_IDS } from '~/contexts/CoachmarkContext';
import { getProcessorLeaseConfig } from '~/lib/utils';

const labelDict = {
  READY: 'Assemble Ship',
  ASSEMBLING: 'Assembling Ship...',
  READY_TO_FINISH: 'Finish Ship Assembly',
  FINISHING: 'Finishing Ship Assembly...'
};

const isVisible = ({ building, crew }) => {
  return crew && building && building.DryDocks?.length > 0;
};

const AssembleShip = ({ asteroid, blockTime, crew, lot, onSetAction, simulation, simulationActions, _disabled }) => {
  const { assemblyStatus, currentAssembly } = useDryDockManager(lot?.id);
  const setCoachmarkRef = useCoachmarkRefSetter();

  const handleClick = useCallback(() => {
    onSetAction('ASSEMBLE_SHIP');
  }, [onSetAction]);

  const prepaidLeaseConfig = useMemo(() => {
    return getProcessorLeaseConfig(lot?.building, Permission.IDS.ASSEMBLE_SHIP, crew, blockTime);
  }, [blockTime, crew, lot?.building])

  const disabledReason = useMemo(() => {
    if (_disabled) return 'loading...';
    if (assemblyStatus === 'READY') {
      return getCrewDisabledReason({
        asteroid,
        blockTime,
        crew,
        isSequenceable: true,
        isAllowedInSimulation: simulationActions.includes('AssembleShip'),
        prepaidLeaseConfig,
        permission: Permission.IDS.ASSEMBLE_SHIP,
        permissionTarget: lot?.building
      });
    } else if (!currentAssembly?._isAccessible) {
      return 'in use';
    }
  }, [_disabled, assemblyStatus, asteroid, blockTime, crew, currentAssembly, prepaidLeaseConfig, lot?.building, simulationActions]);
  
  const finishTime = lot?.building?.DryDocks.find((dryDock) => dryDock.status === DryDock.STATUSES.RUNNING)?.finishTime;

  return (
    <ActionButton
      ref={setCoachmarkRef(COACHMARK_IDS.actionButtonAssembleShip)}
      label={labelDict[assemblyStatus]}
      labelAddendum={disabledReason}
      flags={{
        disabled: _disabled || disabledReason,
        attention: !_disabled && (simulation || assemblyStatus === 'READY_TO_FINISH'),
        finishTime,
        loading: assemblyStatus === 'ASSEMBLING' || assemblyStatus === 'FINISHING'
      }}
      icon={<AssembleShipIcon />}
      onClick={handleClick}
      prepaidLeaseConfig={prepaidLeaseConfig}
      sequenceDelay={!crew?._ready && assemblyStatus === 'READY' ? crew?.Crew?.readyAt : null} />
  );
};

const actionDefinition = { Component: AssembleShip, isVisible };

export default actionDefinition;