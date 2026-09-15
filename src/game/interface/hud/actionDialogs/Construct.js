import { useCallback, useEffect, useMemo, useRef } from 'react';
import styled from 'styled-components';
import { Building, Crewmate, Lot, Time } from '@influenceth/sdk';

import {
  ConstructIcon,
  TransferToSiteIcon,
  WarningIcon,
  CheckSmallIcon,
  MarketBuyIcon
} from '~/components/Icons';
import theme, { hexToRGB } from '~/theme';
import useConstructionManager from '~/hooks/actionManagers/useConstructionManager';
import { reactBool, formatTimer, getCrewAbilityBonuses } from '~/lib/utils';
import { hasStarterBuildingEntitlement } from '~/lib/starterPacks';
import {
  BuildingRequirementsSection,
  ActionDialogFooter,
  ActionDialogHeader,
  ActionDialogStats,
  TravelBonusTooltip,
  getBonusDirection,
  TimeBonusTooltip,
  ActionDialogBody,
  FlexSection,
  FlexSectionSpacer,
  ProgressBarSection,
  getBuildingRequirements,
  LotInputBlock,
  getTripDetails,
  LotControlWarning,
  MultiSourceWrapper,
  formatTimeRequirements
} from './components';
import actionStage from '~/lib/actionStages';
import useDeliveryManager from '~/hooks/actionManagers/useDeliveryManager';
import useActionCrew from '~/hooks/useActionCrew';
import Button from '~/components/ButtonAlt';
import AssetBlock from '~/components/AssetBlock';
import useCoachmarkRefSetter from '~/hooks/useCoachmarkRefSetter';
import { COACHMARK_IDS } from '~/contexts/CoachmarkContext';
import { ActionDialogInner, useAsteroidAndLot } from '../ActionDialog';

const MouseoverWarning = styled.span`
  & b { color: ${theme.colors.error}; }
`;

const ReqTitle = styled.div`
  display: flex;
  width: 100%;
  & > span:first-child {
    flex: 1;
  }
  & > span:nth-child(2) {
    color: ${p => p.theme.colors.lightOrange};
  }
`;

