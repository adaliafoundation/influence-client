import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styled, { css } from 'styled-components';
import { usePopper } from 'react-popper';
import { Delivery, Inventory, Permission, Product } from '@influenceth/sdk';

import Dropdown from '~/components/Dropdown';
import { CheckedIcon, DotsIcon, UncheckedIcon } from '~/components/Icons';
import ResourceThumbnail, { ResourceProgress } from '~/components/ResourceThumbnail';
import useActionButtons from '~/hooks/useActionButtons';
import useLot from '~/hooks/useLot';
import useStore from '~/hooks/useStore';
import { formatFixed } from '~/lib/utils';
import theme from '~/theme';
import actionButtons from '../actionButtons';
import { formatMass, formatResourceAmount, formatVolume } from '../actionDialogs/components';
import { Tray, TrayLabel } from './components/components';
import useShip from '~/hooks/useShip';
import useDeliveries from '~/hooks/useDeliveries';
import TabContainer from '~/components/TabContainer';
import useCrewContext from '~/hooks/useCrewContext';

const resourceItemWidth = 83;

const tabContainerCss = css`
  color: white;
  font-size: 15px;
  flex: 1;
  height: 40px;
  margin: -8px 0;
`;

const Wrapper = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  flex: 1;
  height: 100%;
`;

const InnerWrapper = styled.div`
  border-radius: 10px 0 0 10px;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 8px 0;
  width: 100%;
  & > div {
    margin-bottom: 15px;
    &:last-child {
      margin-bottom: 0;
    }
  }
`;

const StorageLabel = styled.div`
  align-items: center;
  color: white;
  display: flex;
  flex-direction: row;
  font-size: 14px;
  justify-content: space-between;
  padding-bottom: 8px;
  & > span {
    color: ${p =>
      p.utilization < 0.8
      ? p.theme.colors.green
      : (
        p.utilization < 1
        ? p.theme.colors.orange
        : p.theme.colors.error
      )
    };
    font-weight: bold;
  }
`;

const StorageLabelBottom = styled(StorageLabel)`
  padding-top: 8px;
  padding-bottom: 4px;
  color: white;
  & > div:first-child {
    color: ${theme.colors.brightMain};
  }
  & > div > span {
    color: ${theme.colors.secondaryText};
    margin-right: 3px
  }
`;

const ReservedLabelBottom = styled(StorageLabel)`
  padding-top: 2px;
  padding-bottom: 4px;
  color: white;
  & > div:first-child {
    color: ${theme.colors.main};
  }
  & > div > span {
    color: ${theme.colors.secondaryText};
    margin-right: 3px
  }
`;

const Charts = styled.div`
  border-bottom: 1px solid #333;
  padding: 5px 0 15px;
  & > div:first-child {
    margin-bottom: 10px;
  }
`;

const ProgressBar = styled(ResourceProgress)`
  margin: 0 0 0 10px;
  position: relative;
  bottom: 0px;
  right: 0px;
  ${p => p.horizontal
    ? `
      height: 4px;
      width: 100%;
      right: 10px;
    `
    : `
      height: 100%;
      width: 3px;
      bottom: 10px;
    `
  }
`;

const Controls = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  margin-bottom: 10px;
  position: relative;
  width: 100%;
  z-index: 1;
`;

const InventoryItems = styled.div`
  align-content: flex-start;
  display: grid;
  flex: 1;
  grid-gap: 4px;
  grid-template-columns: repeat(4, ${resourceItemWidth}px);
  flex-direction: row;
  flex-wrap: wrap;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 1px;
  padding-right: 10px;
  margin-right: -10px;
`;

const StackSplitButton = styled.span`
  align-items: center;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 5px;
  color: white;
  display: flex;
  height: 24px;
  left: 4px;
  justify-content: center;
  opacity: 0;
  position: absolute;
  top: 4px;
  transition: background 250ms ease, opacity 250ms ease;
  width: 24px;
  z-index: 2;
  ${p => p.isSplitting && `
    background: rgba(${p.theme.colors.mainRGB}, 0.7);
    opacity: 1;
  `}

  &:hover {
    background: rgba(${p => p.theme.colors.mainRGB}, 0.7);
  }
`;

