import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Asteroid, Crewmate, Inventory, Lot, Permission, Product, Time } from '@influenceth/sdk';
import styled from 'styled-components';

import { CheckIcon, CloseIcon, ForwardIcon, InventoryIcon, LocationIcon, RouteIcon, SurfaceTransferIcon, WarningOutlineIcon } from '~/components/Icons';
import useCrewContext from '~/hooks/useCrewContext';
import useDeliveryManager from '~/hooks/actionManagers/useDeliveryManager';
import useLot from '~/hooks/useLot';
import useStore from '~/hooks/useStore';
import { reactBool, formatTimer, locationsArrToObj, getCrewAbilityBonuses } from '~/lib/utils';
import {
  ItemSelectionSection,
  ActionDialogFooter,
  ActionDialogHeader,
  ActionDialogStats,
  formatMass,
  formatSampleMass,
  formatSampleVolume,
  formatVolume,
  getBonusDirection,
  TimeBonusTooltip,
  FlexSectionSpacer,
  ActionDialogBody,
  FlexSection,
  TransferSelectionDialog,
  ProgressBarSection,
  ActionDialogTabs,
  InventoryChangeCharts,
  CrewOwnerBlock,
  TransferDistanceDetails,
  FlexSectionBlock,
  WarningAlert,
  SwayInputBlockInner,
  InventorySelectionDialog,
  InventoryInputBlock,
  formatTimeRequirements
} from './components';
import { ActionDialogInner, useAsteroidAndLot } from '../ActionDialog';
import useCrew from '~/hooks/useCrew';
import CrewIndicator from '~/components/CrewIndicator';
import useEntity from '~/hooks/useEntity';
import useActionCrew from '~/hooks/useActionCrew';
import { TransferP2PIcon } from '~/components/Icons';
import useHydratedCrew from '~/hooks/useHydratedCrew';
import actionStage from '~/lib/actionStages';
import formatters from '~/lib/formatters';
import { TOKEN, TOKEN_SCALE } from '~/lib/priceUtils';
import theme from '~/theme';
import useBlockTime from '~/hooks/useBlockTime';

const P2PSection = styled.div`
  align-self: flex-start;
  width: 50%;
  & > * {
    margin-bottom: 20px;
    &:last-child {
      margin-bottom: 0;
    }
  }
`;

