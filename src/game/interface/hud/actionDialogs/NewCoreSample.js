import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Asteroid, Crewmate, Deposit, Lot, Product, Time } from '@influenceth/sdk';

import { NewCoreSampleIcon, ResourceIcon } from '~/components/Icons';
import ResourceThumbnail from '~/components/ResourceThumbnail';
import useStore from '~/hooks/useStore';
import useCoreSampleManager from '~/hooks/actionManagers/useCoreSampleManager';
import actionStage from '~/lib/actionStages';
import { hasStarterCoreSampleEntitlement } from '~/lib/starterPacks';
import { reactBool, formatFixed, formatTimer, locationsArrToObj, getCrewAbilityBonuses } from '~/lib/utils';

import {
  ActionDialogBody,

  ActionDialogFooter,
  ActionDialogHeader,
  ActionDialogStats,

  getBonusDirection,
  formatSampleMass,
  TravelBonusTooltip,
  TimeBonusTooltip,
  MaterialBonusTooltip,
  EmptyResourceImage,
  FlexSection,
  FlexSectionInputBlock,
  FlexSectionSpacer,
  ResourceSelectionDialog,
  ProgressBarSection,
  SublabelBanner,
  getTripDetails,
  InventorySelectionDialog,
  formatTimeRequirements,
} from './components';
import { ActionDialogInner, theming, useAsteroidAndLot } from '../ActionDialog';
import useEntity from '~/hooks/useEntity';
import useActionCrew from '~/hooks/useActionCrew';

