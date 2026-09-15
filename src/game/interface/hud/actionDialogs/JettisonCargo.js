import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Inventory, Permission, Product } from '@influenceth/sdk';
import styled from 'styled-components';

import { ForwardIcon, HeliocentricIcon, InventoryIcon, JettisonCargoIcon, LocationIcon, RouteIcon, WarningIcon } from '~/components/Icons';
import useCrewContext from '~/hooks/useCrewContext';
import useDeliveryManager from '~/hooks/actionManagers/useDeliveryManager';
import useLot from '~/hooks/useLot';
import useStore from '~/hooks/useStore';
import { reactBool, locationsArrToObj } from '~/lib/utils';
import { ItemSelectionSection, ActionDialogFooter, ActionDialogHeader, ActionDialogStats, formatMass, formatVolume, FlexSectionSpacer, ActionDialogBody, FlexSection, TransferSelectionDialog, ActionDialogTabs, InventoryChangeCharts, InventorySelectionDialog, InventoryInputBlock } from './components';
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
import useJettisonCargoManager from '~/hooks/actionManagers/useJettisonCargoManager';

const JettisonCargo = ({ asteroid, actionManager, origin: fixedOrigin, stage, ...props }) => {
  const { currentJettison, jettisonCargo } = actionManager;
  const { crew, crewCan } = useCrewContext();

  const [tab, setTab] = useState(0);
  const [transferSelectorOpen, setTransferSelectorOpen] = useState();
  const [selectedItems, setSelectedItems] = useState(props.preselect?.selectedItems || {});

  const [originSelectorOpen, setOriginSelectorOpen] = useState(false);

  const [originSelection, setOriginSelection] = useState();
  useEffect(() => {
    if (!fixedOrigin) return;
    const availInvs = (fixedOrigin.Inventories || []).filter((i) => i.status === Inventory.STATUSES.AVAILABLE);
    setOriginSelection({
      id: fixedOrigin.id,
      label: fixedOrigin.label,
      lotIndex: locationsArrToObj(fixedOrigin.Location?.locations || []).lotIndex,
      slot: currentJettison?.vars?.origin_slot
        || props.originSlot
        || availInvs.find((i) => Inventory.TYPES[i.inventoryType].category === Inventory.CATEGORIES.PRIMARY)?.slot
        || availInvs[0]?.slot
    });
  }, [currentJettison, fixedOrigin]);

  const { data: origin } = useEntity(originSelection ? { id: originSelection.id, label: originSelection.label } : undefined);
  const originLotId = useMemo(() => origin && locationsArrToObj(origin?.Location?.locations || []).lotId, [origin]);
  const { data: originLot } = useLot(originLotId);
  const originInventory = useMemo(() => (origin?.Inventories || []).find((i) => i.slot === originSelection?.slot), [origin, originSelection]);
  const originInventoryTally = useMemo(() => (origin?.Inventories || []).filter((i) => i.status === Inventory.STATUSES.AVAILABLE).length, [origin]);

  // When a new origin inventory is selected, reset the selected items
  const onOriginSelect = useCallback((selection) => {
    const { id, label, slot } = originSelection || {};
    if (id !== selection.id || label !== selection.label || slot !== selection.slot) {
      setOriginSelection(selection);
      setSelectedItems({});
    }
  }, [originSelection]);

  // handle "currentDeliveryAction" state
  useEffect(() => {
    if (currentJettison) {
      setSelectedItems(currentJettison.vars.products.reduce((acc, item) => ({ ...acc, [item.product]: item.amount }), {}));
    }
  }, [currentJettison]);

  const { totalMass, totalVolume } = useMemo(() => {
    return Object.keys(selectedItems).reduce((acc, resourceId) => {
      acc.totalMass += selectedItems[resourceId] * Product.TYPES[resourceId].massPerUnit;
      acc.totalVolume += selectedItems[resourceId] * Product.TYPES[resourceId].volumePerUnit;
      return acc;
    }, { totalMass: 0, totalVolume: 0 })
  }, [selectedItems]);

  const stats = useMemo(() => ([
    {
      label: 'Deleted Mass',
      value: `${formatMass(totalMass)}`,
      direction: 0
    },
    {
      label: 'Deleted Volume',
      value: `${formatVolume(totalVolume)}`,
      direction: 0
    },
  ]), [totalMass, totalVolume]);

  const onJettison = useCallback(() => {
    jettisonCargo(
      originInventory?.slot,
      selectedItems,
      { asteroidId: asteroid?.id, lotId: originLot?.id }
    );
  }, [jettisonCargo, originInventory?.slot, selectedItems, asteroid?.id, originLot?.id]);

  return (
    <>
      <ActionDialogHeader
        action={{
          icon: <JettisonCargoIcon />,
          label: 'Jettison Cargo',
          status: stage === actionStage.NOT_STARTED ? 'Delete Items' : undefined
        }}
        actionCrew={crew}
        location={{ asteroid, lot: originLot }}
        onClose={props.onClose}
        overrideColor={stage === actionStage.NOT_STARTED ? theme.colors.error : undefined}
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
            disabled
            imageProps={{ iconOverride: <HeliocentricIcon />, iconStyle: { color: theme.colors.error } }}
            stage={stage}
            fallbackLabel="Adalia"
            fallbackSublabel="Heliocentric Orbit"
            bodyStyle={{ background: `rgba(${theme.colors.errorRGB}, 0.15)` }}
          />
        </FlexSection>

        {tab === 0 && (
          <>
            <ItemSelectionSection
              label="Items"
              items={selectedItems}
              marginBottom={15}
              onClick={stage === actionStage.NOT_STARTED ? (() => setTransferSelectorOpen(true)) : undefined}
              stage={stage} />

            <FlexSection style={{ color: theme.colors.error, justifyContent: 'center', marginBottom: 15, marginTop: 0, width: '100%' }}>
              <div style={{ alignItems: 'center', display: 'flex' }}>
                <span style={{ fontSize: '24px', textAlign: 'center', width: 50 }}><WarningIcon /></span>
                <span style={{ flex: '1 0 calc(100% - 50px)', fontSize: '90%' }}>
                  WARNING: Jettisoned items are permanently deleted and cannot be recovered.
                </span>
              </div>
            </FlexSection>
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
            </FlexSection>
          </>
        )}

        <ActionDialogStats
          stage={stage}
          stats={stats}
        />

      </ActionDialogBody>

      <ActionDialogFooter
        disabled={totalMass === 0 || !origin || !crewCan(Permission.IDS.REMOVE_PRODUCTS, origin)}
        goLabel="Delete"
        onGo={onJettison}
        stage={stage}
        {...props} />

      {stage === actionStage.NOT_STARTED && (
        <>
          <TransferSelectionDialog
            sourceEntity={origin}
            sourceContents={originInventory?.contents || []}
            initialSelection={selectedItems}
            inventoryBonuses={crew?._inventoryBonuses}
            onClose={() => setTransferSelectorOpen(false)}
            onSelected={setSelectedItems}
            open={transferSelectorOpen}
          />

          <InventorySelectionDialog
            asteroidId={asteroid?.id}
            isSourcing
            limitToPrimary={fixedOrigin}
            onClose={() => setOriginSelectorOpen(false)}
            onSelected={onOriginSelect}
            open={originSelectorOpen}
          />
        </>
      )}
    </>
  );
};

