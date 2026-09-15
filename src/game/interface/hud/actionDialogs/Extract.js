import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { Asteroid, Crewmate, Deposit, Extractor, Inventory, Lot, Permission, Product, Time } from '@influenceth/sdk';
import cloneDeep from 'lodash/cloneDeep';

import { CrewCaptainCardFramed } from '~/components/CrewmateCardFramed';
import { AgreementIcon, CoreSampleIcon, ExtractionIcon, InventoryIcon, LocationIcon, ResourceIcon, SwayIcon, WarningIcon } from '~/components/Icons';
import ResourceThumbnail from '~/components/ResourceThumbnail';
import useActionCrew from '~/hooks/useActionCrew';
import useBlockTime from '~/hooks/useBlockTime';
import useCrewContext from '~/hooks/useCrewContext';
import useEntity from '~/hooks/useEntity';
import useExtractionManager from '~/hooks/actionManagers/useExtractionManager';
import useCrew from '~/hooks/useCrew';
import useLot from '~/hooks/useLot';
import useStore from '~/hooks/useStore';
import actionStage from '~/lib/actionStages';
import formatters from '~/lib/formatters';
import { reactBool, formatTimer, locationsArrToObj, getCrewAbilityBonuses, formatFixed, getProcessorLeaseConfig, getProcessorLeaseSelections } from '~/lib/utils';
import theme from '~/theme';
import { ActionDialogInner, theming, useAsteroidAndLot } from '../ActionDialog';
import { ResourceAmountSlider, ActionDialogFooter, ActionDialogHeader, ActionDialogStats, getBonusDirection, formatResourceVolume, formatSampleMass, formatSampleVolume, TravelBonusTooltip, TimeBonusTooltip, ActionDialogBody, FlexSection, FlexSectionInputBlock, EmptyResourceImage, FlexSectionSpacer, Section, SectionTitle, SectionBody, ProgressBarSection, CoreSampleSelectionDialog, SublabelBanner, InventorySelectionDialog, InventoryInputBlock, TransferDistanceDetails, getTripDetails, BuildingInputBlock, LeaseTooltip, LeaseDetailsLabel, BuyingDetailsLabel, AssetSellerIndicator, formatTimeRequirements } from './components';

const SampleAmount = styled.span`
  color: ${p => p.theme.colors.depositSize};
  & > span {
    margin: 0 2px;
    &:last-child {
      color: ${p => p.theme.colors.main};
    }
  }
`;

const Warning = styled.div`
  align-items: center;
  color: ${p => p.theme.colors.main};
  display: flex;
  flex-direction: row;
  font-size: 13px;
  & > span:first-child {
    margin-right: 8px;
    width: 16px;
  }
`;

