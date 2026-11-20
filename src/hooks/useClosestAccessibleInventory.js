import { useMemo } from 'react';
import { Asteroid, Entity, Lot } from '@influenceth/sdk';

import useAccessibleAsteroidInventories from './useAccessibleAsteroidInventories';
import useCrewContext from '~/hooks/useCrewContext';
import useShip from '~/hooks/useShip';

const useClosestAccessibleInventory = (asteroidId, productId, destinationLocation) => {
  const { crew } = useCrewContext();
  const destinationLotIndex = destinationLocation?.lotIndex;
  const crewedShipId = destinationLotIndex === 0
    && destinationLocation?.shipId
    && crew?._location?.shipId === destinationLocation.shipId
    ? destinationLocation.shipId
    : null;
  const { data: crewedShip, isLoading: crewedShipLoading } = useShip(crewedShipId);
  const hasDestination = !!asteroidId && destinationLotIndex != null;
  const sourceAsteroidId = hasDestination && destinationLotIndex !== 0 ? asteroidId : null;
  const {
    data: inventories,
    checking,
    isLoading: inventoriesLoading,
    isError: inventoriesError
  } = useAccessibleAsteroidInventories(sourceAsteroidId, {
    isSourcing: true,
    itemIds: [productId],
    productIds: [productId],
    crewedShip
  });

  return useMemo(() => {
    if (!hasDestination || inventoriesLoading || inventoriesError || checking || (crewedShipId && crewedShipLoading)) {
      return undefined;
    }

    let closest;
    inventories.forEach((entity) => {
      const lotId = entity.Location.locations.find((location) => location.label === Entity.IDS.LOT)?.id;
      const lotIndex = Lot.toIndex(lotId);
      const distance = Asteroid.getLotDistance(asteroidId, lotIndex, destinationLotIndex);

      entity.Inventories.forEach((inventory) => {
        if (!closest || distance < closest.distance) {
          closest = {
            distance,
            selection: { id: entity.id, label: entity.label, lotIndex, slot: inventory.slot }
          };
        }
      });
    });

    return closest?.selection || null;
  }, [
    asteroidId,
    checking,
    crewedShipId,
    crewedShipLoading,
    destinationLotIndex,
    hasDestination,
    inventories,
    inventoriesError,
    inventoriesLoading
  ]);
};

export default useClosestAccessibleInventory;