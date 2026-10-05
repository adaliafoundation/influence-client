import { useCallback, useEffect, useMemo, useState } from 'react';
import { Permission, Asteroid, Crewmate, Deposit, Lot, Product, Time } from '@influenceth/sdk';

import { CoreSampleIcon, ImproveCoreSampleIcon, ResourceIcon, SwayIcon, WarningIcon } from '~/components/Icons';
import ResourceThumbnail from '~/components/ResourceThumbnail';
import useStore from '~/hooks/useStore';
import useCoreSampleManager from '~/hooks/actionManagers/useCoreSampleManager';
import actionStage from '~/lib/actionStages';
import { reactBool, formatTimer, locationsArrToObj, getCrewAbilityBonuses, formatPrice, keyify } from '~/lib/utils';

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
  FlexSectionSpacer, ProgressBarSection,
  CoreSampleSelectionDialog,
  SublabelBanner,
  getTripDetails,
  InventorySelectionDialog,
  Section,
  SectionTitle,
  SectionBody,
  formatTimeRequirements
} from './components';
import { ActionDialogInner, theming, useAsteroidAndLot } from '../ActionDialog';
import useEntity from '~/hooks/useEntity';
import useActionCrew from '~/hooks/useActionCrew';
import useCrew from '~/hooks/useCrew';
import { TextInputWrapper } from '~/components/TextInputUncontrolled';
import CrewIndicator from '~/components/CrewIndicator';
import styled from 'styled-components';
import theme from '~/theme';
import useCrewContext from '~/hooks/useCrewContext';

const InputLabel = styled.div`
  align-items: center;
  color: #888;
  display: flex;
  flex-direction: row;
  font-size: 14px;
  margin-bottom: 3px;
  & > label {
    flex: 1;
  }
  & > span {
    b {
      color: white;
      font-weight: normal;
    }
  }
`;

const Warning = styled.div`
  align-items: center;
  color: ${p => p.theme.colors.main};
  display: flex;
  flex-direction: row;
  font-size: 13px;
  margin-top: 8px;
  & > span:first-child {
    margin-right: 8px;
    width: 16px;
  }
`;