const ThumbnailWrapper = styled.div`
  cursor: ${p => p.theme.cursors.active};
  height: ${resourceItemWidth}px;
  position: relative;
  width: ${resourceItemWidth}px;
  & > div {
    height: 100%;
    width: 100%;

    & > div {
      transition: background-color 250ms ease;
    }

    ${p => p.selected && `
      border-color: ${p.theme.colors.main};
      & > div {
        background-color: rgba(${p.theme.colors.mainRGB}, 0.15);
      }
      & > svg {
        stroke: ${p.theme.colors.main};
      }
    `};
  }

  &:hover {
    opacity: 0.8;
    & > div {
      border-color: ${p => p.theme.colors.main};
      & > div {
        background-color: rgba(${p => p.theme.colors.mainRGB}, 0.05);
      }
      & > svg {
        stroke: ${p => p.theme.colors.main};
      }
    }
    ${StackSplitButton} {
      opacity: 1;
    }
  }
`;

const sortOptions = ['Alphabetically', 'Mass', 'Volume'];

const StackSplitter = styled.div`
  background: black;
  padding: 6px;
  pointer-events: all;
  label {
    display: block;
    font-size: 14px;
    margin-bottom: 4px;
    text-align: center;
  }
`;

const QuantaInput = styled.input`
  background: rgba(${p => p.theme.colors.mainRGB}, 0.2);
  border: 1px solid ${p => p.theme.colors.main};
  color: white;
  font-family: inherit;
  font-size: 16px;
  text-align: right;
  width: 100%;
`;

const ToggleAll = styled.div`
  align-items: center;
  cursor: ${p => p.theme.cursors.active};
  display: flex;
  font-size: 15px;
  opacity: 0.7;
  & > svg {
    color: ${p => p.theme.colors.main};
    margin-right: 5px;
  }

  &:hover {
    opacity: 1;
  }
`;

const StackSplitterPopper = ({ children, referenceEl }) => {
  const [popperEl, setPopperEl] = useState();
  const { styles, attributes } = usePopper(referenceEl, popperEl, {
    placement: 'top',
    modifiers: [
      {
        name: 'flip',
        options: {
          fallbackPlacements: ['top-start', 'top-end', 'right', 'left'],
        },
      },
    ],
  });

  return createPortal(
    <div ref={setPopperEl} style={{ ...styles.popper, zIndex: 1000, pointerEvents: 'none' }} {...attributes.popper}>
      {children}
    </div>,
    document.body
  );
}