const NewCoreSample = ({ asteroid, lot, coreSampleManager, currentSamplingAction, stage, ...props }) => {
  const { startSampling, finishSampling } = coreSampleManager;
  const crew = useActionCrew(currentSamplingAction);
  const hasCoreSampleEntitlement = hasStarterCoreSampleEntitlement(crew);
  const usingCoreSampleEntitlement = hasCoreSampleEntitlement || !!(
    currentSamplingAction && !currentSamplingAction.origin?.id
  );

  const dispatchResourceMapSelect = useStore(s => s.dispatchResourceMapSelect);
  const dispatchResourceMapToggle = useStore(s => s.dispatchResourceMapToggle);
  const resourceMap = useStore(s => s.asteroids.resourceMap);

  const prepop = useMemo(() => ({
    origin: currentSamplingAction?.origin ? { ...currentSamplingAction.origin } : props.preselect?.origin,
    resourceId: props.preselect?.resourceId || ((resourceMap?.active && resourceMap?.selected) || undefined)
  }), [currentSamplingAction, props.preselect, resourceMap]);

  const { data: originEntity } = useEntity(prepop.origin);

  // if an active sample is detected, set "sample" for remainder of dialog's lifespan
  const [sampleId, setSampleId] = useState();
  const [resourceId, setResourceId] = useState(prepop.resourceId);
  const [drillSource, setDrillSource] = useState();
  const [resourceSelectorOpen, setResourceSelectorOpen] = useState(false);
  const [sourceSelectorOpen, setSourceSelectorOpen] = useState(false);

  useEffect(() => {
    if (currentSamplingAction) {
      setSampleId(currentSamplingAction.sampleId);
      if (currentSamplingAction.resourceId !== resourceId) {
        setResourceId(currentSamplingAction.resourceId)
      }
      if (currentSamplingAction.resourceId && resourceMap?.active && currentSamplingAction.resourceId !== resourceMap?.selected) {
        dispatchResourceMapSelect(currentSamplingAction.resourceId);
        dispatchResourceMapToggle(true);
      }
    }
    if (originEntity) {
      const { lotIndex } = locationsArrToObj(originEntity.Location?.locations || []);
      setDrillSource({
        lotIndex,
        slot: currentSamplingAction?.originSlot || null
      });
    }
  }, [currentSamplingAction, originEntity]);

  const onSelectResource = useCallback((r) => {
    setResourceId(r);

    // if open to a different resource map, switch... if a resource map is not open, don't open one
    if (resourceMap?.active && resourceMap.selected !== r) {
      dispatchResourceMapSelect(r);
    }
  }, [resourceMap?.active]);

  const [, initialYieldTonnage]  = useMemo(() => {
    if (lot?.deposits && resourceId && sampleId) {
      const thisSample = lot.deposits.find((s) => s.id === sampleId);
      if (thisSample) {
        const initialYieldTonnage = thisSample.Deposit.initialYield
          ? thisSample.Deposit.initialYield * Product.TYPES[resourceId].massPerUnit
          : undefined;
        return [thisSample, initialYieldTonnage];
      }
    }
    return [null, 0];
  }, [lot?.deposits, sampleId, resourceId]);

  // get lot abundance
  const lotAbundances = useMemo(() => {
    if (!asteroid?.Celestial?.abundances || !lot?.id) return {};

    // TODO: do this in worker? takes about 200ms on decent cpu
    const lotIndex = Lot.toIndex(lot.id);
    const abundances = Asteroid.Entity.getAbundances(asteroid);
    return Object.keys(abundances).reduce((acc, r) => {
      if (abundances[r] > 0) {
        acc[r] = Asteroid.Entity.getAbundanceAtLot(asteroid, lotIndex, r)
      }
      return acc;
    }, {});
  }, [asteroid, lot]);

  const lotAbundance = resourceId ? lotAbundances[resourceId] : 0;

  const [crewTravelBonus, crewDistBonus, sampleQualityBonus, sampleTimeBonus] = useMemo(() => {
    const bonusIds = [
      Crewmate.ABILITY_IDS.HOPPER_TRANSPORT_TIME,
      Crewmate.ABILITY_IDS.FREE_TRANSPORT_DISTANCE,
      Crewmate.ABILITY_IDS.CORE_SAMPLE_QUALITY,
      Crewmate.ABILITY_IDS.CORE_SAMPLE_TIME
    ];

    const abilities = getCrewAbilityBonuses(bonusIds, crew);
    return bonusIds.map((id) => abilities[id] || {});
  }, [crew]);

  const { totalTime: crewTravelTime, tripDetails } = useMemo(() => {
    if (!asteroid?.id || !crew?._location?.lotId || !lot?.id) return {};
    const crewLotIndex = Lot.toIndex(crew?._location?.lotId);
    return getTripDetails(asteroid.id, crewTravelBonus, crewDistBonus, crewLotIndex, [
      { label: 'Travel to Sampling Site', lotIndex: Lot.toIndex(lot.id) },
      { label: 'Return to Crew Station', lotIndex: crewLotIndex },
    ], crew?._timeAcceleration);
  }, [asteroid?.id, lot?.id, crew?._location?.lotId, crew?._timeAcceleration, crewTravelBonus, crewDistBonus]);

  const [sampleBounds, sampleTime] = useMemo(() => {
    return [
      lotAbundance ? Deposit.getSampleBounds(lotAbundance, 0, sampleQualityBonus.totalBonus) : null,
      Time.toRealDuration(Deposit.getSampleTime(sampleTimeBonus.totalBonus), crew?._timeAcceleration)
    ];
  }, [lotAbundance, sampleQualityBonus, sampleTimeBonus, crew?._timeAcceleration]);

  const [crewTimeRequirement, taskTimeRequirement] = useMemo(() => {
    if (
      !asteroid?.id
      || !crew?._location?.lotId
      || !lot?.id
      || (!drillSource?.lotIndex && !usingCoreSampleEntitlement)
    ) return [];
    const oneWayCrewTravelTime = crewTravelTime / 2;
    const drillTravelTime = usingCoreSampleEntitlement
      ? oneWayCrewTravelTime
      : Time.toRealDuration(
        Asteroid.getLotTravelTime(
          asteroid.id,
          drillSource.lotIndex,
          Lot.toIndex(lot.id),
          crewTravelBonus.totalBonus,
          crewDistBonus.totalBonus
        ),
        crew?._timeAcceleration
      );

    return [
      [
        [oneWayCrewTravelTime, 'Travel to Site'],
        drillTravelTime > oneWayCrewTravelTime ? [drillTravelTime - oneWayCrewTravelTime, 'Delay for Core Drill Arrival'] : null,
        [sampleTime, 'Perform Core Sample'],
        [oneWayCrewTravelTime, 'Return to Station'],
      ],
      [
        [drillTravelTime, 'Core Drill Delivery'],
        oneWayCrewTravelTime > drillTravelTime ? [oneWayCrewTravelTime - drillTravelTime, 'Delay for Crew Arrival'] : null,
        [sampleTime, 'Perform Core Sample'],
      ]
    ].map(formatTimeRequirements);
  }, [asteroid?.id, crew?._location?.lotId, crew?._timeAcceleration, drillSource?.lotIndex, lot?.id, crewDistBonus, crewTravelBonus, usingCoreSampleEntitlement]);

  const stats = useMemo(() => ([
    {
      label: 'Crew Travel',
      value: formatTimer(crewTravelTime),
      direction: getBonusDirection(crewTravelBonus),
      isTimeStat: true,
      timeAcceleration: crew?._timeAcceleration,
      tooltip: (
        <TravelBonusTooltip
          bonus={crewTravelBonus}
          totalTime={crewTravelTime}
          tripDetails={tripDetails}
          crewRequired="duration" />
      )
    },
    {
      label: 'Sample Time',
      value: formatTimer(sampleTime),
      direction: getBonusDirection(sampleTimeBonus),
      isTimeStat: true,
      timeAcceleration: crew?._timeAcceleration,
      tooltip: sampleTimeBonus.totalBonus !== 1 && (
        <TimeBonusTooltip
          bonus={sampleTimeBonus}
          title="Sample Time"
          totalTime={sampleTime}
          crewRequired="duration" />
      )
    },
    {
      label: 'Discovery Minimum',
      value: sampleBounds ? `${formatSampleMass(sampleBounds?.lower)} tonnes` : '',
      direction: sampleQualityBonus.totalBonus > 1 ? getBonusDirection(sampleQualityBonus) : 0,
      tooltip: sampleQualityBonus.totalBonus > 1 && (
        <MaterialBonusTooltip
          bonus={sampleQualityBonus}
          title="Minimum Yield"
          titleValue={`${formatSampleMass(sampleBounds?.lower)} tonnes`} />
      )
    },
    {
      label: 'Discovery Maximum',
      value: sampleBounds ? `${formatSampleMass(sampleBounds?.upper)} tonnes` : '',
      direction: sampleQualityBonus.totalBonus < 1 ? getBonusDirection(sampleQualityBonus) : 0,
      tooltip: sampleQualityBonus.totalBonus < 1 && (
        <MaterialBonusTooltip
          bonus={sampleQualityBonus}
          title="Maximum Yield"
          titleValue={`${formatSampleMass(sampleBounds?.upper)} tonnes`} />
      )
    },
  ]), [crew?._timeAcceleration, crewTravelBonus, crewTravelTime, sampleBounds, sampleQualityBonus, sampleTime, tripDetails]);

  // handle auto-closing
  const miniStatus = useRef();
  useEffect(() => {
    let newMiniStatus = 1;
    if (currentSamplingAction) newMiniStatus = 2;
    if (currentSamplingAction?.sampleId) newMiniStatus = 3;

    // (close on status change from no sampleId to sampleId)
    if (miniStatus.current && miniStatus.current !== newMiniStatus) {
      props.onClose();
    }

    miniStatus.current = newMiniStatus;
  }, [currentSamplingAction]);

  const onFinish = useCallback(() => {
    finishSampling(currentSamplingAction?.sampleId)
  }, [finishSampling, currentSamplingAction]);

  return (
    <>
      <ActionDialogHeader
        action={{
          icon: <NewCoreSampleIcon />,
          label: 'Prospect',
        }}
        actionCrew={crew}
        location={{ asteroid, lot }}
        delayUntil={currentSamplingAction?.startTime || crew?.Crew?.readyAt}
        crewAvailableTime={crewTimeRequirement}
        taskCompleteTime={taskTimeRequirement}
        onClose={props.onClose}
        stage={stage} />

      <ActionDialogBody>
        {stage === actionStage.COMPLETED && (
          <FlexSection>
            <FlexSectionInputBlock
              title="Discovered"
              image={<ResourceThumbnail resource={Product.TYPES[resourceId]} tooltipContainer={null} />}
              label={`${Product.TYPES[resourceId]?.name} Deposit`}
              disabled
              style={{ width: '100%' }}
              sublabel={initialYieldTonnage && (
                <SublabelBanner color={theming[actionStage.COMPLETED].highlight}>
                  <ResourceIcon /> {formatSampleMass(initialYieldTonnage)}t
                </SublabelBanner>
              )}
            />
          </FlexSection>
        )}
        {stage !== actionStage.COMPLETED && (
          <FlexSection>
            <FlexSectionInputBlock
              title="Resource"
              image={
                resourceId
                  ? <ResourceThumbnail resource={Product.TYPES[resourceId]} tooltipContainer={null} />
                  : <EmptyResourceImage iconOverride={<ResourceIcon />} />
              }
              isSelected={stage === actionStage.NOT_STARTED}
              label={resourceId ? Product.TYPES[resourceId].name : 'Select'}
              onClick={() => setResourceSelectorOpen(true)}
              disabled={stage !== actionStage.NOT_STARTED}
              sublabel={
                resourceId
                ? <><b style={{ color: 'white' }}>{formatFixed(100 * lotAbundance, 1)}%</b> Lot Abundance</>
                : 'Resource'
              }
            />

            <FlexSectionSpacer />

            <FlexSectionInputBlock
              title="Tool"
              image={
                drillSource || usingCoreSampleEntitlement
                  ? <ResourceThumbnail badge="1" resource={Product.TYPES[Product.IDS.CORE_DRILL]} tooltipContainer={null} />
                  : <EmptyResourceImage />
              }
              isSelected={stage === actionStage.NOT_STARTED && !hasCoreSampleEntitlement}
              label={drillSource || usingCoreSampleEntitlement ? 'Core Drill' : 'Select'}
              onClick={hasCoreSampleEntitlement ? undefined : () => setSourceSelectorOpen(true)}
              disabled={stage !== actionStage.NOT_STARTED || hasCoreSampleEntitlement}
              sublabel={usingCoreSampleEntitlement ? 'Included in Starter Pack' : (drillSource ? 'Tool' : 'Select')}
            />
          </FlexSection>
        )}

        {stage !== actionStage.NOT_STARTED && stage !== actionStage.COMPLETED && (
          <ProgressBarSection
            finishTime={currentSamplingAction?.finishTime}
            startTime={currentSamplingAction?.startTime}
            stage={stage}
            title="Progress"
            totalTime={taskTimeRequirement?.total || 0}
          />
        )}

        <ActionDialogStats
          stage={stage}
          stats={stats} />

      </ActionDialogBody>

      <ActionDialogFooter
        crewAvailableTime={crewTimeRequirement}
        taskCompleteTime={taskTimeRequirement}
        disabled={stage === actionStage.NOT_STARTED && (
          lotAbundance === 0 || (!drillSource && !usingCoreSampleEntitlement)
        )}
        goLabel={hasCoreSampleEntitlement ? 'Prospect with Starter Pack' : 'Prospect'}
        onGo={() => startSampling(resourceId, drillSource)}
        finalizeLabel="Analyze"
        isSequenceable
        onFinalize={onFinish}
        stage={stage}
        waitForCrewReady
        {...props} />

      {stage === actionStage.NOT_STARTED && (
        <>
          <ResourceSelectionDialog
            abundances={lotAbundances}
            initialSelection={resourceId}
            lotId={lot?.id}
            onClose={() => setResourceSelectorOpen(false)}
            onSelected={onSelectResource}
            open={resourceSelectorOpen}
          />

          <InventorySelectionDialog
            asteroidId={asteroid.id}
            otherEntity={lot}
            isSourcing
            itemIds={[Product.IDS.CORE_DRILL]}
            onClose={() => setSourceSelectorOpen(false)}
            onSelected={setDrillSource}
            open={sourceSelectorOpen}
            requirePresenceOfItemIds
          />
        </>
      )}
    </>
  );
};