const Construct = ({ asteroid, lot, constructionManager, stage, ...props }) => {
  const setCoachmarkRef = useCoachmarkRefSetter();
  const { currentConstructionAction, constructionStatus, startConstruction, finishConstruction, isAtRisk } = constructionManager;
  const { currentDeliveryActions } = useDeliveryManager({ destination: lot?.building });

  const crew = useActionCrew(currentConstructionAction);

  const [crewTravelBonus, crewDistBonus, constructionBonus] = useMemo(() => {
    const bonusIds = [
      Crewmate.ABILITY_IDS.HOPPER_TRANSPORT_TIME,
      Crewmate.ABILITY_IDS.FREE_TRANSPORT_DISTANCE,
      Crewmate.ABILITY_IDS.CONSTRUCTION_TIME
    ];

    const abilities = getCrewAbilityBonuses(bonusIds, crew);
    return bonusIds.map((id) => abilities[id] || {});
  }, [crew]);

  const { totalTime: crewTravelTime, tripDetails } = useMemo(() => {
    if (!asteroid?.id || !crew?._location?.lotId || !lot?.id) return {};
    const crewLotIndex = crew?._location?.asteroidId === asteroid.id ? Lot.toIndex(crew?._location?.lotId) : 0;
    return getTripDetails(asteroid.id, crewTravelBonus, crewDistBonus, crewLotIndex, [
      { label: 'Travel to Construction Site', lotIndex: Lot.toIndex(lot.id) },
      { label: 'Return to Crew Station', lotIndex: crewLotIndex },
    ], crew?._timeAcceleration);
  }, [asteroid?.id, lot?.id, crew?._location?.lotId, crew?._timeAcceleration, crewTravelBonus, crewDistBonus]);

  const constructionTime = useMemo(() =>
    Time.toRealDuration(
      lot?.building?.Building?.buildingType
        ? Building.getConstructionTime(lot?.building?.Building?.buildingType, constructionBonus.totalBonus)
        : 0,
      crew?._timeAcceleration
    ),
    [lot?.building?.Building?.buildingType, constructionBonus.totalBonus, crew?._timeAcceleration]
  );

  const [crewTimeRequirement, taskTimeRequirement] = useMemo(() => {
    const oneWayCrewTravelTime = crewTravelTime / 2;
    return [
      [
        [oneWayCrewTravelTime, 'Travel to Site'],
        [constructionTime / 8, 'On-site Crew Labor'],
        [oneWayCrewTravelTime, 'Return to Station'],
      ],
      [
        [oneWayCrewTravelTime, 'Await Crew Arrival'],
        [constructionTime, 'Building Construction'],
      ]
    ].map(formatTimeRequirements);
  }, [crewTravelTime, constructionTime]);

  const stats = useMemo(() => ([
    {
      label: 'Crew Travel',
      value: formatTimer(crewTravelTime),
      isTimeStat: true,
      direction: getBonusDirection(crewTravelBonus),
      tooltip: (
        <TravelBonusTooltip
          bonus={crewTravelBonus}
          totalTime={crewTravelTime}
          tripDetails={tripDetails}
          crewRequired="start" />
      )
    },
    {
      label: 'Construction Time',
      value: formatTimer(constructionTime),
      isTimeStat: true,
      direction: getBonusDirection(constructionBonus),
      tooltip: constructionBonus.totalBonus !== 1 && (
        <TimeBonusTooltip
          bonus={constructionBonus}
          title="Construction Time"
          totalTime={constructionTime}
          crewRequired="start" />
      )
    },
  ]), [constructionBonus, constructionTime, crewTravelTime, crewTravelBonus, tripDetails]);

  useMemo(() => {
    if (constructionStatus === 'PLANNED') {
      return 'BEFORE';
    } else if (constructionStatus === 'UNDER_CONSTRUCTION') {
      return 'DURING';
    }
    return 'AFTER';
  }, [constructionStatus]);

  // handle auto-closing
  const lastStatus = useRef();
  useEffect(() => {
    // (always close on)
    if (['OPERATIONAL'].includes(constructionStatus)) {
      props.onClose();
    }
    // (close on status change from)
    else if (['PLANNED', 'READY_TO_FINISH'].includes(lastStatus.current)) {
      if (constructionStatus !== lastStatus.current) {
        props.onClose();
      }
    }
    lastStatus.current = constructionStatus;
  }, [constructionStatus]);

  const transferToSite = useCallback(() => {
    props.onSetAction('TRANSFER_TO_SITE', {});
  }, []);

  const purchaseOnMarket = useCallback(() => {
    props.onSetAction('SHOPPING_LIST', {});
  }, []);

  const hasBuildingEntitlement = useMemo(() => hasStarterBuildingEntitlement(
    crew,
    lot?.building?.Building?.buildingType
  ), [crew, lot?.building?.Building?.buildingType]);

  const [buildingRequirements, requirementsMet, waitingOnTransfer] = useMemo(() => {
    const reqs = getBuildingRequirements(lot?.building, constructionStatus === 'PLANNED' ? currentDeliveryActions : []);
    const met = hasBuildingEntitlement || !reqs.find((req) => req.inNeed > 0);
    const wait = !hasBuildingEntitlement && reqs.find((req) => req.inTransit > 0);
    return [reqs, constructionStatus === 'PLANNED' ? met : true, wait];
  }, [lot?.building, constructionStatus, currentDeliveryActions, hasBuildingEntitlement]);

  const displayedBuildingRequirements = useMemo(() => (
    hasBuildingEntitlement
      ? buildingRequirements.map((requirement) => ({
        ...requirement,
        inInventory: requirement.totalRequired,
        inTransit: 0
      }))
      : buildingRequirements
  ), [buildingRequirements, hasBuildingEntitlement]);

  return (
    <>
      <ActionDialogHeader
        action={{
          icon: <ConstructIcon />,
          label: 'Construct Building',
        }}
        actionCrew={crew}
        location={{ asteroid, lot }}
        delayUntil={currentConstructionAction?.startTime || crew?.Crew?.readyAt}
        crewAvailableTime={crewTimeRequirement}
        taskCompleteTime={taskTimeRequirement}
        onClose={props.onClose}
        stage={stage} />

      <ActionDialogBody>
        <FlexSection>
          <LotInputBlock
            lot={lot}
            fallbackSublabel="Building"
            imageProps={{
              iconOverlay: (requirementsMet  && !waitingOnTransfer) ? <CheckSmallIcon /> : <WarningIcon />,
              iconOverlayColor: (requirementsMet  && !waitingOnTransfer) ? theme.colors.green : theme.colors.lightOrange,
              inventory: false,
              iconBorderColor: (requirementsMet  && !waitingOnTransfer) ? `rgba(${hexToRGB(theme.colors.darkGreen)}, 0.5)` : `rgba(${hexToRGB(theme.colors.lightOrange)}, 0.5)`,
            }}
            bodyStyle={(requirementsMet  && !waitingOnTransfer) ? {} : { background: `rgba(${hexToRGB(theme.colors.lightOrange)}, 0.1)` }}
          />

          {!requirementsMet && (
            <>
              <FlexSectionSpacer />

              {/* TODO: disable both buttons if needs are met by incoming deliveries */}
              <MultiSourceWrapper>
                <Button onClick={transferToSite}>
                  <TransferToSiteIcon /> <span>Transfer from Inventory</span>
                </Button>

                {/* TODO: disable if no marketplaces exist */}
                <Button setRef={setCoachmarkRef(COACHMARK_IDS.actionDialogConstructSource)} onClick={purchaseOnMarket}>
                  <MarketBuyIcon /> <span>Source from Market</span>
                </Button>
              </MultiSourceWrapper>
            </>
          )}
        </FlexSection>

        {stage === actionStage.NOT_STARTED &&  (
          <BuildingRequirementsSection
            label={(
              <ReqTitle>
                <span>{hasBuildingEntitlement ? 'Materials included in Starter Pack' : 'Materials On Site'}</span>
                {!(requirementsMet && !waitingOnTransfer) && <span>This site is missing construction materials</span>}
              </ReqTitle>
            )}
            mode="gathering"
            requirementsMet={requirementsMet && !waitingOnTransfer}
            requirements={displayedBuildingRequirements} />
        )}

        {stage === actionStage.NOT_STARTED && (
          <ProgressBarSection
            finishTime={lot?.building?.Building?.plannedAt + Building.GRACE_PERIOD}
            startTime={lot?.building?.Building?.plannedAt}
            isCountDown
            overrides={
              isAtRisk
              ? {
                barColor: theme.colors.error,
                color: theme.colors.error,
                left: <span style={{ display: 'flex', alignItems: 'center' }}><WarningIcon /> <span style={{ marginLeft: 6 }}>Expired</span></span>,
              }
              : {
                barColor: theme.colors.main,
                color: 'white',
                left: <span style={{ display: 'flex', alignItems: 'center' }}><span style={{ marginLeft: 6 }}>Site Timer</span></span>,
              }
            }
            stage={stage}
            title="Staging Time"
            tooltip={(
              <MouseoverWarning>
                Building Sites are used to stage materials before construction. While the{' '}<b>Site Timer</b>
                {' '}is active, any assets moved to the building site are protected. However, a site becomes
                {' '}<b>Abandoned</b>{' '}if it has not started construction when the time expires.
                <br/><br/>
                Warning: Any materials on an{' '}<b>Abandoned Site</b>{' '}become public, and are subject to be
                claimed by other players!
              </MouseoverWarning>
            )}
          />
        )}
        {stage !== actionStage.NOT_STARTED && (
          <ProgressBarSection
            finishTime={currentConstructionAction?.finishTime}
            startTime={currentConstructionAction?.startTime}
            stage={stage}
            title="Progress"
            totalTime={crewTravelTime + constructionTime}
          />
        )}

        <LotControlWarning lot={lot} />

        <ActionDialogStats
          stage={stage}
          stats={stats}
        />

      </ActionDialogBody>

      <ActionDialogFooter
        crewAvailableTime={crewTimeRequirement}
        taskCompleteTime={taskTimeRequirement}
        disabled={!requirementsMet || waitingOnTransfer}
        goLabel={hasBuildingEntitlement ? 'Construct with Starter Pack' : 'Construct'}
        onGo={startConstruction}
        finalizeLabel="Complete"
        isSequenceable
        onFinalize={finishConstruction}
        stage={stage}
        waitForCrewReady
        {...props} />
    </>
  );
};

const Wrapper = (props) => {
  const { asteroid, lot, isLoading } = useAsteroidAndLot(props);
  const constructionManager = useConstructionManager(lot?.id);
  const { stageByActivity } = constructionManager;

  useEffect(() => {
    if (!asteroid || !lot) {
      if (!isLoading) {
        if (props.onClose) props.onClose();
      }
    }
  }, [asteroid, lot, isLoading]);

  return (
    <ActionDialogInner
      actionImage="Construction"
      isLoading={reactBool(isLoading)}
      stage={stageByActivity.construct}>
      <Construct
        asteroid={asteroid}
        lot={lot}
        constructionManager={constructionManager}
        stage={stageByActivity.construct}
        {...props} />
    </ActionDialogInner>
  )
};

export default Wrapper;