const LotInventory = () => {
  const { props: actionProps } = useActionButtons();

  const lotId = useStore(s => s.asteroids.lot);
  const zoomScene = useStore(s => s.asteroids.zoomScene);

  const { data: lot } = useLot(lotId);

  const zoomShipId = zoomScene?.type === 'SHIP' ? zoomScene.shipId : null;
  const { data: zoomShip } = useShip(zoomShipId);
  const ship = useMemo(() => zoomShipId ? zoomShip : lot?.surfaceShip, [lot?.surfaceShip, zoomShip, zoomShipId]);

  const entity = useMemo(() => ship || lot?.building, [lot, ship]);

  const { crew, crewCan } = useCrewContext();

  const inventories = useMemo(() => {
    return (entity?.Inventories || [])
      .filter((i) => i.status === Inventory.STATUSES.AVAILABLE)
      .map((i) => ({
        ...i,
        label: Inventory.TYPES[i.inventoryType].category,
        contentsObj: (i.contents || []).reduce((acc, c) => ({ ...acc, [c.product]: c.amount }), {})
      }))
      .sort((a, b) => a.label < b.label ? -1 : 1);
  }, [entity]);

  const [amount, setAmount] = useState();
  const [focused, setFocused] = useState();
  const [order, setOrder] = useState(sortOptions[0]);
  const [displayVolumes, setDisplayVolumes] = useState(true);
  const [inventorySlot, setInventorySlot] = useState(null);
  const [selectedItems, setSelectedItems] = useState({});
  const [splittingResourceId, setSplittingResourceId] = useState();

  const resourceItemRefs = useRef([]);

  const [canAddProducts, canRemoveProducts] = useMemo(
    () => ([
      crewCan(Permission.IDS.ADD_PRODUCTS, entity),
      crewCan(Permission.IDS.REMOVE_PRODUCTS, entity),
    ]),
    [crewCan, entity]
  );

  // default slot
  useEffect(() => {
    if (inventorySlot === null) {
      setInventorySlot(inventories?.[0]?.slot || null);
    }
  }, [inventories]);

  useEffect(() => {
    setSelectedItems({}); // clear selected items when switching inventories
  }, [entity?.uuid, inventorySlot])

  const { data: incomingDeliveries } = useDeliveries(
    entity && inventorySlot
      ? { destination: entity, destinationSlot: inventorySlot, status: Delivery.STATUSES.SENT }
      : undefined
  );

  // get selected inventory
  const inventory = useMemo(
    () => inventories.find((i) => i.slot === inventorySlot),
    [inventories, inventorySlot]
  );

  const {
    usedMass,
    reservedM,
    usedOrReservedMass,
    maxMass,
    pctMass,
    pctOrReservedMass,
    usedVolume,
    reservedV,
    usedOrReservedVolume,
    maxVolume,
    pctVolume,
    pctOrReservedVolume
  } = useMemo(() => {
    if (!inventory) {
      return {
        usedMass: 0,
        reservedM: 0,
        usedOrReservedMass: 0,
        maxMass: 0,
        pctMass: 0,
        pctOrReservedMass: 0,
        usedVolume: 0,
        reservedV: 0,
        usedOrReservedVolume: 0,
        maxVolume: 0,
        pctVolume: 0,
        pctOrReservedVolume: 0,
      };
    }

    // TODO: use Inventory.getFilledCapacity() instead?
    const inventoryConfig = Inventory.getType(inventory.inventoryType, crew?._inventoryBonuses) || {};
    const inventoryCapacity = Inventory.getFilledCapacity(inventory.inventoryType, crew?._inventoryBonuses) || {};

    const massConstraint = inventoryCapacity.filledMass || inventoryConfig.massConstraint;
    const volumeConstraint = inventoryCapacity.filledVolume || inventoryConfig.volumeConstraint;

    const mass = inventory?.mass || 0;
    const reservedMass = inventory?.reservedMass || 0;
    const massUsage = mass / massConstraint;
    const massReservedUsage = reservedMass / massConstraint;

    const volume = inventory?.volume || 0;
    const reservedVolume = inventory?.reservedVolume || 0;
    const volumeUsage = volume / volumeConstraint;
    const volumeReservedUsage = reservedVolume / volumeConstraint;

    return {
      usedMass: mass,
      reservedM: reservedMass,
      usedOrReservedMass: mass + reservedMass,
      maxMass: massConstraint,
      pctMass: massUsage,
      pctOrReservedMass: massUsage + massReservedUsage,
      usedVolume: volume,
      reservedV: reservedVolume,
      usedOrReservedVolume: volume + reservedVolume,
      maxVolume: volumeConstraint,
      pctVolume: volumeUsage,
      pctOrReservedVolume: volumeUsage + volumeReservedUsage,
    };
  }, [crew?._inventoryBonuses, inventory]);

  useCallback(() => {
    setDisplayVolumes((d) => !d);
  }, []);

  const sortedResources = useMemo(() => {
    if (!inventory?.contentsObj) return [];
    return Object.keys(inventory.contentsObj).sort((a, b) => {
      if (order === 'Mass') return inventory.contentsObj[a] * Product.TYPES[a].massPerUnit > inventory.contentsObj[b] * Product.TYPES[b].massPerUnit ? -1 : 1;
      else if (order === 'Volume') return inventory.contentsObj[a] * Product.TYPES[a].volumePerUnit > inventory.contentsObj[b] * Product.TYPES[b].volumePerUnit ? -1 : 1;
      return Product.TYPES[a].name < Product.TYPES[b].name ? -1 : 1;
    });
  }, [inventory?.contentsObj, order]);

  useMemo(() => incomingDeliveries?.length > 0, [incomingDeliveries]);

  const handleSelected = useCallback((resourceId, newTotal) => {
    setSelectedItems((s) => {
      const newS = { ...s };
      if (newTotal === 0) {
        delete newS[resourceId];
      } else {
        newS[resourceId] = newTotal;
      }
      return newS;
    });
  }, []);

  const splitStack = useCallback((resourceId) => (e) => {
    e.stopPropagation();
    setSplittingResourceId(resourceId);
    setAmount(selectedItems[resourceId] || inventory?.contentsObj[resourceId] || 0);
  }, [selectedItems, inventory?.contentsObj]);

  const onChangeAmount = useCallback((e) => {
    let newValue = parseInt(e.target.value.replace(/^0+/g, '').replace(/[^0-9]/g, ''));
    if (!(newValue > -1)) newValue = 0;
    if (newValue > e.target.max) newValue = e.target.max;
    setAmount(newValue);
  }, []);

  const onKeyDown = useCallback((e) => {
    if (['Enter', 'Tab'].includes(e.key) && e.currentTarget.value) {
      handleSelected(splittingResourceId, amount);
      setFocused(false);
      setSplittingResourceId();
    }
  }, [amount, splittingResourceId]);

  const onInventoryScroll = useCallback(() => {
    setSplittingResourceId();
  }, []);

  const onMouseLeave = useCallback(() => {
    if (!focused) {
      setSplittingResourceId();
    }
  }, [focused]);

  const onFocusAmount = useCallback((e) => {
    if (e.type === 'focus') {
      setFocused(true);
    } else {
      setFocused(false);
      setSplittingResourceId();
    }
  }, []);

  const isAllSelected = useMemo(() => {
    return Object.keys(selectedItems).length === sortedResources.length;
  }, [selectedItems, sortedResources]);

  const toggleAll = useCallback(() => {
    setSelectedItems((s) => {
      if (isAllSelected) return {};
      return sortedResources.reduce((acc, resourceId) => {
        acc[resourceId] = inventory.contentsObj[resourceId];
        return acc;
      }, {});
    });
  }, [isAllSelected, sortedResources]);

  // if inventory contents change, deselect all
  // TODO: maybe should deselect all whenever sendfrom, sellfrom, or jettison dialogs opened
  // TODO: probably should optimistically update item amounts from pending txs
  //       of sendfrom, sellfrom, or jettison...
  useEffect(() => {
    setSelectedItems({});
  }, [inventory?.contentsObj])

  const trayLabel = useMemo(() => {
    const selectedTally = Object.keys(selectedItems).length;
    if (selectedTally > 0) {
      const [totalMass, totalVolume] = Object.keys(selectedItems).reduce((acc, resourceId) => {
        acc[0] += selectedItems[resourceId] * Product.TYPES[resourceId].massPerUnit;
        acc[1] += selectedItems[resourceId] * Product.TYPES[resourceId].volumePerUnit;
        return acc;
      }, [0, 0]);
      return `${selectedTally} Product${selectedTally === 1 ? '' : 's'}: ${formatMass(totalMass)} | ${formatVolume(totalVolume)}`;
    }
    return null;
  }, [selectedItems]);

  const removalDisabledReason = useMemo(() => {
    if (!canRemoveProducts) return 'access restricted';
    if (Object.keys(selectedItems).length === 0) return 'nothing selected';
    return '';
  }, [canRemoveProducts, selectedItems]);

  if (!inventory === 0) return null;
  return (
    <>
      <Wrapper>
        <InnerWrapper>
          {inventories?.length > 1 && (
            <div>
              <TabContainer
                containerCss={tabContainerCss}
                labelCss={{ flex: 1, textAlign: 'center' }}
                onChange={(v) => setInventorySlot(inventories[v].slot)}
                tabCss={{ borderRadius: 0, flex: 1 }}
                tabs={inventories.map(({ label }) => ({ label }))}
              />
            </div>
          )}
          <Charts>
            <div>
              <StorageLabel utilization={pctOrReservedVolume}>
                <label>Volume</label>
                <span>
                {pctOrReservedVolume > 0 && pctOrReservedVolume < 0.01 ? '> ' : ''}{formatFixed(100 * pctOrReservedVolume, 1)}% ({formatVolume(usedOrReservedVolume)})
                </span>
              </StorageLabel>
              <ProgressBar horizontal progress={pctVolume} secondaryProgress={pctOrReservedVolume} utilization={pctOrReservedVolume}/>
              <StorageLabelBottom>
                <div><span>Stored:</span> {formatVolume(usedVolume)}</div>
                <div><span>Available:</span> {formatVolume(maxVolume - usedOrReservedVolume)}</div>
              </StorageLabelBottom>
              <ReservedLabelBottom>
                <div><span>Reserved:</span> {formatVolume(reservedV)}</div>
                <div><span>Capacity:</span> {formatVolume(maxVolume)}</div>
              </ReservedLabelBottom>
            </div>
            <div>
              <StorageLabel utilization={pctOrReservedMass}>
                <label>Mass</label>
                <span>
                  {pctOrReservedMass > 0 && pctOrReservedMass < 0.01 ? '> ' : ''}{formatFixed(100 * pctOrReservedMass, 1)}% ({formatMass(usedOrReservedMass)})
                </span>
              </StorageLabel>
              <ProgressBar horizontal progress={pctMass} secondaryProgress={pctOrReservedMass} utilization={pctOrReservedMass}/>
              <StorageLabelBottom>
                <div><span>Stored:</span> {formatMass(usedMass)}</div>
                <div><span>Available:</span> {formatMass(maxMass - usedOrReservedMass)}</div>
              </StorageLabelBottom>
              <ReservedLabelBottom>
                <div><span>Reserved:</span> {formatMass(reservedM)}</div>
                <div><span>Capacity:</span> {formatMass(maxMass)}</div>
              </ReservedLabelBottom>
            </div>
          </Charts>
          <Controls>
            <Dropdown
              background="transparent"
              options={sortOptions}
              onChange={(l) => setOrder(sortOptions[l])}
              size="small"
              textTransform="none"
              style={{ flex: 1, width: 170 }}
            />

            {sortedResources.length > 0 && (
              <ToggleAll onClick={toggleAll}>
                {isAllSelected
                  ? <><UncheckedIcon /> Deselect All</>
                  : <><CheckedIcon /> Select All</>
                }
              </ToggleAll>
            )}
          </Controls>
          <InventoryItems onScroll={onInventoryScroll}>
            {splittingResourceId && (
              <StackSplitterPopper referenceEl={resourceItemRefs.current[splittingResourceId]}>
                <StackSplitter onMouseLeave={onMouseLeave}>
                  <label>Selected Amount ({Product.TYPES[splittingResourceId].isAtomic ? 'units' : 'kg'})</label>
                  <QuantaInput
                    type="number"
                    max={inventory?.contentsObj[splittingResourceId]}
                    min={0}
                    onBlur={onFocusAmount}
                    onChange={onChangeAmount}
                    onKeyDown={onKeyDown}
                    onFocus={onFocusAmount}
                    step={1}
                    value={amount} />
                </StackSplitter>
              </StackSplitterPopper>
            )}
            {sortedResources.map((resourceId) => (
              <ThumbnailWrapper
                key={resourceId}
                onClick={() => handleSelected(resourceId, selectedItems[resourceId] > 0 ? 0 : inventory.contentsObj[resourceId])}
                selected={selectedItems[resourceId]}>
                <StackSplitButton
                  ref={ref => (resourceItemRefs.current[resourceId] = ref)}
                  onClick={splitStack(resourceId)}
                  isSplitting={splittingResourceId === resourceId}>
                  <DotsIcon />
                </StackSplitButton>
                <ResourceThumbnail
                  badge={formatResourceAmount(selectedItems[resourceId] || inventory.contentsObj[resourceId], resourceId)}
                  badgeColor={
                    selectedItems[resourceId]
                    ? (
                      selectedItems[resourceId] === inventory.contentsObj[resourceId]
                      ? theme.colors.main
                      : theme.colors.orange
                    )
                    : undefined
                  }
                  progress={displayVolumes
                    ? inventory.contentsObj[resourceId] * Product.TYPES[resourceId].volumePerUnit / inventory.volume
                    : undefined}
                  resource={Product.TYPES[resourceId]}
                  tooltipContainer="hudMenuTooltip" />
              </ThumbnailWrapper>
            ))}
          </InventoryItems>
          {(canAddProducts || canRemoveProducts) && (
            <Tray>
              {trayLabel && <TrayLabel content={trayLabel} />}

              {/* hide for now (for screen real estate)
              <actionButtons.SurfaceTransferIncoming.Component
                {...actionProps}
                labelAddendum={canAddProducts ? '' : 'access restricted'}
                flags={{ disabled: !canAddProducts }}
                dialogProps={{ destination: entity, destinationSlot: inventorySlot }}
              />
              */}

              <actionButtons.MultiBuy.Component
                {...actionProps}
                labelAddendum={canAddProducts ? '' : 'access restricted'}
                flags={{ disabled: !canAddProducts }}
                dialogProps={{ destination: entity, destinationSlot: inventorySlot }}
              />

              <actionButtons.SurfaceTransferOutgoing.Component
                {...actionProps}
                _disabledReason={removalDisabledReason}
                dialogProps={{ origin: entity, originSlot: inventorySlot, preselect: { selectedItems } }}
              />
          
              <actionButtons.MultiSell.Component
                {...actionProps}
                _disabledReason={removalDisabledReason}
                dialogProps={{ origin: entity, originSlot: inventorySlot, preselect: { selectedItems } }}
              />

              <actionButtons.JettisonCargo.Component
                {...actionProps}
                _disabledReason={removalDisabledReason}
                dialogProps={{ origin: entity, originSlot: inventorySlot, preselect: { selectedItems } }}
              />
            </Tray>
          )}
        </InnerWrapper>
      </Wrapper>
    </>
  );
};

export default LotInventory;