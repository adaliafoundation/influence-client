import { Asteroid } from '@influenceth/sdk';

// Display the physical radius while comparing bonus-adjusted distance, as in SDK 2.7.1.
export const getInstantTransferDetails = (distance, timeBonus = 1, distanceBonus = 1) => {
  const adjustedRadius = Asteroid.FREE_TRANSPORT_RADIUS * distanceBonus;
  return {
    radius: adjustedRadius * timeBonus,
    isInstant: distance / timeBonus <= adjustedRadius
  };
};

export const getTripTiming = (asteroidId, originLotIndex, steps, timeBonus, distanceBonus, timeAcceleration) => {
  let currentLotIndex = originLotIndex;
  let totalDistance = 0;
  let totalTime = 0;
  const legs = steps.map(({ label, lotIndex, skipToLotIndex }) => {
    const distance = Asteroid.getLotDistance(asteroidId, currentLotIndex, lotIndex);
    const duration = Asteroid.getLotTravelTimeReal(
      asteroidId, currentLotIndex, lotIndex, timeBonus, distanceBonus, timeAcceleration
    );
    currentLotIndex = skipToLotIndex ?? lotIndex;
    totalDistance += distance;
    totalTime += duration;
    return { label, distance, duration };
  });
  return { totalDistance, totalTime, legs };
};
