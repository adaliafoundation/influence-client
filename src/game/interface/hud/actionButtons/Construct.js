import { useCallback, useMemo } from 'react';

import { ConstructIcon } from '~/components/Icons';
import useConstructionManager from '~/hooks/actionManagers/useConstructionManager';
import ActionButton, { getCrewDisabledReason } from './ActionButton';
import { COACHMARK_IDS } from '~/contexts/CoachmarkContext';
import useCoachmarkRefSetter from '~/hooks/useCoachmarkRefSetter';

const labelDict = {
  PLANNED: 'Start Construction',
  UNDER_CONSTRUCTION: 'Constructing...',
  READY_TO_FINISH: 'Finish Construction',
  FINISHING: 'Finishing Construction...'
};

const isVisible = ({ accountCrewIds, constructionStatus, lot }) => {
  return lot && lot.building
    && accountCrewIds?.includes(lot.building.Control?.controller?.id)
    && ['PLANNED', 'UNDER_CONSTRUCTION', 'READY_TO_FINISH', 'FINISHING'].includes(constructionStatus);
};

const Construct = ({ asteroid, crew, lot, onSetAction, simulation, simulationActions, _disabled }) => {
  const { constructionStatus } = useConstructionManager(lot?.id);
  const setCoachmarkRef = useCoachmarkRefSetter();
  const handleClick = useCallback(() => {
    onSetAction('CONSTRUCT');
  }, [onSetAction]);

  const disabledReason = useMemo(() => {
    if (_disabled) return 'loading...';
    if (constructionStatus === 'PLANNED') {
      return getCrewDisabledReason({
        asteroid,
        crew,
        isAllowedInSimulation: simulationActions.includes('Construct'),
        isSequenceable: true
      });
    }
    return '';
  }, [_disabled, asteroid, constructionStatus, crew, simulationActions]);

  const attention = !disabledReason && (simulation || constructionStatus === 'READY_TO_FINISH');
  const loading = constructionStatus === 'UNDER_CONSTRUCTION' || constructionStatus === 'FINISHING';
  return (
    <>
      <ActionButton
        ref={setCoachmarkRef(COACHMARK_IDS.actionButtonConstruct)}
        label={labelDict[constructionStatus]}
        labelAddendum={disabledReason}
        flags={{
          disabled: disabledReason,
          attention,
          loading,
          finishTime: lot?.building?.Building?.finishTime
        }}
        icon={<ConstructIcon />}
        onClick={handleClick}
        sequenceDelay={!crew?._ready && constructionStatus === 'PLANNED' ? crew?.Crew?.readyAt : null} />
    </>
  );
};

const actionDefinition = { Component: Construct, isVisible };

export default actionDefinition;