const Wrapper = (props) => {
  const { origin } = props;
  const { asteroid, isLoading } = useAsteroidAndLot(props);

  const jettisonManager = useJettisonCargoManager(origin);

  const { data: originEntity, isLoading: originLoading } = useEntity(jettisonManager.currentJettison?.vars?.origin || props.origin);

  useEffect(() => {
    if (!props.onClose) return;
    if (!asteroid && !isLoading) props.onClose();
    if (origin && !originEntity && !originLoading) props.onClose();
  }, [asteroid, origin, originEntity, isLoading, originLoading]);

  // handle auto-closing on any status change
  const lastStatus = useRef();
  useEffect(() => {
    if (lastStatus.current && jettisonManager.actionStage !== lastStatus.current) {
      if (props.onClose) props.onClose();
    }
    if (!jettisonManager.isLoading) {
      lastStatus.current = jettisonManager.actionStage;
    }
  }, [jettisonManager.isLoading, jettisonManager.actionStage]);

  return (
    <ActionDialogInner
      actionImage="Jettison"
      isLoading={reactBool(isLoading || originLoading || jettisonManager.isLoading)}
      stage={jettisonManager.actionStage}>
      <JettisonCargo
        actionManager={jettisonManager}
        asteroid={asteroid}
        origin={originEntity}
        stage={jettisonManager.actionStage}
        {...props} />
    </ActionDialogInner>
  )
};

export default Wrapper;
