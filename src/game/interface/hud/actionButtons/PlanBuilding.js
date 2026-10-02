import { useCallback, useMemo } from 'react';

import { PlanBuildingIcon } from '~/components/Icons';
import useConstructionManager from '~/hooks/actionManagers/useConstructionManager';
import ActionButton, { getCrewDisabledReason } from './ActionButton';
import { COACHMARK_IDS } from '~/contexts/CoachmarkContext';
import useCoachmarkRefSetter from '~/hooks/useCoachmarkRefSetter';

const labelDict = {
  READY_TO_PLAN: 'Create Building Site',
  PLANNING: 'Creating Site...'
};

const isVisible = ({ constructionStatus, crewControls, crew, lot, ship }) => {
  if (lot?.building?.Building?.status > 0) return false;
  return crew && lot && !ship && (
    constructionStatus === 'READY_TO_PLAN'
    || (
      crewControls(lot?.building)
      && constructionStatus === 'PLANNING'
    )
  );
};

const PlanBuilding = ({ asteroid, blockTime, crew, lot, onSetAction, simulation, simulationActions, _disabled }) => {
  const { constructionStatus, planningEligibility } = useConstructionManager(lot?.id);
  const setCoachmarkRef = useCoachmarkRefSetter();
  const handleClick = useCallback(() => {
    onSetAction('PLAN_BUILDING');
  }, [onSetAction]);

  const disabledReason = useMemo(() => {
    if (_disabled) return 'loading...';
    if (constructionStatus === 'READY_TO_PLAN') {
      if (planningEligibility.status !== 'allowed') return planningEligibility.reason;
      return getCrewDisabledReason({
        asteroid,
        crew,
        isAllowedInSimulation: simulationActions.includes('PlanBuilding'),
        requireReady: false
      });
    }
  }, [_disabled, asteroid, constructionStatus, crew, planningEligibility, simulationActions]);

  return (
    <ActionButton
      ref={setCoachmarkRef(COACHMARK_IDS.actionButtonPlan)}
      label={labelDict[constructionStatus] || undefined}
      labelAddendum={disabledReason}
      flags={{
        attention: simulation && !disabledReason,
        disabled: disabledReason,
        loading: constructionStatus === 'PLANNING'
      }}
      icon={<PlanBuildingIcon />}
      onClick={handleClick} />
  );
};

const actionDefinition = { Component: PlanBuilding, isVisible };

export default actionDefinition;
