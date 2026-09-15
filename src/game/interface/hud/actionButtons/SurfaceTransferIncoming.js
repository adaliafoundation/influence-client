import { useCallback, useMemo } from 'react';
import { Inventory, Order, Permission, Process } from '@influenceth/sdk';

import { TransferP2PIcon, TransferToIcon } from '~/components/Icons';
import useDeliveryManager from '~/hooks/actionManagers/useDeliveryManager';
import useUnresolvedActivities from '~/hooks/useUnresolvedActivities';
import { getProcessorProps, locationsArrToObj } from '~/lib/utils';
import useOrdersByInventory from '~/hooks/useOrdersByInventory';
import ActionButton, { getCrewDisabledReason } from './ActionButton';
import ActionButtonStack from './ActionButtonStack';

const isVisible = ({ crew, lot, ship }) => {
  const entity = ship || lot?.surfaceShip || lot?.building;
  return crew && ((entity?.Inventories || []).find((i) => i.status === Inventory.STATUSES.AVAILABLE));
};

const SurfaceTransferIncoming = ({ asteroid, blockTime, crew, lot, ship, onSetAction, dialogProps = {}, _disabled, _disabledReason }) => {
  const destination = useMemo(() => ship || lot?.surfaceShip || lot?.building, [ship, lot]);
  const { data: inventoryOrders } = useOrdersByInventory(destination);
  const { currentDeliveryActions: destDeliveryActions, isLoading } = useDeliveryManager({ destination });
  const { data: destActionItems } = useUnresolvedActivities(destination);

  const deliveryDeparting = useMemo(() => {
    return (destDeliveryActions || []).find((a) => a.status === 'DEPARTING');
  }, [destDeliveryActions]);

  const currentDeliveryStack = useMemo(() => {
    const actionStack = [];
    if (crew && destination && Permission.isPermitted(crew, Permission.IDS.ADD_PRODUCTS, destination, blockTime)) {
      (destDeliveryActions || []).forEach((delivery) => {
        if (['PACKAGED','IN_TRANSIT','READY_TO_FINISH'].includes(delivery.status)) {
          actionStack.push({
            label: `Incoming Delivery${delivery.status === 'PACKAGED' ? ' Proposal' : ''}`,
            finishTime: delivery.status === 'PACKAGED' ? undefined : delivery.action?.finishTime,
            onClick: () => onSetAction('SURFACE_TRANSFER', { deliveryId: delivery.action?.deliveryId })
          });
        }
      });
      (inventoryOrders || []).forEach((order) => {
        if (order.orderType === Order.IDS.LIMIT_BUY) {
          actionStack.push({
            label: `Limit Buy`,
            preloadEntity: order?.entity,
            onClick: (entity) => {
              const exchangeLoc = locationsArrToObj(entity?.Location?.locations || []);
              onSetAction('MARKETPLACE_ORDER',  {
                exchange: entity,
                asteroidId: exchangeLoc?.asteroidId,
                lotId: exchangeLoc?.lotId,
                mode: 'buy',
                type: 'limit',
                resourceId: order.product,
                isCancellation: true,
                cancellationMakerFee: order.makerFee,
                preselect: {
                  crew: order.crew,
                  limitPrice: order.price,
                  quantity: order.amount,
                  storage: order.storage,
                  storageSlot: order.storageSlot
                }
              })
            }
          });
        }
      });
      (destActionItems || []).forEach((a) => {
        if (a.event.name === 'MaterialProcessingStarted') {
          if (a.event?.returnValues?.destination?.label === destination?.label && a.event?.returnValues?.destination?.id === destination?.id) {
            const processLabel = getProcessorProps(Process.TYPES[a.event?.returnValues?.process]?.processorType)?.typeLabel || 'Process';
            actionStack.push({
              label: `Incoming ${processLabel} Output`, // TODO: per processor type?
              finishTime: a.event?.returnValues?.finishTime,
              preloadEntity: a.event?.returnValues?.processor,
              onClick: (entity) => {
                const lotId = locationsArrToObj(entity?.Location?.locations || [])?.lotId;
                onSetAction('PROCESS', { lotId, processorSlot: a.event?.returnValues?.processorSlot });
              }
            });
          }
        }
        if (a.event.name === 'ResourceExtractionStarted') {
          actionStack.push({
            label: `Incoming Extraction`,
            finishTime: a.event?.returnValues?.finishTime,
            preloadEntity: a.event?.returnValues?.extractor,
            onClick: (entity) => {
              const lotId = locationsArrToObj(entity?.Location?.locations || [])?.lotId;
              onSetAction('EXTRACT_RESOURCE', { lotId });
            }
          });
        }
      });
    }
    return actionStack.sort((a, b) => {
      if (a.finishTime && b.finishTime) {
        return a.finishTime - b.finishTime;
      }
      if (a.finishTime) return -1;
      if (b.finishTime) return 1;
      return 0;
    });
  }, [blockTime, crew, destination, destDeliveryActions, destActionItems, inventoryOrders, onSetAction]);

  const handleClick = useCallback(() => {
    onSetAction('SURFACE_TRANSFER', { deliveryId: 0, destination, ...dialogProps });
  }, [onSetAction, destination, dialogProps]);

  const disabledReason = useMemo(() => {
    if (_disabledReason) return _disabledReason;
    if (_disabled) return 'loading...';
    if (!destination) return '';
    const _location = locationsArrToObj(destination.Location?.locations || []);
    if (!_location?.lotId) return 'not on surface';

    const hasCapacity = !!(destination?.Inventories || []).find((i) => {
      if (i.status === Inventory.STATUSES.AVAILABLE) {
        const invConfig = Inventory.getType(i?.inventoryType, crew?._inventoryBonuses) || {};
        const hasMassCapacity = invConfig.massConstraint > ((i.mass || 0) + (i.reservedMass || 0));
        const hasVolumeCapacity = invConfig.volumeConstraint > ((i.volume || 0) + (i.reservedVolume || 0));
        return (hasMassCapacity && hasVolumeCapacity);
      }
    });
    if (!hasCapacity) return 'over capacity';

    return getCrewDisabledReason({ asteroid, crew, requireReady: false });
  }, [destination, crew]);
  
  const isP2P = useMemo(
    () => crew && destination && !Permission.isPermitted(crew, Permission.IDS.ADD_PRODUCTS, destination, blockTime),
    [blockTime, crew, destination]
  );

  return (
    <>
      {currentDeliveryStack.length > 0 && (
        <ActionButtonStack
          stack={currentDeliveryStack}
          stackLabel={
            currentDeliveryStack.length > 1
            ? `${currentDeliveryStack.length} Incoming Deliver${currentDeliveryStack.length === 1 ? 'y' : 'ies'}`
            : `Receive Delivery`
          }
          icon={<TransferToIcon />}
        />
      )}
      <ActionButton
        label={isP2P ? "Send Here (P2P)" : "Send Here"}
        labelAddendum={disabledReason}
        flags={{
          disabled: _disabled || disabledReason || isLoading,
          loading: deliveryDeparting
        }}
        icon={isP2P ? <TransferP2PIcon /> : <TransferToIcon />}
        onClick={handleClick} />
    </>
  );
};

const actionDefinition = { Component: SurfaceTransferIncoming, isVisible };

export default actionDefinition;