// TODO: combine this ui with "NewCoreSample" dialog if possible
const ImproveCoreSample = ({ asteroid, lot, coreSampleManager, currentSamplingAction, stage, ...props }) => {
  const { startImproving, finishSampling } = coreSampleManager;
  const crew = useActionCrew(currentSamplingAction);
  const { accountCrewIds, crewCan, crewAuthorization } = useCrewContext();

  const dispatchResourceMapSelect = useStore(s => s.dispatchResourceMapSelect);
  const resourceMap = useStore(s => s.asteroids.resourceMap);

  const prepop = useMemo(() => ({
    sampleId: currentSamplingAction?.sampleId || props.preselect?.sampleId,
    resourceId: currentSamplingAction?.resourceId || props.preselect?.resourceId,
    origin: currentSamplingAction?.origin ? { ...currentSamplingAction.origin } : props.preselect?.origin,
  }), [currentSamplingAction, props.preselect]);

  const { data: originEntity } = useEntity(prepop.origin);

  // if an active sample is detected, set "sample" for remainder of dialog's lifespan
  const [sampleId, setSampleId] = useState(prepop.sampleId);
  const [drillSource, setDrillSource] = useState();
  const [sampleSelectorOpen, setSampleSelectorOpen] = useState(false);
  const [sourceSelectorOpen, setSourceSelectorOpen] = useState(false);

  const improvableSamples = useMemo(() => {
    return (lot?.deposits || [])
      .filter((c) => (
        (c.id === currentSamplingAction?.sampleId)
        || (
          (crewCan(Permission.IDS.USE_DEPOSIT, c) || c.PrivateSale?.amount > 0)
          && c.Deposit.initialYield > 0
          && c.Deposit.status !== Deposit.STATUSES.USED
        )
      ))
      .map((c) => ({ ...c, tonnage: c.Deposit.initialYield * Product.TYPES[c.Deposit.resource].massPerUnit }));
  }, [crewCan, accountCrewIds, lot?.deposits]);

  const [selectedSample, resourceId, initialYieldTonnage] = useMemo(() => {
    const selected = (improvableSamples || []).find((s) => s.id === sampleId);
    const initialYield = selected?.Deposit.initialYield || 0;
    const initialYieldTonnage = initialYield * (Product.TYPES[selected?.Deposit.resource]?.massPerUnit || 0);
    return [
      selected,
      selected?.Deposit.resource,
      initialYieldTonnage
    ];
  }, [improvableSamples, sampleId]);

  const defaultSampleId = prepop.sampleId
    ? improvableSamples.find(s => s.id === prepop.sampleId)?.id
    : (improvableSamples.length === 1 ? improvableSamples[0].id : undefined);
  useEffect(() => {
    setSampleId(selected => currentSamplingAction?.sampleId || selected || defaultSampleId);
  }, [currentSamplingAction?.sampleId, defaultSampleId]);

  const initialDrillLotIndex = originEntity ? locationsArrToObj(originEntity.Location.locations || []).lotIndex : undefined;
  const initialDrillSlot = currentSamplingAction?.originSlot || null;
  useEffect(() => {
    if (initialDrillLotIndex != null) setDrillSource({ lotIndex: initialDrillLotIndex, slot: initialDrillSlot });
  }, [initialDrillLotIndex, initialDrillSlot]);

  const lotAbundance = useMemo(() => {
    if (!resourceId || !asteroid?.Celestial?.abundances || !lot?.id) return 0;
    return Asteroid.Entity.getAbundanceAtLot(asteroid, Lot.toIndex(lot.id), resourceId);
  }, [asteroid, lot, resourceId]);

  const originalYield = useMemo(() => selectedSample?.Deposit?.initialYield, [selectedSample?.id]); // only update on id change
  const originalTonnage = useMemo(() => originalYield ? originalYield * Product.TYPES[selectedSample?.Deposit.resource]?.massPerUnit : 0, [selectedSample, originalYield]);

  useEffect(() => {
    // if open to a different resource map, switch... if a resource map is not open, don't open one
    if (resourceId && resourceMap?.active && resourceMap.selected !== resourceId) {
      dispatchResourceMapSelect(resourceId);
    }
  }, [resourceId, resourceMap]);

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
      lotAbundance ? Deposit.getSampleBounds(lotAbundance, originalYield * 1e3, sampleQualityBonus.totalBonus) : null,
      Time.toRealDurationCeil(Deposit.getSampleTime(sampleTimeBonus.totalBonus), crew?._timeAcceleration)
    ];
  }, [lotAbundance, originalYield, sampleQualityBonus, sampleTimeBonus, crew?._timeAcceleration]);

  const [crewTimeRequirement, taskTimeRequirement] = useMemo(() => {
    if (!asteroid?.id || !crew?._location?.lotId || !lot?.id || !drillSource?.lotIndex) return [];
    const oneWayCrewTravelTime = crewTravelTime / 2;
    const drillTravelTime = Asteroid.getLotTravelTimeReal(
      asteroid.id,
      drillSource?.lotIndex,
      Lot.toIndex(lot.id),
      crewTravelBonus.totalBonus,
      crewDistBonus.totalBonus,
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
  }, [asteroid?.id, crew?._location?.lotId, crew?._timeAcceleration, drillSource?.lotIndex, lot?.id, crewDistBonus, crewTravelBonus]);

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
      label: 'Improved Minimum',
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
      label: 'Improved Maximum',
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

  const isPurchase = useMemo(
    () => selectedSample && crewAuthorization(Permission.IDS.USE_DEPOSIT, selectedSample).status === 'denied' && selectedSample?.PrivateSale?.amount > 0,
    [crewAuthorization, selectedSample]
  );

  const { data: depositOwner } = useCrew(isPurchase ? selectedSample?.Control?.controller?.id : null);

  const onImprove = useCallback(() => {
    if (isPurchase && !depositOwner) return;

    return startImproving(selectedSample?.id, drillSource, depositOwner);
  }, [startImproving, selectedSample, drillSource, isPurchase, depositOwner]);

  const onFinish = useCallback(() => {
    return finishSampling(currentSamplingAction?.sampleId)
  }, [finishSampling, currentSamplingAction]);

  return (
    <>
      <ActionDialogHeader
        action={{
          icon: <ImproveCoreSampleIcon />,
          label: 'Optimize Deposit',
        }}
        actionCrew={crew}
        location={{ asteroid, lot }}
        delayUntil={currentSamplingAction?.startTime || ([actionStage.NOT_STARTED, actionStage.STARTING].includes(stage) ? crew?.Crew?.readyAt : undefined)}
        crewAvailableTime={crewTimeRequirement}
        taskCompleteTime={taskTimeRequirement}
        onClose={props.onClose}
        stage={stage} />

      <ActionDialogBody>
        {stage === actionStage.COMPLETED && (
          <FlexSection>
            <FlexSectionInputBlock
              title="New Result"
              image={<ResourceThumbnail resource={Product.TYPES[resourceId]} tooltipContainer={null} />}
              label={`${Product.TYPES[resourceId]?.name} Deposit`}
              disabled
              style={{ width: '100%' }}
              sublabel={initialYieldTonnage && (
                <SublabelBanner color={theming[actionStage.COMPLETED].highlight}>
                  <ResourceIcon />
                  <span style={{ flex: 1 }}>{formatSampleMass(initialYieldTonnage)}t</span>
                  <b>+{formatSampleMass(initialYieldTonnage - originalTonnage)}t</b>
                </SublabelBanner>
              )}
            />
          </FlexSection>
        )}
        {stage !== actionStage.COMPLETED && (
          <>
            <FlexSection>
              <FlexSectionInputBlock
                title="Deposit"
                image={
                  resourceId
                    ? (
                      <ResourceThumbnail
                        resource={Product.TYPES[resourceId]}
                        tooltipContainer={null}
                        iconBadge={<CoreSampleIcon />}
                        iconBadgeCorner={theme.colors.resources[keyify(Product.TYPES[resourceId].category)]} />
                    )
                    : <EmptyResourceImage iconOverride={<CoreSampleIcon />} />
                }
                isSelected={stage === actionStage.NOT_STARTED}
                label={resourceId ? Product.TYPES[resourceId].name : 'Select'}
                onClick={() => setSampleSelectorOpen(true)}
                disabled={stage !== actionStage.NOT_STARTED}
                sublabel={
                  resourceId
                  ? <><ResourceIcon /> {formatSampleMass(originalTonnage)}t</>
                  : 'Resource'
                }
              />

              <FlexSectionSpacer />

              <FlexSectionInputBlock
                title="Tool"
                image={
                  drillSource
                    ? <ResourceThumbnail badge="1" resource={Product.TYPES[175]} tooltipContainer={null} />
                    : <EmptyResourceImage />
                }
                isSelected={stage === actionStage.NOT_STARTED}
                label={drillSource ? 'Core Drill' : 'Select'} // TODO: same as above, select an origin for tool
                onClick={() => setSourceSelectorOpen(true)}
                disabled={stage !== actionStage.NOT_STARTED}
                sublabel={drillSource ? 'Tool' : 'Select'}
              />
            </FlexSection>

            {stage === actionStage.NOT_STARTED && isPurchase && (
              <Section>
                <SectionTitle>Purchase Deposit</SectionTitle>
                <SectionBody style={{ alignItems: 'center', paddingTop: 5 }}>
                  <div style={{ flex: 1 }}>
                    <InputLabel>
                      <label>Price</label>
                    </InputLabel>
                    <TextInputWrapper>
                      <div style={{ background: '#09191f', color: 'white', fontSize: '26px', padding: '4px 2px', width: '100%' }}>
                        <SwayIcon />{formatPrice(selectedSample.PrivateSale?.amount / 1e6, { fixedPrecision: 4 })}
                      </div>
                    </TextInputWrapper>
                    <Warning>
                      <span><WarningIcon /></span>
                      <span>
                        You are purchasing rights to an entire deposit
                        for optimization before resale or extraction.
                      </span>
                    </Warning>
                  </div>

                  <FlexSectionSpacer />

                  <div style={{ flex: 1, marginTop: 10 }}>
                    <CrewIndicator crew={selectedSample.Control.controller} label="Deposit Sold by" />
                  </div>
                </SectionBody>
              </Section>
            )}
          </>
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
        disabled={stage === actionStage.NOT_STARTED && (!selectedSample || !drillSource || (!crewCan(Permission.IDS.USE_DEPOSIT, selectedSample) && !isPurchase))}
        goLabel={isPurchase ? 'Purchase & Optimize' : 'Optimize'}
        onGo={onImprove}
        finalizeLabel="Analyze"
        isSequenceable
        onFinalize={onFinish}
        stage={stage}
        waitForCrewReady
        {...props} />

      {stage === actionStage.NOT_STARTED && (
        <>
          <CoreSampleSelectionDialog
            options={improvableSamples}
            initialSelection={selectedSample}
            lotId={lot?.id}
            onClose={() => setSampleSelectorOpen(false)}
            onSelected={(s) => setSampleId(s?.id)}
            open={sampleSelectorOpen}
          />

          <InventorySelectionDialog
            asteroidId={asteroid.id}
            otherEntity={lot}
            itemIds={[Product.IDS.CORE_DRILL]}
            isSourcing
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
    const sampleId = props.sampleId || props.preselect?.id;
    return currentSamplingActions.find((c) => c.action?.sampleId === sampleId)
      || completedSamplingActions.find((c) => c.action?.sampleId === sampleId);
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
      <ImproveCoreSample
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
