import { useCallback, useEffect, useMemo, useState } from 'react';
import { Asteroid, Crewmate, Entity, Inventory, Lot, Permission, Product } from '@influenceth/sdk';

import { ForwardIcon, InventoryIcon, TransferToSiteIcon } from '~/components/Icons';
import useCrewContext from '~/hooks/useCrewContext';
import useDeliveryManager from '~/hooks/actionManagers/useDeliveryManager';
import useLot from '~/hooks/useLot';
import useStore from '~/hooks/useStore';
import { reactBool, formatTimer, getCrewAbilityBonuses } from '~/lib/utils';
import {
  ActionDialogFooter,
  ActionDialogHeader,
  ActionDialogStats,
  TransferBuildingRequirementsSection,
  formatSampleMass,
  formatSampleVolume,
  getBuildingRequirements,
  TimeBonusTooltip,
  formatMass,
  formatVolume,
  getBonusDirection,
  FlexSectionSpacer,
  ActionDialogBody,
  FlexSection,
  TransferSelectionDialog,
  LotInputBlock,
  InventorySelectionDialog,
  InventoryInputBlock,
  formatTimeRequirements
} from './components';
import { ActionDialogInner, useAsteroidAndLot } from '../ActionDialog';
import actionStage from '~/lib/actionStages';

