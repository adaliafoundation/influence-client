import { useEffect, useMemo } from 'react';
import { Building, Crewmate, Inventory, Lot } from '@influenceth/sdk';

import {
  DeconstructIcon,
} from '~/components/Icons';
import useCrewContext from '~/hooks/useCrewContext';
import useConstructionManager from '~/hooks/actionManagers/useConstructionManager';
import { reactBool, formatTimer, formatFixed, getCrewAbilityBonuses } from '~/lib/utils';

import { DeconstructionMaterialsSection, ActionDialogFooter, ActionDialogHeader, ActionDialogStats, getBonusDirection, TravelBonusTooltip, ActionDialogBody, ProgressBarSection, FlexSection, getBuildingRequirements, LotInputBlock, MaterialBonusTooltip, formatTimeRequirements } from './components';
import { ActionDialogInner, useAsteroidAndLot } from '../ActionDialog';
import actionStage from '~/lib/actionStages';
import { getTripDetails } from './components';

const Deconstruct = ({ asteroid, lot, constructionManager, stage, ...props }) => {
  const { crew } = useCrewContext();
  const { deconstruct } = constructionManager;

  const crewTravelBonus = useMemo(() => getCrewAbilityBonuses(Crewmate.ABILITY_IDS.HOPPER_TRANSPORT_TIME, crew), [crew]);
  const crewDistBonus = useMemo(() => getCrewAbilityBonuses(Crewmate.ABILITY_IDS.FREE_TRANSPORT_DISTANCE, crew), [crew]);
  const crewDeconstructBonus = useMemo(() => getCrewAbilityBonuses(Crewmate.ABILITY_IDS.DECONSTRUCTION_YIELD, crew), [crew]);
  const deconstructionPenalty = useMemo(() => Building.DECONSTRUCTION_PENALTY / (crewDeconstructBonus?.totalBonus || 1), [crewDeconstructBonus]);

  const { totalTime: crewTravelTime, tripDetails } = useMemo(() => {
    if (!asteroid?.id || !crew?._location?.lotId || !lot?.id) return {};
    const crewLotIndex = Lot.toIndex(crew?._location?.lotId);
    return getTripDetails(asteroid.id, crewTravelBonus, crewDistBonus, crewLotIndex, [
      { label: 'Travel to Site', lotIndex: Lot.toIndex(lot.id) },
      { label: 'Return to Crew Station', lotIndex: crewLotIndex },
    ], crew?._timeAcceleration);
  }, [asteroid?.id, lot?.id, crew?._location?.lotId, crew?._timeAcceleration, crewTravelBonus, crewDistBonus]);

  const crewTimeRequirement = useMemo(() => {
    const oneWayCrewTravelTime = crewTravelTime / 2;
    return formatTimeRequirements([
      [oneWayCrewTravelTime, 'Travel to Site'],
      [0, 'Initiate Deconstruction'],
      [oneWayCrewTravelTime, 'Return to Station'],
    ]);
  }, [crewTravelTime]);

  const stats = useMemo(() => [
    {
      label: 'Crew Travel',
      value: formatTimer(crewTravelTime),
      direction: getBonusDirection(crewTravelBonus),
      isTimeStat: true,
      tooltip: (
        <TravelBonusTooltip
          bonus={crewTravelBonus}
          totalTime={crewTravelTime}
          tripDetails={tripDetails}
          crewRequired="start" />
      )
    },
    {
      label: 'Deconstruction Penalty',
      value: `${formatFixed(100 * deconstructionPenalty, 2)}%`,
      direction: getBonusDirection(crewDeconstructBonus),
      isTimeStat: true,
      tooltip: crewDeconstructBonus.totalBonus !== 1 && (
        <MaterialBonusTooltip
          bonus={crewDeconstructBonus}
          title="Deconstruction Efficiency"
          titleValue={`${formatFixed(100 * crewDeconstructBonus.totalBonus, 1)}%`} />
      )
    },
  ], [crewDeconstructBonus, deconstructionPenalty, tripDetails]);

  const itemsReturned = useMemo(() => {
    if (!lot?.building) return [];
    return getBuildingRequirements(lot?.building).map((item) => ({
      ...item,
      totalRequired: Math.floor((1 - deconstructionPenalty) * item.totalRequired)
    }));
  }, [lot?.building]);

  return (
    <>
      <ActionDialogHeader
        action={{
          icon: <DeconstructIcon />,
          label: 'Deconstruct Building',
          status: stage === actionStage.NOT_STARTED ? 'Confirm' : '',
        }}
        actionCrew={crew}
        location={{ asteroid, lot }}
        crewAvailableTime={crewTimeRequirement}
        onClose={props.onClose}
        stage={stage} />

      <ActionDialogBody>
        <FlexSection>
          <LotInputBlock
            title="Deconstruct"
            lot={lot}
            disabled
          />
        </FlexSection>

        <DeconstructionMaterialsSection
          label="Recovered Materials"
          itemsReturned={itemsReturned || []} />

        {/* TODO: progress bar if this takes time */}
        {stage !== actionStage.NOT_STARTED && (
          <ProgressBarSection
            stage={stage}
            title="Progress"
          />
        )}

        <ActionDialogStats
          stage={stage}
          stats={stats}
        />
      </ActionDialogBody>

      <ActionDialogFooter
        crewAvailableTime={crewTimeRequirement}
        goLabel="Deconstruct"
        onGo={deconstruct}
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
    if (!asteroid || !lot?.building) {
      if (!isLoading) {
        if (props.onClose) props.onClose();
      }
    }
  }, [asteroid, lot, isLoading]);

  // stay in this window until PLANNED (and lot updated), then swap to UNPLAN / SURFACE_TRANSFER
  useEffect(() => {
    if (!['OPERATIONAL', 'DECONSTRUCTING'].includes(constructionManager.constructionStatus)) {
      const siteInventory = (lot?.building?.Inventories || []).find((i) => Inventory.TYPES[i.inventoryType].category === Inventory.CATEGORIES.SITE);
      if (siteInventory?.status === Inventory.STATUSES.AVAILABLE) {
        if (siteInventory?.mass > 0) { // (if materials recovered)
          props.onSetAction('SURFACE_TRANSFER');
        } else {
          props.onSetAction('UNPLAN_BUILDING');
        }
      }
    }
  }, [constructionManager.constructionStatus, lot?.building?.Inventories]);

  return (
    <ActionDialogInner
      actionImage="Construction"
      isLoading={reactBool(isLoading)}
      stage={stageByActivity.deconstruct}>
      <Deconstruct
        asteroid={asteroid}
        lot={lot}
        constructionManager={constructionManager}
        stage={stageByActivity.deconstruct}
        {...props} />
    </ActionDialogInner>
  )
};

export default Wrapper;