const Wrapper = (props) => {
  const { asteroid, lot, isLoading } = useAsteroidAndLot(props);
  const coreSampleManager = useCoreSampleManager(lot?.id);
  const { currentSamplingActions, completedSamplingActions } = coreSampleManager;

  const currentSamplingAction = useMemo(() => {
    return props.sampleId
      ? (
        currentSamplingActions.find((c) => c.action?.sampleId === props.sampleId)
        || completedSamplingActions.find((c) => c.action?.sampleId === props.sampleId)
      )
      : currentSamplingActions.find((c) => !c.action?.sampleId);
  }, [completedSamplingActions, currentSamplingActions, props.sampleId]);

  useEffect(() => {
    if (!asteroid || !lot) {
      if (!isLoading) {
        if (props.onClose) props.onClose();
      }
    }
  }, [asteroid, lot, isLoading]);

  const stage = currentSamplingAction?.stage || actionStage.NOT_STARTED;
  return (
    <ActionDialogInner
      actionImage="CoreSample"
      isLoading={reactBool(isLoading)}
      stage={stage}>
      <NewCoreSample
        asteroid={asteroid}
        lot={lot}
        coreSampleManager={coreSampleManager}
        currentSamplingAction={currentSamplingAction?.action}
        stage={stage}
        {...props} />
    </ActionDialogInner>
  )
};

export default Wrapper;