const TransferToSite = ({ asteroid, lot: destinationLot, deliveryManager, stage, ...props }) => {
  const createAlert = useStore(s => s.dispatchAlertLogged);
  const onSetAction = useStore(s => s.dispatchActionDialog);

  const { currentDeliveryActions, startDelivery } = deliveryManager;
  const { crew, crewCan } = useCrewContext();

  const crewTravelBonus = useMemo(() => {
    if (!crew) return {};
    return getCrewAbilityBonuses(Crewmate.ABILITY_IDS.HOPPER_TRANSPORT_TIME, crew) || {};
  }, [crew]);

  const crewDistBonus = useMemo(() => {
    if (!crew) return {};
    return getCrewAbilityBonuses(Crewmate.ABILITY_IDS.FREE_TRANSPORT_DISTANCE, crew) || {};
  }, [crew]);

  const [originSelectorOpen, setOriginSelectorOpen] = useState(false);
  const [transferSelectorOpen, setTransferSelectorOpen] = useState();
  const [selectedItems, setSelectedItems] = useState(props.preselect?.selectedItems || {});

  // get destination and destinationInventory
  const destination = useMemo(() => ({
    id: destinationLot?.building?.id,
    label: Entity.IDS.BUILDING,
    lotIndex: Lot.toIndex(destinationLot?.id),
    slot: destinationLot?.building?.Inventories.find((i) => i.status === Inventory.STATUSES.AVAILABLE)?.slot
  }), [destinationLot]);
  const destinationInventory = useMemo(() => (destinationLot?.building?.Inventories || []).find((i) => i.slot === destination?.slot), [destinationLot, destination?.slot]);

  // get originLot and originInventory
  const [origin, setOrigin] = useState();
  const originLotId = useMemo(() => Lot.toId(asteroid?.id, origin?.lotIndex), [asteroid?.id, origin?.lotIndex]);
  const { data: originLot } = useLot(originLotId);
  const originEntity = useMemo(() => {
    if (!originLot || !origin) return null;
    if (origin.label === Entity.IDS.SHIP) return originLot.ships.find((s) => s.id === origin.id);
    return originLot.building;
  }, [originLot, origin]);
  const originInventory = useMemo(() => (originEntity?.Inventories || []).find((i) => i.slot === origin?.slot), [originEntity, origin]);

  const buildingRequirements = useMemo(
    () => getBuildingRequirements(destinationLot?.building, currentDeliveryActions),
    [destinationLot?.building, currentDeliveryActions]
  );

  useEffect(() => {
    if (stage === actionStage.NOT_STARTED) {
      const validated = Object.keys(selectedItems).reduce((acc, product) => {
        // cap selectedItems to originInventory contents and adjusted building requirements
        const sendConstraint = ((originInventory?.contents || []).find((c) => Number(c.product) === Number(product))?.amount || 0);  // TODO: account for *pending* deliveries out?
        const receiveConstraint = buildingRequirements.find(({ i }) => i === product)?.inNeed || 0;

        const maxProduct = Math.min(selectedItems[product], sendConstraint, receiveConstraint);
        return maxProduct > 0 ? { ...acc, [product]: maxProduct } : acc;
      }, {});
      setSelectedItems(validated);
    }
  }, [originInventory, buildingRequirements]);

  // // handle "currentDeliveryAction" state
  // useEffect(() => {
  //   if (currentDeliveryAction) {
  //     setSelectedItems(currentDeliveryAction.contents);
  //   }
  // }, [currentDeliveryAction]);

  // useEffect(() => {
  //   if (currentDeliveryAction?.originLotId) {
  //     setOriginLotId(currentDeliveryAction?.originLotId);
  //   }
  // }, [currentDeliveryAction?.originLotId]);

  // // reset selectedItems if change origin lot before starting
  // // TODO: in general, could probably remove all currentDeliveryAction stuff
  // //  since we don't follow the course of the delivery in this dialog
  // useEffect(() => {
  //   if (!currentDeliveryAction) setSelectedItems(props.preselect?.selectedItems || {});
  // }, [originLot]);

  // reset selectedItems if not in a ready state (to avoid double-counting)
  useEffect(() => {
    if (stage !== actionStage.NOT_STARTED) {
      setSelectedItems({});
    }
  }, [stage])

  const [transportDistance, transportTime] = useMemo(() => {
    if (!asteroid?.id || !originLot?.id || !destinationLot?.id) return [0, 0];
    const originLotIndex = Lot.toIndex(originLot?.id);
    const destinationLotIndex = Lot.toIndex(destinationLot?.id);
    const transportDistance = Asteroid.getLotDistance(asteroid?.id, originLotIndex, destinationLotIndex);
    const transportTime = Asteroid.getLotTravelTimeReal(
      asteroid?.id,
      originLotIndex,
      destinationLotIndex,
      crewTravelBonus.totalBonus,
      crewDistBonus.totalBonus,
      crew?._timeAcceleration
    );
    return [transportDistance, formatTimeRequirements(transportTime)];
  }, [asteroid?.id, originLot?.id, destinationLot?.id, crew?._timeAcceleration, crewDistBonus, crewTravelBonus]);

  const { totalMass, totalVolume } = useMemo(() => {
    return Object.keys(selectedItems).reduce((acc, resourceId) => {
      acc.totalMass += selectedItems[resourceId] * (Product.TYPES[resourceId].massPerUnit || 0);
      acc.totalVolume += selectedItems[resourceId] * (Product.TYPES[resourceId].volumePerUnit || 0);
      return acc;
    }, { totalMass: 0, totalVolume: 0 })
  }, [selectedItems]);

  const stats = useMemo(() => ([
    {
      label: 'Total Mass',
      value: `${formatMass(totalMass)}`,
      direction: 0
    },
    {
      label: 'Total Volume',
      value: `${formatVolume(totalVolume)}`,
      direction: 0
    },
    {
      label: 'Transfer Distance',
      value: `${Math.round(transportDistance)} km`,
      direction: 0
    },
    {
      label: 'Transport Time',
      value: formatTimer(transportTime?.total || 0),
      direction: getBonusDirection(crewTravelBonus),
      isTimeStat: true,
      tooltip: (
        <TimeBonusTooltip
          bonus={crewTravelBonus}
          title="Transport Time"
          totalTime={transportTime?.total || 0}
          crewRequired="start" />
      )
    },
  ]), [totalMass, totalVolume, transportDistance, transportTime?.total]);

  const onStartDelivery = useCallback(() => {
    const destInventoryConfig = Inventory.getType(destinationInventory?.inventoryType, crew?._inventoryBonuses) || {};
    if (destinationInventory) {
      destInventoryConfig.massConstraint -= ((destinationInventory.mass || 0) + (destinationInventory.reservedMass || 0));
      destInventoryConfig.volumeConstraint -= ((destinationInventory.volume || 0) + (destinationInventory.reservedVolume || 0));
    }
    if (destInventoryConfig.massConstraint < totalMass || destInventoryConfig.volumeConstraint < totalVolume) {
      createAlert({
        type: 'GenericAlert',
        level: 'warning',
        data: { content: `Insufficient inventory capacity at destination: ${formatSampleMass(destInventoryConfig.massConstraint)} tonnes or ${formatSampleVolume(destInventoryConfig.volumeConstraint)} m³` },
        duration: 10000
      });
      return;
    }

    startDelivery({
      origin,
      originSlot: originInventory?.slot,
      destination,
      destinationSlot: destinationInventory?.slot,
      contents: selectedItems
    }, { asteroidId: asteroid?.id, lotId: originLot?.id });
  }, [crew?._inventoryBonuses, originInventory, destinationInventory, selectedItems, asteroid?.id, originLot?.id]);

  useEffect(() => {
    if (destinationLot?.building && !buildingRequirements.find((r) => r.inNeed > 0)) {
      onSetAction('CONSTRUCT');
    }
  }, [buildingRequirements, destinationLot?.building, onSetAction]);

  useEffect(() => {
    if (!destinationInventory) {
      createAlert({
        type: 'GenericAlert',
        data: { content: 'Destination has no available inventories.' },
        duration: 5000,
        level: 'warning',
      });
      if (props.onClose) props.onClose();
    }
  }, [destinationInventory]);

  return (
    <>
      <ActionDialogHeader
        action={{
          icon: <TransferToSiteIcon />,
          label: 'Transfer to Site',
        }}
        actionCrew={crew}
        location={{ asteroid, lot: destinationLot }}
        taskCompleteTime={transportTime}
        onClose={props.onClose}
        stage={stage} />

      <ActionDialogBody>
        <FlexSection>
          <InventoryInputBlock
            title="Origin"
            entity={originEntity}
            imageProps={{
              iconOverride: <InventoryIcon />,
              inventories: originEntity?.Inventories,
              showInventoryStatusForType: origin?.slot
            }}
            inventorySlot={origin?.slot}
            inventoryBonuses={crew?._inventoryBonuses}
            isSelected={stage === actionStage.NOT_STARTED}
            isSourcing
            onClick={() => { setOriginSelectorOpen(true) }}
            disabled={stage !== actionStage.NOT_STARTED}
            stage={stage}
            transferMass={-totalMass}
            transferVolume={-totalVolume}
          />

          <FlexSectionSpacer>
            <ForwardIcon />
          </FlexSectionSpacer>

          <LotInputBlock
            title="Destination"
            lot={destinationLot}
            fallbackSublabel="Inventory"
            imageProps={{
              iconOverride: <InventoryIcon />,
              inventories: destinationLot?.building?.Inventories,
              inventoryBonuses: crew?._inventoryBonuses,
              showInventoryStatusForType: destination?.slot,
              unfinished: true
            }}
          />
        </FlexSection>

        <TransferBuildingRequirementsSection
          label="Items"
          onClick={originLot ? () => setTransferSelectorOpen(true) : null}
          requirements={buildingRequirements}
          selectedItems={selectedItems}
        />

        {/* TODO: don't ever show progress here... close if complete and user can link to individual surface transports
        {stage !== actionStage.NOT_STARTED && (
          <ProgressBarSection
            finishTime={currentDeliveryAction?.finishTime}
            startTime={currentDeliveryAction?.startTime}
            stage={stage}
            title="Progress"
            totalTime={transportTime.total}
          />
        )}
        */}

        <ActionDialogStats
          stage={stage}
          stats={stats}
        />

      </ActionDialogBody>

      <ActionDialogFooter
        disabled={!origin || totalMass === 0 || !crewCan(Permission.IDS.ADD_PRODUCTS, destinationLot?.building) || !crewCan(Permission.IDS.REMOVE_PRODUCTS, originEntity)}
        finalizeLabel="Complete"
        goLabel="Transfer"
        onGo={onStartDelivery}
        stage={stage}
        taskCompleteTime={transportTime}
        {...props} />

      {stage === actionStage.NOT_STARTED && (
        <>
          <TransferSelectionDialog
            sourceEntity={originEntity}
            sourceContents={originInventory?.contents || []}
            pendingTargetDeliveries={currentDeliveryActions}
            targetInventory={destinationInventory}
            initialSelection={selectedItems}
            inventoryBonuses={crew?._inventoryBonuses}
            onClose={() => setTransferSelectorOpen(false)}
            onSelected={setSelectedItems}
            open={transferSelectorOpen}
          />

          <InventorySelectionDialog
            asteroidId={asteroid.id}
            otherEntity={destinationLot?.building}
            isSourcing
            itemIds={buildingRequirements.map(({ i }) => i)}
            onClose={() => setOriginSelectorOpen(false)}
            onSelected={setOrigin}
            open={originSelectorOpen}
            requirePresenceOfItemIds
          />
        </>
      )}
    </>
  );
};

