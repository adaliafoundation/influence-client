const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const { Asteroid, Time } = require('@influenceth/sdk');
const { getInstantTransferDetails, getTripTiming } = require('./transport');

test('instant radius includes both bonuses and the exact boundary', () => {
  expect(getInstantTransferDetails(30, 2, 3)).toEqual({ radius: 30, isInstant: true });
  expect(getInstantTransferDetails(30.001, 2, 3).isInstant).toBe(false);
  expect(getInstantTransferDetails(0)).toEqual({ radius: 5, isInstant: true });
});

test.each([[1, 1], [2, 1], [1, 2], [0.5, 2]])('display agrees with SDK travel time for speed %s and distance %s', (speed, distanceBonus) => {
  const distance = Asteroid.getLotDistance(1, 1, 100);
  const time = Asteroid.getLotTravelTime(1, 1, 100, speed, distanceBonus);
  expect(getInstantTransferDetails(distance, speed, distanceBonus).isInstant).toBe(time === 0);
});

test('SDK 2.7.1 makes a formerly paid trip instantaneous through speed bonus alone', () => {
  const distance = Asteroid.getLotDistance(1, 1, 100);
  expect(distance).toBeGreaterThan(Asteroid.FREE_TRANSPORT_RADIUS);
  expect(Asteroid.getLotTravelTime(1, 1, 100, 1, 1)).toBeGreaterThan(0);
  expect(Asteroid.getLotTravelTime(1, 1, 100, 2, 1)).toBe(0);
  expect(getInstantTransferDetails(distance, 2, 1).isInstant).toBe(true);
});

test('display and SDK both include the bonus-adjusted boundary', () => {
  const distance = Asteroid.getLotDistance(1, 1, 100);
  const speed = distance / Asteroid.FREE_TRANSPORT_RADIUS;
  expect(Asteroid.getLotTravelTime(1, 1, 100, speed, 1)).toBe(0);
  expect(getInstantTransferDetails(distance, speed, 1).isInstant).toBe(true);
  expect(Asteroid.getLotTravelTime(1, 1, 100, speed - 0.001, 1)).toBeGreaterThan(0);
  expect(getInstantTransferDetails(distance, speed - 0.001, 1).isInstant).toBe(false);
});

test('shared trip estimates round each leg before summing and calculating completion', () => {
  const trip = getTripTiming(1, 1, [
    { label: 'To processor', lotIndex: 102 },
    { label: 'Return', lotIndex: 1 }
  ], 1, 1, 24);
  expect(trip.legs.map(({ duration }) => duration)).toEqual([341, 341]);
  expect(trip.totalTime).toBe(682);
  expect(Time.getProductionCompletionTime(100, 120, trip.totalTime)).toBe(802);
});

test('instant legs stay zero and route skips use the correct next origin', () => {
  const trip = getTripTiming(1, 1, [
    { label: 'Local', lotIndex: 2, skipToLotIndex: 102 },
    { label: 'At processor', lotIndex: 102 }
  ], 1, 1, 24);
  expect(trip.legs.map(({ duration }) => duration)).toEqual([0, 0]);
  expect(trip.totalTime).toBe(0);
});
