import useStore from '~/hooks/useStore';
import { reportFailure } from '../../../../lib/errorReporting';
import { errorMessages } from '../../../../lib/errorMessages';
import { useMissionActionDetails } from '~/contexts/MissionActionContext';
import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { Building } from '@influenceth/sdk';

import { PlanBuildingIcon } from '~/components/Icons';
import useCrewContext from '~/hooks/useCrewContext';
import theme from '~/theme';
import useConstructionManager from '~/hooks/actionManagers/useConstructionManager';
import { reactBool, formatTimer } from '~/lib/utils';

import { ActionDialogInner, useAsteroidAndLot } from '../ActionDialog';
import {
  BuildingRequirementsSection,

  ActionDialogFooter,
  ActionDialogHeader,
  ActionDialogStats,

  FlexSection,
  FlexSectionInputBlock,
  BuildingImage,
  EmptyBuildingImage,
  SitePlanSelectionDialog,
  ProgressBarSection,
  ActionDialogBody,
  getBuildingRequirements,
  formatTimeRequirements
} from './components';
import actionStage from '~/lib/actionStages';
import useSimulationState from '~/hooks/useSimulationState';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';

const MouseoverWarning = styled.span`
  & b { color: ${theme.colors.error}; }
  & em { font-weight: bold; font-style: normal; color: white; }
`;

const PlanBuilding = ({ asteroid, lot, constructionManager, stage, ...props }) => {
  const { currentConstructionAction, planConstruction, planningEligibility } = constructionManager;
  const { crew } = useCrewContext();

  const [buildingType, setBuildingType] = useState();
  useMissionActionDetails(useMemo(() => ({ buildingType }), [buildingType]));

  const crewTimeRequirement = useMemo(() => formatTimeRequirements([[0, 'Initiate Building Plan']]), []);
  const stats = [{ label: 'Task Duration', value: formatTimer(0), isTimeStat: true }];
  const createAlert = useStore(s => s.dispatchAlertLogged);
  const [submitting, setSubmitting] = useState(false);
  const onPlan = async () => {
    setSubmitting(true);
    try {
      const result = await planConstruction(buildingType);
      if (result?.status && result.status !== 'allowed') reportFailure(createAlert, result, { message: result.status === 'blocked' || result.status === 'denied' ? 'accessChanged' : 'accessUnavailable' });
    } catch (error) {
      reportFailure(createAlert, error, { message: 'accessUnavailable' });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (currentConstructionAction?.buildingType) setBuildingType(currentConstructionAction.buildingType)
  }, [currentConstructionAction?.buildingType]);

  const [siteSelectorOpen, setSiteSelectorOpen] = useState();
  const onBuildingSelected = (type) => {
    setBuildingType(type);
    setSiteSelectorOpen();
  }

  const buildingRequirements = useMemo(() => getBuildingRequirements({ Building: { buildingType } }), [buildingType]);

  return (
    <>
      <ActionDialogHeader
        action={{
          icon: <PlanBuildingIcon />,
          label: 'Create Building Site',
        }}
        actionCrew={crew}
        location={{ asteroid, lot }}
        crewAvailableTime={crewTimeRequirement}
        onClose={props.onClose}
        stage={stage} />

      <ActionDialogBody>
        <FlexSection>
          <FlexSectionInputBlock
            title="Building Site"
            image={
              buildingType
                ? <BuildingImage buildingType={buildingType} unfinished />
                : <EmptyBuildingImage iconOverride={<PlanBuildingIcon />} />
            }
            isSelected={stage === actionStage.NOT_STARTED}
            label={buildingType ? Building.TYPES[buildingType].name : 'Select'}
            onClick={() => setSiteSelectorOpen(true)}
            disabled={stage !== actionStage.NOT_STARTED}
            sublabel="Site"
          />
        </FlexSection>

        {buildingType && stage === actionStage.NOT_STARTED && (
          <BuildingRequirementsSection
            label="Required Materials"
            mode="simple"
            requirements={buildingRequirements}
            requirementsMet />
        )}

        {stage === actionStage.NOT_STARTED && (
          <ProgressBarSection
            overrides={{
              barColor: buildingType ? theme.colors.main : '#bbbbbb',
              color: buildingType ? '#ffffff' : undefined,
              left: `Site Timer`,
              right: formatTimer(Building.GRACE_PERIOD)
            }}
            stage={stage}
            title="Staging Time"
            tooltip={(
              <MouseoverWarning>
                <em>Building Sites</em> are used to stage materials before construction. If you are the <em>Lot Contoller</em>,
                any assets moved to the building site are protected for the duration of the <em>Site Timer</em>.
                <br/><br/>
                A site is designated as <b>Abandoned</b> if it has not started construction before the
                timer expires. Materials left on an <b>Abandoned Site</b> are public, and are thus subject to
                be claimed by other players!
                <br/><br/>
                If you are not the <em>Lot Contoller</em>, the <em>Lot Contoller</em> may takeover your Building Site and its
                materials at any time (even before the <em>Site Timer</em> elapses).
              </MouseoverWarning>
            )}
          />
        )}


        <ActionDialogStats
          stage={stage}
          stats={stats}
        />
      </ActionDialogBody>

      {planningEligibility.reason && <p role="status">{planningEligibility.reason}</p>}
      <ActionDialogFooter
        {...props}
        crewAvailableTime={crewTimeRequirement}
        disabled={!buildingType || submitting || planningEligibility.status !== 'allowed'}
        goLabel="Create Site"
        onGo={onPlan}
        stage={stage}
        waitForCrewReady={false} />

      {stage === actionStage.NOT_STARTED && (
        <SitePlanSelectionDialog
          initialSelection={buildingType}
          onClose={() => setSiteSelectorOpen(false)}
          onSelected={onBuildingSelected}
          open={siteSelectorOpen}
        />
      )}
    </>
  );
};

const Wrapper = (props) => {
  const { asteroid, lot, isLoading } = useAsteroidAndLot(props);
  const constructionManager = useConstructionManager(lot?.id);
  const { stageByActivity } = constructionManager;

  const simulationEnabled = useSimulationEnabled();
  const simulation = useSimulationState();

  useEffect(() => {
    if (!asteroid || !lot) {
      if (!isLoading) {
        if (props.onClose) props.onClose();
      }
    }
  }, [asteroid, lot, isLoading]);

  // stay in this window until PLANNED, then swap to CONSTRUCT
  useEffect(() => {
    if (!['READY_TO_PLAN', 'PLANNING'].includes(constructionManager.constructionStatus)) {
      if (simulationEnabled && !simulation?.canFastForward) {
        if (props.onClose) props.onClose();
      } else {
        props.onSetAction('CONSTRUCT');
      }
    }
  }, [constructionManager.constructionStatus]);

  return (
    <ActionDialogInner
      actionImage="ConstructionPlan"
      isLoading={reactBool(isLoading)}
      stage={stageByActivity.plan}>
      <PlanBuilding
        asteroid={asteroid}
        lot={lot}
        constructionManager={constructionManager}
        stage={stageByActivity.plan}
        {...props} />
    </ActionDialogInner>
  )
};

export default Wrapper;