const Wrapper = (props) => {
  const { asteroid, lot, isLoading } = useAsteroidAndLot(props);

  const deliveryManager = useDeliveryManager({ destination: lot?.building });

  const [stage, innerKey] = useMemo(() => {
    if ((deliveryManager.currentDeliveryActions || []).find((d) => d.status === 'DEPARTING')) {
      return [actionStage.STARTING, deliveryManager.currentDeliveryActions.length - 1];
    }
    return [actionStage.NOT_STARTED, deliveryManager.currentDeliveryActions?.length || 0];
  }, [deliveryManager.loading, deliveryManager.currentVersion]);

  // TODO (nice-to-have): if requirements are all met, close the dialog

  useEffect(() => {
    if (!asteroid || !lot) {
      if (!isLoading) {
        if (props.onClose) props.onClose();
      }
    }
  }, [asteroid, lot, isLoading]);

  return (
    <ActionDialogInner
      actionImage="SurfaceTransfer"
      isLoading={reactBool(isLoading || deliveryManager.isLoading)}
      stage={stage}>
      <TransferToSite
        key={innerKey}
        asteroid={asteroid}
        lot={lot}
        deliveryManager={deliveryManager}
        stage={stage}
        {...props} />
    </ActionDialogInner>
  )
};

export default Wrapper;