const SurfaceTransfer = ({
  asteroid,
  deliveryManager,
  currentDeliveryAction,
  deliveryId,
  destination: fixedDestination,
  origin: fixedOrigin,
  stage,
  ...props
}) => {
  const { crew: currentCrew, crewCan: currentCrewCan } = useCrewContext();
  const createAlert = useStore(s => s.dispatchAlertLogged);

  const { startDelivery, finishDelivery, packageDelivery, acceptDelivery, cancelDelivery } = deliveryManager;
  const currentDelivery = useMemo(() => currentDeliveryAction?.action, [currentDeliveryAction]);
  const crew = useActionCrew(currentDelivery);
  const { data: currentDeliveryCallerCrew } = useHydratedCrew(currentDelivery?.callerCrew?.id);
  const blockTime = useBlockTime();

  const crewTravelBonus = useMemo(() => {
    if (!crew) return {};
    return getCrewAbilityBonuses(Crewmate.ABILITY_IDS.HOPPER_TRANSPORT_TIME, crew) || {};
  }, [crew]);

  const crewDistBonus = useMemo(() => {
    if (!crew) return {};
    return getCrewAbilityBonuses(Crewmate.ABILITY_IDS.FREE_TRANSPORT_DISTANCE, crew) || {};
  }, [crew]);

  const [tab, setTab] = useState(0);
  const [transferSelectorOpen, setTransferSelectorOpen] = useState();
  const [selectedItems, setSelectedItems] = useState(props.preselect?.selectedItems || {});
  const [sway, setSway] = useState(0);

  const [destinationSelectorOpen, setDestinationSelectorOpen] = useState(false);
  const [originSelectorOpen, setOriginSelectorOpen] = useState(false);

  const [destinationSelection, setDestinationSelection] = useState();
  const [originSelection, setOriginSelection] = useState();
  useEffect(() => {
    if (fixedDestination) {
      const availInvs = (fixedDestination.Inventories || []).filter((i) => i.status === Inventory.STATUSES.AVAILABLE);
      setDestinationSelection({
        id: fixedDestination.id,
        label: fixedDestination.label,
        lotIndex: locationsArrToObj(fixedDestination.Location?.locations || []).lotIndex,
        slot: currentDelivery?.destSlot
          || props.destinationSlot
          || availInvs.find((i) => Inventory.TYPES[i.inventoryType].category === Inventory.CATEGORIES.PRIMARY)?.slot
          || availInvs[0]?.slot
      });
    }
    if (fixedOrigin) {
      const availInvs = (fixedOrigin.Inventories || []).filter((i) => i.status === Inventory.STATUSES.AVAILABLE);
      setOriginSelection({
        id: fixedOrigin.id,
        label: fixedOrigin.label,
        lotIndex: locationsArrToObj(fixedOrigin.Location?.locations || []).lotIndex,
        slot: currentDelivery?.originSlot
          || props.originSlot
          || availInvs.find((i) => Inventory.TYPES[i.inventoryType].category === Inventory.CATEGORIES.PRIMARY)?.slot
          || availInvs[0]?.slot
      });
    }
    setSway((currentDelivery?.price || 0) / TOKEN_SCALE[TOKEN.SWAY]);
  }, [currentDelivery, fixedDestination, fixedOrigin]);

  const { data: origin } = useEntity(originSelection ? { id: originSelection.id, label: originSelection.label } : undefined);
  const originLotId = useMemo(() => origin && locationsArrToObj(origin?.Location?.locations || []).lotId, [origin]);
  const { data: originLot } = useLot(originLotId);
  const originInventory = useMemo(() => (origin?.Inventories || []).find((i) => i.slot === originSelection?.slot), [origin, originSelection]);
  const { data: originController } = useCrew(origin?.Control?.controller?.id);
  const originInventoryTally = useMemo(() => (origin?.Inventories || []).filter((i) => i.status === Inventory.STATUSES.AVAILABLE).length, [origin]);
  const originProductIds = useMemo(() => {
    const invConfig = Inventory.TYPES[originInventory?.inventoryType] || {};
    return invConfig?.productConstraints ? Object.keys(invConfig?.productConstraints) : null;
  }, [originInventory]);

  const { data: destination } = useEntity(destinationSelection ? { id: destinationSelection.id, label: destinationSelection.label } : undefined);
  const destinationLotId = useMemo(() => destination && locationsArrToObj(destination?.Location?.locations || []).lotId, [destination]);
  const { data: destinationLot } = useLot(destinationLotId);
  const destinationInventory = useMemo(() => (destination?.Inventories || []).find((i) => i.slot === destinationSelection?.slot), [destination, destinationSelection]);
  const { data: destinationController } = useCrew(destination?.Control?.controller?.id);
  const destinationInventoryTally = useMemo(() => (destination?.Inventories || []).filter((i) => i.status === Inventory.STATUSES.AVAILABLE).length, [destination]);
  const destDeliveryManager = useDeliveryManager({ destination, destinationSlot: destinationSelection?.slot });
  const destinationProductIds = useMemo(() => {
    const invConfig = Inventory.TYPES[destinationInventory?.inventoryType] || {};
    return invConfig?.productConstraints ? Object.keys(invConfig?.productConstraints) : null;
  }, [destinationInventory]);

  // When a new origin inventory is selected, reset the selected items
  const onOriginSelect = useCallback((selection) => {
    const { id, label, slot } = originSelection || {};
    if (id !== selection.id || label !== selection.label || slot !== selection.slot) {
      setOriginSelection(selection);
      setSelectedItems({});
    }
  }, [originSelection]);

  const onDestinationSelect = useCallback((selection) => {
    const { id, label, slot } = destinationSelection || {};
    if (id !== selection.id || label !== selection.label || slot !== selection.slot) {
      setDestinationSelection(selection);
    }
  }, [destinationSelection]);

  const onSwayChange = useCallback((value) => {
    setSway(value ? parseInt(value) : '');
  }, []);

  // handle "currentDeliveryAction" state
  useEffect(() => {
    if (currentDelivery) {
      setSelectedItems(currentDelivery.contents.reduce((acc, item) => ({ ...acc, [item.product]: item.amount }), {}));
    }
  }, [currentDelivery]);

  useEffect(() => {
    if (stage === actionStage.NOT_STARTED && originInventory) {
      const destInvConfig = (Inventory.getType(destinationInventory?.inventoryType, crew?._inventoryBonuses) || {});
      const destInvConstraints = destInvConfig.productConstraints;

      // cap selectedItems to originInventory contents and destinationInventory constraints
      // TODO: account for *pending* deliveries out from origin (i.e. to adjust actual available amount)?
      const validated = Object.keys(selectedItems).reduce((acc, product) => {
        const sendConstraint = ((originInventory?.contents || []).find((c) => Number(c.product) === Number(product))?.amount || 0);
        const inDestMax = destInvConstraints
          ? (Object.keys(destInvConstraints).includes(`${product}`) ? (destInvConstraints[product] === 0 ? Infinity : destInvConstraints[product]) : 0)
          : Infinity;
        const inDestInv = ((destinationInventory?.contents || []).find((c) => Number(c.product) === Number(product))?.amount || 0);
        const inDestTransit = (destDeliveryManager.currentDeliveryActions || [])
          .filter((d) => d.status !== 'FINISHED')
          .reduce((acc, d) => acc + ((d.action.contents.find((c) => Number(c.product) === Number(product))?.amount) || 0), 0);
        const receiveConstraint = Math.max(0, inDestMax - inDestInv - inDestTransit);

        const maxProduct = Math.min(selectedItems[product], sendConstraint, receiveConstraint);
        return maxProduct > 0 ? { ...acc, [product]: maxProduct } : acc;
      }, {});

      // if one item selected and it is over the total mass / volume constraint, also cap (i.e. useful for propellant)
      if (Object.keys(validated).length === 1) {
        const product = Object.keys(validated)[0];
        const massConstraint = destInvConfig.massConstraint - ((destinationInventory?.mass || 0) + (destinationInventory?.reservedMass || 0));
        const volumeConstraint = destInvConfig.volumeConstraint - ((destinationInventory?.volume || 0) + (destinationInventory?.reservedVolume || 0));
        if (Product.TYPES[product].massPerUnit * validated[product] > massConstraint) {
          validated[product] = Math.floor(massConstraint / Product.TYPES[product].massPerUnit);
        }
        if (Product.TYPES[product].volumePerUnit * validated[product] > volumeConstraint) {
          validated[product] = Math.floor(volumeConstraint / Product.TYPES[product].volumePerUnit);
        }
      }

      setSelectedItems(validated);
    }
  }, [
    crew?._inventoryBonuses,
    originInventory,
    destinationInventory,
    destDeliveryManager.currentDeliveryActions,
    transferSelectorOpen
  ]);

  const [transportDistance, transportTime] = useMemo(() => {
    if (!asteroid?.id || !originLot?.id || !destinationLot?.id) return [0, 0];
    const originLotIndex = Lot.toIndex(originLot?.id);
    const destinationLotIndex = Lot.toIndex(destinationLot?.id);
    const transportDistance = Asteroid.getLotDistance(asteroid?.id, originLotIndex, destinationLotIndex);
    const transportTime = Time.toRealDuration(
      Asteroid.getLotTravelTime(
        asteroid?.id, originLotIndex, destinationLotIndex, crewTravelBonus.totalBonus, crewDistBonus.totalBonus
      ),
      crew?._timeAcceleration
    );
    return [transportDistance, formatTimeRequirements(transportTime)];
  }, [asteroid?.id, originLot?.id, destinationLot?.id, crewDistBonus, crewTravelBonus, crew?._timeAcceleration]);

  const { totalMass, totalVolume } = useMemo(() => {
    return Object.keys(selectedItems).reduce((acc, resourceId) => {
      acc.totalMass += selectedItems[resourceId] * Product.TYPES[resourceId].massPerUnit;
      acc.totalVolume += selectedItems[resourceId] * Product.TYPES[resourceId].volumePerUnit;
      return acc;
    }, { totalMass: 0, totalVolume: 0 })
  }, [selectedItems]);

  const currentCrewIsSender = useMemo(() => {
    if (currentDelivery) return currentCrew?.id === currentDelivery.callerCrew?.id;
    return true;
  }, [currentCrew, currentDelivery]);

  const currentCrewHasOriginPerms = useMemo(() => {
    if (origin) return currentCrewCan(Permission.IDS.REMOVE_PRODUCTS, origin);
    return true;
  }, [currentCrewCan, origin]);

  const currentCrewHasDestinationPerms = useMemo(() => {
    if (destination) return currentCrewCan(Permission.IDS.ADD_PRODUCTS, destination);
    return true;
  }, [currentCrewCan, destination]);

  const senderHasDestPerm = useMemo(() => {
    if (!destination) return true;
    if (currentDelivery) {
      if (currentDeliveryCallerCrew && destination) {
        return Permission.isPermitted(currentDeliveryCallerCrew, Permission.IDS.ADD_PRODUCTS, destination, blockTime);
      }
      return true;
    }
    return currentCrewCan(Permission.IDS.ADD_PRODUCTS, destination);
  }, [blockTime, crew, currentDelivery, currentDeliveryCallerCrew, destination]);

  const isP2P = useMemo(() => currentDelivery?.isProposal || !senderHasDestPerm, [currentDelivery?.isProposal, senderHasDestPerm]);

  const stats = useMemo(() => ([
    {
      label: 'Task Duration',
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
    {
      label: 'Transfer Distance',
      value: `${Math.round(transportDistance)} km`,
      direction: 0
    },
    {
      label: 'Transfered Mass',
      value: `${formatMass(totalMass)}`,
      direction: 0
    },
    {
      label: 'Transfered Volume',
      value: `${formatVolume(totalVolume)}`,
      direction: 0
    },
  ]), [totalMass, totalVolume, transportDistance, transportTime?.total]);

  const willBeOverCapacity = useMemo(() => {
    if (![actionStage.NOT_STARTED, actionStage.STARTING].includes(stage)) return false;

    const destInventoryConfig = Inventory.getType(destinationInventory?.inventoryType, crew?._inventoryBonuses) || {};
    if (destinationInventory) {
      destInventoryConfig.massConstraint -= ((destinationInventory.mass || 0) + (destinationInventory.reservedMass || 0));
      destInventoryConfig.volumeConstraint -= ((destinationInventory.volume || 0) + (destinationInventory.reservedVolume || 0));
    }
    return (totalMass > destInventoryConfig.massConstraint) || (totalVolume > destInventoryConfig.volumeConstraint);
  }, [crew?._inventoryBonuses, destinationInventory, stage, totalMass, totalVolume]);

  const onStartDelivery = useCallback(() => {
    if (willBeOverCapacity) {
      const destInventoryConfig = Inventory.getType(destinationInventory?.inventoryType, crew?._inventoryBonuses) || {};
      createAlert({
        type: 'GenericAlert',
        level: 'warning',
        data: { content: `Insufficient inventory capacity at destination: ${formatSampleMass(destInventoryConfig.massConstraint)} tonnes or ${formatSampleVolume(destInventoryConfig.volumeConstraint)} m³` },
        duration: 10000
      });
      return;
    }

    (senderHasDestPerm ? startDelivery : packageDelivery)({
      origin,
      originSlot: originInventory?.slot,
      destination,
      destinationSlot: destinationInventory?.slot,
      contents: selectedItems,
      price: sway
    }, { asteroidId: asteroid?.id, lotId: originLot?.id });
  }, [crew?._inventoryBonuses, packageDelivery, startDelivery, originInventory, destinationInventory, selectedItems, sway, isP2P, senderHasDestPerm, asteroid?.id, originLot?.id, willBeOverCapacity]);

  const onFinishDelivery = useCallback(() => {
    finishDelivery(deliveryId, {
      asteroidId: asteroid?.id,
      lotId: destinationLot?.id,
    });
  }, [finishDelivery, deliveryId, asteroid?.id, destinationLot?.id]);

  const onCancelDelivery = useCallback(() => {
    cancelDelivery(deliveryId, {
      asteroidId: asteroid?.id,
      lotId: destinationLot?.id,
    });
  }, [cancelDelivery, deliveryId, asteroid?.id, destinationLot?.id]);

  const onAcceptDelivery = useCallback(() => {
    acceptDelivery(deliveryId, {
      asteroidId: asteroid?.id,
      lotId: destinationLot?.id,
    });
  }, [acceptDelivery, deliveryId, asteroid?.id, destinationLot?.id]);

  const actionDetails = useMemo(() => {
    let overrideColor = undefined;
    let status = undefined;
    if (stage === actionStage.NOT_STARTED || ['READY','PACKAGED'].includes(currentDeliveryAction?.status)) {
      if (isP2P) {
        if (currentCrewHasOriginPerms) {
          status = 'Send to Crew';
          overrideColor = theme.colors.green;
        } else {
          status = 'Incoming from Other Crew';
          overrideColor = '#faaf3f';
        }
      } else {
        status = 'Send Items';
        overrideColor = theme.colors.main;
      }
    }
    return { overrideColor, status, stage };
  }, [crew, currentCrewHasOriginPerms, currentDeliveryAction?.status, destination, isP2P, stage]);

  const finalizeActions = useMemo(() => {
    if (currentDeliveryAction?.status === 'PACKAGED') {
      if (currentCrewHasDestinationPerms) {
        return {
          finalizeLabel: [
            <><CloseIcon style={{ marginRight: 4 }} /> <span>Reject</span></>,
            <><CheckIcon style={{ marginRight: 4 }} /> <span>Accept</span></>
          ],
          onFinalize: [onCancelDelivery, onAcceptDelivery],
        };
      } else {
        return {
          finalizeLabel: 'Cancel Proposal',
          onFinalize: onCancelDelivery,
        };
      }
    }
    return {
      finalizeLabel: 'Complete',
      onFinalize: onFinishDelivery,
    };
  }, [currentDeliveryAction?.status, crew, currentCrewHasDestinationPerms, onAcceptDelivery, onCancelDelivery, onFinishDelivery]);

  return (
    <>
      <ActionDialogHeader
        action={{
          icon: isP2P ? <TransferP2PIcon /> : <SurfaceTransferIcon />,
          label: 'Surface Transfer',
          status: actionDetails.status
        }}
        actionCrew={crew}
        location={{ asteroid, lot: originLot }}
        onClose={props.onClose}
        overrideColor={actionDetails.overrideColor}
        taskCompleteTime={transportTime}
        stage={stage} />

      <ActionDialogBody>

        <ActionDialogTabs
          onSelect={setTab}
          selected={tab}
          tabs={[
            { icon: <RouteIcon />, label: 'Transfer' },
            { icon: <InventoryIcon />, iconStyle: { fontSize: 22 }, label: 'Inventory' },
          ]} />

        <FlexSection>
          <InventoryInputBlock
            title="Origin"
            disabled={stage !== actionStage.NOT_STARTED || (fixedOrigin && originInventoryTally === 1)}
            entity={origin}
            inventorySlot={originInventory?.slot}
            inventoryBonuses={crew?._inventoryBonuses}
            imageProps={{ iconOverride: <InventoryIcon /> }}
            isSelected={stage === actionStage.NOT_STARTED && !(fixedOrigin && originInventoryTally === 1)}
            isSourcing
            lotIdOverride={originLot?.id}
            onClick={() => { setOriginSelectorOpen(true) }}
            stage={stage}
            sublabel={
              originLot
                ? <><LocationIcon /> {formatters.lotName(originSelection?.lotIndex)}</>
                : 'Inventory'
            }
            transferMass={totalMass}
            transferVolume={totalVolume} />

          <FlexSectionSpacer>
            <ForwardIcon />
          </FlexSectionSpacer>

          <InventoryInputBlock
            title="Destination"
            titleDetails={<TransferDistanceDetails distance={transportDistance} crewDistBonus={crewDistBonus} />}
            disabled={stage !== actionStage.NOT_STARTED || (fixedDestination && destinationInventoryTally === 1)}
            entity={destination}
            inventorySlot={destinationInventory?.slot}
            inventoryBonuses={crew?._inventoryBonuses}
            imageProps={{ iconOverride: <InventoryIcon /> }}
            isSelected={stage === actionStage.NOT_STARTED && !(fixedDestination && destinationInventoryTally === 1)}
            lotIdOverride={destinationLot?.id}
            onClick={() => { setDestinationSelectorOpen(true) }}
            stage={stage}
            sublabel={
              destinationLot
                ? <><LocationIcon /> {formatters.lotName(destinationSelection?.lotIndex)}</>
                : 'Inventory'
            }
          />
        </FlexSection>

        {tab === 0 && (
          <>
            {(!destinationLot || !isP2P)
              ? (
                <ItemSelectionSection
                  label="Items"
                  items={selectedItems}
                  onClick={stage === actionStage.NOT_STARTED ? (() => setTransferSelectorOpen(true)) : undefined}
                  stage={stage}
                  errorMessage={willBeOverCapacity && 'Exceeds Destination Capacity'} />
              )
              : (
                <FlexSection>
                  <FlexSectionBlock title="Offered Items" bodyStyle={{ height: 'auto', padding: 0 }}>
                    <ItemSelectionSection
                      columns={3}
                      label="Items"
                      items={selectedItems}
                      onClick={stage === actionStage.NOT_STARTED ? (() => setTransferSelectorOpen(true)) : undefined}
                      stage={stage}
                      errorMessage={willBeOverCapacity && 'Exceeds Destination Capacity'}
                      unwrapped />
                  </FlexSectionBlock>

                  <FlexSectionSpacer />

                  {/* TODO: might be reasonable to warn user if about to send products to a place have ADD_PRODUCTS perm for, but not REMOVE_PRODUCTS */}
                  <P2PSection>
                    {(currentCrewIsSender || (currentCrewHasOriginPerms && !currentCrewHasDestinationPerms))
                      ? (
                        <>
                          <CrewIndicator crew={destinationController} label={'Destination Controller'} />

                          <WarningAlert severity="warning">
                            <div><WarningOutlineIcon /></div>
                            <div>The destination is controlled by a different crew.</div>
                          </WarningAlert>

                          {(stage === actionStage.NOT_STARTED || ['PACKAGING','PACKAGED','CANCELING'].includes(currentDeliveryAction?.status)) && (
                            <>
                              {stage === actionStage.NOT_STARTED
                                ? (
                                  <SwayInputBlockInner
                                    inputLabel="REQUESTED SWAY"
                                    instruction="OPTIONAL: You may request a SWAY payment from the controlling crew in exchange for goods delivered."
                                    onChange={onSwayChange}
                                    value={sway} />
                                )
                                : (
                                  <SwayInputBlockInner
                                    disabled
                                    inputLabel="REQUESTED SWAY"
                                    instruction="You requested the following payment from the controlling crew in exchange for goods delivered:"
                                    onChange={onSwayChange}
                                    value={sway || '0'} />
                                )}
                            </>
                          )}
                        </>
                      )
                      : (
                        <>
                          <CrewIndicator crew={originController} label={'Origin Controller'} />

                          {(stage === actionStage.NOT_STARTED || ['PACKAGING','PACKAGED','CANCELING'].includes(currentDeliveryAction?.status)) && (
                            <>
                              {sway > 0 && (
                                <WarningAlert severity="error">
                                  <div><WarningOutlineIcon /></div>
                                  <div>The sender has requested a SWAY payment for these goods.</div>
                                </WarningAlert>
                              )}

                              <SwayInputBlockInner
                                disabled
                                inputLabel="SWAY"
                                instruction="You pay the controller in exchange for these goods:"
                                value={sway || '0'} />
                            </>
                          )}
                        </>
                      )}
                  </P2PSection>

                </FlexSection>
              )
            }

            {stage !== actionStage.NOT_STARTED && currentDeliveryAction?.status !== 'PACKAGED' && (
              <ProgressBarSection
                finishTime={currentDelivery?.finishTime}
                startTime={currentDelivery?.startTime}
                stage={stage}
                title="Progress"
                totalTime={transportTime.total}
              />
            )}
          </>
        )}

        {tab === 1 && (
          <>
            <FlexSection>
              <div style={{ width: '50%', overflow: 'hidden' }}>
                <InventoryChangeCharts
                  inventory={originInventory}
                  inventoryBonuses={crew?._inventoryBonuses}
                  deltaMass={-totalMass}
                  deltaVolume={-totalVolume}
                  stage={stage}
                />
              </div>
              <FlexSectionSpacer />
              <div style={{ width: '50%', overflow: 'hidden' }}>
                <InventoryChangeCharts
                  inventory={destinationInventory}
                  inventoryBonuses={crew?._inventoryBonuses}
                  deltaMass={totalMass}
                  deltaVolume={totalVolume}
                  stage={stage}
                />
              </div>
            </FlexSection>

            {(originController && destinationController && originController?.id !== destinationController?.id) && (
              <FlexSection>
                <CrewOwnerBlock crew={originController} />

                <FlexSectionSpacer />

                <CrewOwnerBlock crew={destinationController} />
              </FlexSection>
            )}
          </>
        )}

        <ActionDialogStats
          stage={stage}
          stats={stats}
        />

      </ActionDialogBody>

      <ActionDialogFooter
        disabled={stage === actionStage.NOT_STARTED
          ? (totalMass === 0 || !destination || !origin || willBeOverCapacity || !currentCrewCan(Permission.IDS.REMOVE_PRODUCTS, origin))
          : (currentDeliveryAction?.status === 'PACKAGED' && !(crew?._location?.lotId && crew?._location?.asteroidId === asteroid?.id))
        }
        goLabel="Transfer"
        onGo={onStartDelivery}
        stage={stage}
        taskCompleteTime={transportTime}
        {...finalizeActions}
        {...props} />

      {stage === actionStage.NOT_STARTED && (
        <>
          <TransferSelectionDialog
            sourceEntity={origin}
            sourceContents={originInventory?.contents || []}
            pendingTargetDeliveries={destDeliveryManager.currentDeliveryActions}
            targetInventory={destinationInventory}
            initialSelection={selectedItems}
            inventoryBonuses={crew?._inventoryBonuses}
            onClose={() => setTransferSelectorOpen(false)}
            onSelected={setSelectedItems}
            open={transferSelectorOpen}
          />

          <InventorySelectionDialog
            asteroidId={asteroid?.id}
            isSourcing
            itemIds={destinationProductIds}
            limitToControlled={isP2P}
            limitToPrimary={fixedOrigin}
            otherEntity={destination}
            otherInvSlot={destinationInventory?.slot}
            onClose={() => setOriginSelectorOpen(false)}
            onSelected={onOriginSelect}
            open={originSelectorOpen}
            requirePresenceOfItemIds={!!destinationProductIds}
          />

          <InventorySelectionDialog
            asteroidId={asteroid?.id}
            itemIds={originProductIds}
            otherEntity={origin}
            otherInvSlot={originInventory?.slot}
            onClose={() => setDestinationSelectorOpen(false)}
            onSelected={onDestinationSelect}
            open={destinationSelectorOpen}
            limitToPrimary={fixedDestination}
          />
        </>
      )}
    </>
  );
};

const Wrapper = (props) => {
  const { deliveryId, destination, destinationSlot, origin, originSlot, txHash } = props;
  const { asteroid, isLoading } = useAsteroidAndLot(props);

  // entrypoints w/ props:
  //  - deliveryId (from actionitem)
  //  - origin (from sendFrom button) +- originSlot
  //  - destination (from sendTo button) +- destinationSlot
  // TODO: test from actionItem, hud action button, inventory menu action button
  const deliveryManagerQuery = useMemo(() => {
    if (deliveryId) return { deliveryId };
    if (txHash) return { txHash };
    if (destination) return { destination, destinationSlot };
    if (origin) return { origin, originSlot };
    return {};
  }, [deliveryId, destination, destinationSlot, origin, originSlot, txHash])
  const deliveryManager = useDeliveryManager(deliveryManagerQuery);

  const currentDeliveryAction = useMemo(() => {
    return (deliveryManager.currentDeliveryActions || []).find((d) => {
      if (deliveryId) return d.action.deliveryId === deliveryId
      if (txHash) return d.action.txHash === txHash;
      return d.status === 'PACKAGING' || d.status === 'DEPARTING';
    });
  }, [deliveryManager.currentVersion, deliveryId, txHash]);

  const { data: originEntity, isLoading: originLoading } = useEntity(currentDeliveryAction?.action?.origin || props.origin);
  const { data: destEntity, isLoading: destLoading } = useEntity(currentDeliveryAction?.action?.dest || props.destination);

  useEffect(() => {
    if (!props.onClose) return;
    if (!asteroid && !isLoading) props.onClose();
    if (origin && !originEntity && !originLoading) props.onClose();
    if (destination && !destEntity && !destLoading) props.onClose();
  }, [asteroid, origin, isLoading, originLoading, deliveryManager.isLoading]);

  const stage = currentDeliveryAction?.stage || actionStage.NOT_STARTED;

  // handle auto-closing on any status change
  const lastStatus = useRef();
  useEffect(() => {
    if (stage !== 'READY_TO_FINISH') {
      if (lastStatus.current && stage !== lastStatus.current) {
        if (props.onClose) props.onClose();
      }
    }
    if (!deliveryManager.isLoading) {
      lastStatus.current = stage;
    }
  }, [deliveryManager.isLoading, stage]);

  return (
    <ActionDialogInner
      actionImage="SurfaceTransfer"
      isLoading={reactBool(isLoading || originLoading || destLoading || deliveryManager.isLoading)}
      stage={currentDeliveryAction?.status === 'PACKAGED' ? actionStage.NOT_STARTED : stage}>
      <SurfaceTransfer
        asteroid={asteroid}
        deliveryManager={deliveryManager}
        currentDeliveryAction={currentDeliveryAction}
        origin={originEntity}
        destination={destEntity}
        stage={stage}
        {...props} />
    </ActionDialogInner>
  )
};

export default Wrapper;