const Extract = ({ asteroid, lot, extractionManager, stage, ...props }) => {
  const createAlert = useStore(s => s.dispatchAlertLogged);
  const { currentExtraction, extractionStatus, startExtraction, finishExtraction } = extractionManager;
  const crew = useActionCrew(currentExtraction);
  const blockTime = useBlockTime();
  const { accountCrewIds, crewCan } = useCrewContext();

  const [amount, setAmount] = useState(0);
  const [selectedCoreSample, setSelectedCoreSample] = useState();
  const [sampleSelectorOpen, setSampleSelectorOpen] = useState(false);
  const [destinationSelectorOpen, setDestinationSelectorOpen] = useState(false);

  const { data: buildingOwner } = useCrew(lot?.building?.Control?.controller?.id);

  const isPurchase = useMemo(
    () => selectedCoreSample && !accountCrewIds?.includes(selectedCoreSample?.Control?.controller?.id),
    [accountCrewIds, selectedCoreSample?.Control?.controller?.id]
  );
  const { data: depositOwner } = useCrew(isPurchase ? selectedCoreSample?.Control?.controller?.id : null);

  // get destinationLot and destinationInventory
  const [destinationSelection, setDestinationSelection] = useState();
  const { data: destination } = useEntity(destinationSelection ? { id: destinationSelection.id, label: destinationSelection.label } : undefined);
  const destinationLotId = useMemo(() => destination && locationsArrToObj(destination?.Location?.locations || []).lotId, [destination]);
  const { data: destinationLot } = useLot(destinationLotId);
  const destinationInventory = useMemo(() => (destination?.Inventories || []).find((i) => i.slot === destinationSelection?.slot), [destination, destinationSelection]);

  useEffect(() => {
    const defaultSelection = props.preselect || currentExtraction;
    if (defaultSelection?.destination) {
      setDestinationSelection({
        id: defaultSelection?.destination.id,
        label: defaultSelection?.destination.label,
        lotIndex: null,
        slot: defaultSelection?.destinationSlot
      });
    }
  }, [currentExtraction?.destination]);

  const [crewTravelBonus, crewDistBonus, extractionBonus] = useMemo(() => {
    const bonusIds = [
      Crewmate.ABILITY_IDS.HOPPER_TRANSPORT_TIME,
      Crewmate.ABILITY_IDS.FREE_TRANSPORT_DISTANCE,
      Crewmate.ABILITY_IDS.EXTRACTION_TIME,
    ];
    const abilities = getCrewAbilityBonuses(bonusIds, crew);

    // apply asteroid bonus to extraction time
    try {
      const asteroidBonus = Asteroid.Entity.getBonusByResource(asteroid, selectedCoreSample?.Deposit?.resource);
      if (asteroidBonus.totalBonus !== 1) {
        abilities[Crewmate.ABILITY_IDS.EXTRACTION_TIME].totalBonus *= asteroidBonus.totalBonus;
        abilities[Crewmate.ABILITY_IDS.EXTRACTION_TIME].others = [{
          text: `${Product.TYPES[selectedCoreSample?.Deposit?.resource].category} Yield Bonus`,
          bonus: asteroidBonus.totalBonus - 1,
          direction: 1
        }];
      }
    } catch (e) {
      console.warn(e);
    }

    return bonusIds.map((id) => abilities[id] || {});
  }, [crew, selectedCoreSample?.Deposit?.resource]);

  const usableSamples = useMemo(() => {
    return (lot?.deposits || []).filter((d) => (
      (accountCrewIds?.includes(d.Control.controller.id) || d.PrivateSale?.amount > 0)
      && d.Deposit.remainingYield > 0
      && d.Deposit.status >= Deposit.STATUSES.SAMPLED
    ));
  }, [accountCrewIds, lot?.deposits, crew?.id]);

  const selectCoreSample = useCallback((sample) => {
    setSelectedCoreSample(sample);
    setAmount(0);
    if (sample) {
      setTimeout(() => {
        setAmount(sample.Deposit.remainingYield);
      }, 0);
    }
  }, []);

  useEffect(() => {
    let defaultSelection;

    // handle "currentExtraction" state
    if (currentExtraction) {
      const currentSample = (lot?.deposits || []).find((c) => c.id === currentExtraction.depositId);
      if (currentSample) {
        const activeSample = cloneDeep(currentSample);
        activeSample.Deposit.remainingYield += (currentExtraction.isCoreSampleUpdated ? currentExtraction.yield : 0)
        setSelectedCoreSample(activeSample);
        setAmount(currentExtraction.yield);
      }

    // handle default not_started state
    } else if (!selectedCoreSample) {
      if (props?.preselect) {
        defaultSelection = usableSamples.find((s) => s.id === props.preselect.depositId);
      } else if (usableSamples.length === 1) {
        defaultSelection = usableSamples[0];
      }
      if (defaultSelection) {
        selectCoreSample(defaultSelection);
      }
    }
  }, [currentExtraction, !selectedCoreSample, lot?.deposits, usableSamples]);

  const resource = useMemo(() => {
    if (!selectedCoreSample) return null;
    return Product.TYPES[selectedCoreSample.Deposit.resource];
  }, [selectedCoreSample]);

  const extractionTime = useMemo(() => {
    if (!selectedCoreSample) return 0;
    return Time.toRealDuration(
      Extractor.getExtractionTime(
        amount * (resource?.massPerUnit || 0),
        // TODO: remainingYield before started!
        selectedCoreSample.Deposit.remainingYield * (resource?.massPerUnit || 0),
        extractionBonus.totalBonus || 1
      ),
      crew?._timeAcceleration
    );
  }, [amount, crew?._timeAcceleration, extractionBonus, resource, selectedCoreSample]);

  const { totalTime: crewTravelTime, tripDetails } = useMemo(() => {
    if (!asteroid?.id || !crew?._location?.lotId || !lot?.id) return {};
    const crewLotIndex = Lot.toIndex(crew?._location?.lotId);
    return getTripDetails(asteroid.id, crewTravelBonus, crewDistBonus, crewLotIndex, [
      { label: 'Travel to Extraction Site', lotIndex: Lot.toIndex(lot.id) },
      { label: 'Return to Crew Station', lotIndex: crewLotIndex },
    ], crew?._timeAcceleration);
  }, [asteroid?.id, lot?.id, crew?._location?.lotId, crew?._timeAcceleration, crewTravelBonus, crewDistBonus]);

  const [transportDistance, transportTime] = useMemo(() => {
    if (!destinationLot?.id) return [];
    return [
      Asteroid.getLotDistance(asteroid?.id, Lot.toIndex(lot?.id), Lot.toIndex(destinationLot?.id)) || 0,
      Time.toRealDuration(
        Asteroid.getLotTravelTime(
          asteroid?.id,
          Lot.toIndex(lot?.id),
          Lot.toIndex(destinationLot?.id),
          crewTravelBonus.totalBonus,
          crewDistBonus.totalBonus
        ) || 0,
        crew?._timeAcceleration
      )
    ];
  }, [asteroid?.id, lot?.id, crew?._timeAcceleration, destinationLot?.id, crewDistBonus, crewTravelBonus]);

  const [crewTimeRequirement, taskTimeRequirement] = useMemo(() => {
    const oneWayCrewTravelTime = crewTravelTime / 2;
    return [
      [
        [oneWayCrewTravelTime, 'Travel to Extractor'],
        [extractionTime / 8, 'On-site Crew Labor'],
        [oneWayCrewTravelTime, 'Return to Station'],
      ],
      destinationLot && [
        [oneWayCrewTravelTime, 'Await Crew Arrival'],
        [extractionTime, 'Resource Extraction'],
        [transportTime, 'Transport Output to Destination'],
      ]
    ].map(formatTimeRequirements);
  }, [crew?._timeAcceleration, extractionTime, crewTravelTime, transportTime]);

  const stats = useMemo(() => ([
    {
      label: 'Extraction Mass',
      value: `${formatSampleMass(amount * resource?.massPerUnit || 0)} tonnes`,
      direction: 0
    },
    {
      label: 'Extraction Volume',
      value: `${formatResourceVolume(amount, resource?.i)}`,
      direction: 0
    },
    {
      label: 'Transport Distance',
      value: `${formatFixed(transportDistance, 1)} km`,
      direction: 0
    },
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
      label: 'Extraction Time',
      value: formatTimer(extractionTime),
      direction: getBonusDirection(extractionBonus),
      isTimeStat: true,
      tooltip: extractionBonus.totalBonus !== 1 && extractionTime > 0 && (
        <TimeBonusTooltip
          bonus={extractionBonus}
          title="Extraction Time"
          totalTime={extractionTime}
          crewRequired="start" />
      )
    },
    {
      label: 'Transport Time',
      value: formatTimer(transportTime),
      direction: getBonusDirection(crewTravelBonus),
      isTimeStat: true,
      tooltip: (
        <TimeBonusTooltip
          bonus={crewTravelBonus}
          title="Transport Time"
          totalTime={transportTime}
          crewRequired="start" />
      )
    },
  ]), [amount, crewTravelBonus, crewTravelTime, extractionBonus, extractionTime, resource, transportDistance, transportTime]);

  const prepaidLeaseConfig = useMemo(() => {
    return getProcessorLeaseConfig(lot?.building, Permission.IDS.EXTRACT_RESOURCES, crew, blockTime);
  }, [blockTime, crew, lot?.building]);

  const { leasePayment, desiredLeaseTerm, actualLeaseTerm } = useMemo(() => {
    return getProcessorLeaseSelections(
      prepaidLeaseConfig,
      taskTimeRequirement?.total || 0,
      crew?.Crew?.readyAt,
      blockTime
    );
  }, [blockTime, crew?.Crew?.readyAt, prepaidLeaseConfig, taskTimeRequirement?.total]);

  const onStartExtraction = useCallback(() => {
    if (!(amount && selectedCoreSample && destination && destinationInventory)) return;
    if (isPurchase && !depositOwner) return;
    if (leasePayment && !buildingOwner?.Crew?.delegatedTo) return;

    const inventoryConfig = Inventory.getType(destinationInventory.inventoryType, crew?._inventoryBonuses) || {};
    if (destinationInventory) {
      inventoryConfig.massConstraint -= ((destinationInventory.mass || 0) + (destinationInventory.reservedMass || 0));
      inventoryConfig.volumeConstraint -= ((destinationInventory.volume || 0) + (destinationInventory.reservedVolume || 0));
    }

    const safeAmount = Math.ceil(amount); // round up to nearest gram
    const neededCapacity = {
      mass: safeAmount * resource?.massPerUnit,
      volume: safeAmount * resource?.volumePerUnit
    }
    if (inventoryConfig.massConstraint < neededCapacity.mass || inventoryConfig.volumeConstraint < neededCapacity.volume) {
      createAlert({
        type: 'GenericAlert',
        level: 'warning',
        data: { content: `Insufficient inventory capacity at destination: ${formatSampleMass(inventoryConfig.massConstraint)} tonnes or ${formatSampleVolume(inventoryConfig.volumeConstraint)} m³` },
        duration: 10000
      });
      return;
    }

    startExtraction(
      safeAmount,
      selectedCoreSample,
      destination,
      destinationInventory.slot,
      depositOwner?.Crew?.delegatedTo,
      leasePayment > 0 && {
        recipient: buildingOwner.Crew.delegatedTo,
        term: actualLeaseTerm,
        termPrice: leasePayment,
      }
    );
  }, [
    actualLeaseTerm,
    amount,
    buildingOwner,
    crew?._inventoryBonuses,
    depositOwner,
    leasePayment,
    selectedCoreSample,
    destination,
    destinationInventory,
    isPurchase,
    resource
  ]);

  // handle auto-closing
  const lastStatus = useRef();
  useEffect(() => {
    // (close on status change from)
    if (['READY', 'READY_TO_FINISH', 'FINISHING'].includes(lastStatus.current)) {
      if (extractionStatus !== lastStatus.current) {
        props.onClose();
      }
    }
    lastStatus.current = extractionStatus;
  }, [extractionStatus]);

  const [extraDepositProps, extraDepositThumbnailProps] = useMemo(() => {
    if (isPurchase && stage === actionStage.NOT_STARTED) {
      return [
        {
          addChildren: (
            <AssetSellerIndicator
              crewId={selectedCoreSample?.Control?.controller?.id}
              data-tooltip-place="top"
              data-tooltip-content={`Deposit Sold by ${depositOwner?.Name?.name || `Crew #${selectedCoreSample?.Control?.controller?.id}`}`}
              data-tooltip-id="actionDialogTooltip" />
          ),
          tooltip: (
            <Warning>
              <span><WarningIcon /></span>
              <span>
                You are purchasing rights to an entire deposit and
                may extract any portion of it now or in the future.
              </span>
            </Warning>
          )
        },
        {
          bottomBanner: <><SwayIcon /> {formatFixed(selectedCoreSample.PrivateSale?.amount / 1e6, 1)}</>,
        }
      ];
    }
    return [{}, {}];
  }, [depositOwner, selectedCoreSample]);

  const [ goLabel, goLabelPrice ] = useMemo(() => {
    let label = `Extract`;
    const paymentTotal = (isPurchase) ? (selectedCoreSample?.PrivateSale?.amount || 0) + (leasePayment || 0) : 0;
    if (isPurchase && leasePayment) label = `Purchase, Lease, & Extract`;
    else if (isPurchase) label = `Purchase & Extract`;
    else if (leasePayment) label = `Lease & Extract`;
    return [label, paymentTotal];
  }, [isPurchase, leasePayment]);

  return (
    <>
      <ActionDialogHeader
        action={{
          icon: <ExtractionIcon />,
          label: 'Extract Resource',
        }}
        actionCrew={crew}
        location={{ asteroid, lot }}
        delayUntil={currentExtraction?.startTime || crew?.Crew?.readyAt}
        crewAvailableTime={crewTimeRequirement}
        taskCompleteTime={taskTimeRequirement}
        onClose={props.onClose}
        stage={stage} />

      <ActionDialogBody>

        <FlexSection>
          <FlexSectionInputBlock
            title="Deposit"
            titleDetails={(isPurchase && stage === actionStage.NOT_STARTED) ? <BuyingDetailsLabel /> : ''}
            image={
              resource
                ? (
                  <ResourceThumbnail
                    resource={resource}
                    tooltipContainer={null}
                    {...extraDepositThumbnailProps} />
                )
                : <EmptyResourceImage iconOverride={<CoreSampleIcon />} />
            }
            isSelected={stage === actionStage.NOT_STARTED}
            label={resource ? `${resource.name} Deposit` : 'Select'}
            onClick={() => { setSampleSelectorOpen(true) }}
            disabled={stage !== actionStage.NOT_STARTED}
            style={{ whiteSpace: 'nowrap' }}
            sublabel={
              selectedCoreSample
                ? (
                  stage === actionStage.NOT_STARTED
                    ? (
                      <SampleAmount>
                        <ResourceIcon />
                        <span>{formatSampleMass(selectedCoreSample.Deposit.remainingYield * resource.massPerUnit)}t</span>
                        <span>({formatSampleMass((selectedCoreSample.Deposit.remainingYield - amount) * resource.massPerUnit)}t)</span>
                      </SampleAmount>
                    )
                    : (
                      <SublabelBanner color={theming[stage].highlight} style={{ fontWeight: 'normal' }}>
                        {formatSampleMass(amount * resource.massPerUnit)}t
                      </SublabelBanner>
                    )
                )
                : 'Sampled Deposit'
            }
            {...extraDepositProps} />

          <FlexSectionSpacer />

          <InventoryInputBlock
            title="Destination"
            titleDetails={<TransferDistanceDetails distance={transportDistance} crewDistBonus={crewDistBonus} />}
            entity={destination}
            inventorySlot={destinationInventory?.slot}
            inventoryBonuses={crew?._inventoryBonuses}
            imageProps={{
              iconOverride: <InventoryIcon />
            }}
            isSelected={stage === actionStage.NOT_STARTED}
            onClick={() => { setDestinationSelectorOpen(true) }}
            disabled={stage !== actionStage.NOT_STARTED}
            stage={stage}
            sublabel={
              destinationLot
              ? <><LocationIcon /> {formatters.lotName(destinationSelection?.lotIndex)}</>
              : 'Inventory'
            }
            transferMass={amount * resource?.massPerUnit || 0}
            transferVolume={amount * resource?.volumePerUnit || 0} />

        </FlexSection>

        {prepaidLeaseConfig && stage === actionStage.NOT_STARTED && (
          <FlexSection>

            <BuildingInputBlock
              title="Extraction Location"
              titleDetails={<LeaseDetailsLabel />}
              bodyStyle={{ background: `rgba(${theme.colors.successDarkRGB}, 0.1)` }}
              isSelected={stage === actionStage.NOT_STARTED}
              building={lot?.building}
              imageProps={{
                iconBorderColor: `rgba(${theme.colors.successDarkRGB}, 0.5)`,
                bottomBanner: leasePayment > 0 && (
                  <>
                    <SwayIcon />
                    {formatFixed(leasePayment / 1e6, 0)}
                  </>
                ),
                iconBadge: <AgreementIcon />,
                iconBadgeCorner: theme.colors.successDark
              }}
              tooltip={(
                <LeaseTooltip
                  desiredTerm={desiredLeaseTerm}
                  permId={Permission.IDS.EXTRACT_RESOURCES}
                  {...prepaidLeaseConfig}
                />
              )}
              addChildren={<AssetSellerIndicator crewId={lot?.building?.Control?.controller?.id} />}
            />

            <FlexSectionSpacer />

            <FlexSectionInputBlock style={{ opacity: 0 }} />

          </FlexSection>
        )}

        {stage === actionStage.NOT_STARTED && (
          <Section>
            <SectionTitle>Extraction Amount</SectionTitle>
            <SectionBody style={{ paddingTop: 5 }}>
              <ResourceAmountSlider
                amount={amount || 0}
                extractionTime={extractionTime || 0}
                min={0}
                max={selectedCoreSample?.Deposit?.remainingYield || 0}
                resource={resource}
                setAmount={setAmount} />
            </SectionBody>
          </Section>
        )}

        {stage !== actionStage.NOT_STARTED && (
          <ProgressBarSection
            finishTime={currentExtraction?.finishTime}
            startTime={currentExtraction?.startTime}
            stage={stage}
            title="Progress"
            totalTime={crewTravelTime + extractionTime}
          />
        )}

        <ActionDialogStats
          stage={stage}
          stats={stats}
        />

      </ActionDialogBody>

      <ActionDialogFooter
        crewAvailableTime={crewTimeRequirement}
        taskCompleteTime={taskTimeRequirement}
        disabled={
          stage !== actionStage.READY_TO_COMPLETE &&
          (
            !destinationLot ||
            !selectedCoreSample ||
            amount === 0 ||
            !(crewCan(Permission.IDS.EXTRACT_RESOURCES, lot.building) || leasePayment > 0)
          )
        }
        goLabel={goLabel}
        goLabelPrice={goLabelPrice}
        onGo={onStartExtraction}
        finalizeLabel="Complete"
        isSequenceable
        onFinalize={finishExtraction}
        stage={stage}
        waitForCrewReady
        {...props} />

      {stage === actionStage.NOT_STARTED && (
        <>
          <CoreSampleSelectionDialog
            options={usableSamples}
            initialSelection={selectedCoreSample}
            lotId={lot?.id}
            onClose={() => setSampleSelectorOpen(false)}
            onSelected={setSelectedCoreSample}
            open={sampleSelectorOpen}
          />

          {/* TODO: reset if resource changes? */}
          <InventorySelectionDialog
            asteroidId={asteroid?.id}
            excludeSites
            otherEntity={lot?.building}
            itemIds={[selectedCoreSample?.Deposit?.resource]}
            itemIdsRequireAllAllowed
            onClose={() => setDestinationSelectorOpen(false)}
            onSelected={setDestinationSelection}
            open={destinationSelectorOpen}
          />
        </>
      )}
    </>
  );
};

const Wrapper = (props) => {
  const { asteroid, lot, isLoading } = useAsteroidAndLot(props);
  const extractionManager = useExtractionManager(lot?.id);
  const { actionStage } = extractionManager;

  useEffect(() => {
    if (!asteroid || !lot) {
      if (!isLoading) {
        if (props.onClose) props.onClose();
      }
    }
  }, [asteroid, lot, isLoading]);

  return (
    <ActionDialogInner
      actionImage="Extraction"
      isLoading={reactBool(isLoading)}
      stage={actionStage}>
      <Extract
        asteroid={asteroid}
        lot={lot}
        extractionManager={extractionManager}
        stage={actionStage}
        {...props} />
    </ActionDialogInner>
  )
};

export default Wrapper;
