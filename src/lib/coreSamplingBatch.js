import { Asteroid, Crewmate, Deposit, Entity, Lot, Time } from '@influenceth/sdk';

import { getCrewAbilityBonuses } from './utils';

const SAMPLING_ABILITY_IDS = [
  Crewmate.ABILITY_IDS.HOPPER_TRANSPORT_TIME,
  Crewmate.ABILITY_IDS.FREE_TRANSPORT_DISTANCE,
  Crewmate.ABILITY_IDS.CORE_SAMPLE_TIME
];

// Crew abilities that affect core sampling scheduling (mirrors NewCoreSample).
export const getCoreSamplingCrewBonuses = (crew) => {
  const abilities = getCrewAbilityBonuses(SAMPLING_ABILITY_IDS, crew);
  const [travelBonus, distBonus, sampleTimeBonus] = SAMPLING_ABILITY_IDS.map((id) => abilities[id] || {});
  return { travelBonus, distBonus, sampleTimeBonus };
};

// Crew busy time for a single sampling, matching the crew time displayed by the
// NewCoreSample dialog: travel to the site, any wait for the core drill to arrive,
// the sample itself, then the return to the crew's station.
export const getSamplingCrewDuration = (asteroidId, crew, crewBonuses, lotIndex, originLotIndex) => {
  const travelBonus = crewBonuses.travelBonus.totalBonus;
  const distBonus = crewBonuses.distBonus.totalBonus;
  const oneWayTravelTime = Asteroid.getLotTravelTimeReal(
    asteroidId,
    crew._location.lotIndex,
    lotIndex,
    travelBonus,
    distBonus,
    crew._timeAcceleration
  );
  const drillTravelTime = originLotIndex != null
    ? Asteroid.getLotTravelTimeReal(asteroidId, originLotIndex, lotIndex, travelBonus, distBonus, crew._timeAcceleration)
    : oneWayTravelTime; // starter-pack drills arrive with the crew
  const sampleTime = Time.toRealDurationCeil(
    Deposit.getSampleTime(crewBonuses.sampleTimeBonus.totalBonus),
    crew._timeAcceleration
  );
  return oneWayTravelTime + Math.max(0, drillTravelTime - oneWayTravelTime) + sampleTime + oneWayTravelTime;
};

// Assign the closest drill source that still has drills remaining. Starter-pack
// entitlement sources travel with the crew, so they never add drill delay.
const allocateDrillSource = (asteroidId, lotIndex, sources) => {
  let closest = null;
  sources.forEach((source) => {
    if (source.remaining <= 0) return;
    const distance = source.lotIndex != null
      ? Asteroid.getLotDistance(asteroidId, source.lotIndex, lotIndex)
      : -1;
    if (!closest || distance < closest.distance) {
      closest = { source, distance };
    }
  });
  return closest?.source || null;
};

/**
 * Plan a sequential batch of core samplings for a single crew. Jobs are started
 * in order, each when the previous finishes, beginning when the crew is next
 * available. The batch (including time the crew is already busy) must finish
 * within crewScheduleBuffer (24h) of the current block time.
 *
 * drillSources: [{ id, label, slot, lotIndex, remaining }] (lotIndex null = travels with crew)
 * jobs: ordered [{ lotId, lotIndex, resourceId }]
 */
export const planCoreSamplingBatch = ({
  asteroidId,
  blockTime,
  crew,
  crewBonuses,
  crewScheduleBuffer,
  drillSources,
  jobs
}) => {
  const sources = (drillSources || []).map((source) => ({ ...source }));
  const budgetEnd = blockTime + crewScheduleBuffer;

  let cursor = Math.max(blockTime, crew?.Crew?.readyAt || blockTime);
  const batchStart = cursor;
  const plannedJobs = (jobs || []).map((job) => {
    const drillSource = allocateDrillSource(asteroidId, job.lotIndex, sources);
    if (drillSource) drillSource.remaining -= 1;

    const duration = getSamplingCrewDuration(asteroidId, crew, crewBonuses, job.lotIndex, drillSource?.lotIndex);
    const startTime = cursor;
    const finishTime = startTime + duration;
    cursor = finishTime;

    return {
      ...job,
      drillSource,
      duration,
      startTime,
      finishTime,
      hasDrillSource: !!drillSource,
      isWithinBudget: !!drillSource && finishTime <= budgetEnd
    };
  });

  return {
    jobs: plannedJobs,
    startTime: plannedJobs.length ? plannedJobs[0].startTime : batchStart,
    finishTime: plannedJobs.length ? plannedJobs[plannedJobs.length - 1].finishTime : batchStart,
    isWithinBudget: plannedJobs.length > 0 && plannedJobs.every((job) => job.isWithinBudget)
  };
};

const lotAbundanceCache = new Map();

// Per-lot resource abundances, sorted from most to least abundant. Expensive to
// compute (~200ms per lot), so results are cached per scanned asteroid + lot.
export const getLotResourceAbundances = (asteroid, lotIndex) => {
  if (!asteroid?.id || !lotIndex) return [];
  const cacheKey = `${Number(asteroid.id)}-${Number(lotIndex)}`;
  if (lotAbundanceCache.has(cacheKey)) return lotAbundanceCache.get(cacheKey);

  const asteroidAbundances = Asteroid.Entity.getAbundances(asteroid);
  const abundances = Object.keys(asteroidAbundances || {})
    .reduce((acc, i) => {
      if (asteroidAbundances[i] > 0) {
        acc.push({
          i: Number(i),
          abundance: Asteroid.Entity.getAbundanceAtLot(asteroid, lotIndex, Number(i))
        });
      }
      return acc;
    }, [])
    .sort((a, b) => b.abundance - a.abundance);

  lotAbundanceCache.set(cacheKey, abundances);
  return abundances;
};

// Extractor buildings grouped with the lots they occupy and their distance
// from the crew's station.
export const getExtractorLots = (asteroidId, extractors, crewLotIndex) => {
  return (extractors || [])
    .map((extractor) => {
      const lotId = extractor.Location?.locations?.find((l) => l.label === Entity.IDS.LOT)?.id;
      if (!lotId) return null;
      const lotIndex = Lot.toIndex(lotId);
      return {
        extractor,
        lotId,
        lotIndex,
        distance: Asteroid.getLotDistance(asteroidId, crewLotIndex, lotIndex)
      };
    })
    .filter((lot) => !!lot);
};
