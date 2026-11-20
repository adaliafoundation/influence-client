// NOTE: react-scripts runs jest with resetMocks, so implementations must be plain
// functions (module-scope jest.fn implementations get stripped before each test).
jest.mock('@influenceth/sdk', () => ({
  Asteroid: {
    getLotDistance: (asteroidId, from, to) => Math.abs(from - to),
    getLotTravelTimeReal: (asteroidId, from, to) => 100 * Math.abs(from - to),
    Entity: {
      getAbundances: () => ({ 1: 0.5, 2: 0.3 }),
      getAbundanceAtLot: (asteroid, lotIndex, resourceId) => (resourceId === 1 ? 0.25 : 0.75)
    }
  },
  Crewmate: {
    ABILITY_IDS: { HOPPER_TRANSPORT_TIME: 1, FREE_TRANSPORT_DISTANCE: 2, CORE_SAMPLE_TIME: 3 }
  },
  Deposit: {
    getSampleTime: () => 500,
    STATUSES: { SAMPLED: 2 }
  },
  Entity: { IDS: { LOT: 1, BUILDING: 2 } },
  Lot: { toIndex: (id) => Number(id) },
  Time: { toRealDurationCeil: (duration) => duration }
}));
jest.mock('./utils', () => ({ getCrewAbilityBonuses: () => ({}) }));

const {
  getExtractorLots,
  getLotResourceAbundances,
  getSamplingCrewDuration,
  planCoreSamplingBatch
} = require('./coreSamplingBatch');

const crew = { _location: { lotIndex: 10 }, _timeAcceleration: 1, Crew: { readyAt: 1500 } };
const crewBonuses = { travelBonus: {}, distBonus: {}, sampleTimeBonus: {} };

const source = (id, lotIndex, remaining) => ({ id, label: 2, slot: 1, lotIndex, remaining });

describe('getSamplingCrewDuration', () => {
  test('includes travel both ways and the sample time', () => {
    // starter-pack drills arrive with the crew, so no drill delay
    expect(getSamplingCrewDuration(1, crew, crewBonuses, 20, null)).toEqual(2500);
  });

  test('adds drill delay when the drill source is farther than the crew', () => {
    expect(getSamplingCrewDuration(1, crew, crewBonuses, 20, 40)).toEqual(3500);
  });

  test('ignores drill delay when the drill source is closer than the crew', () => {
    expect(getSamplingCrewDuration(1, crew, crewBonuses, 20, 15)).toEqual(2500);
  });
});

describe('planCoreSamplingBatch', () => {
  const jobs = [
    { lotId: 101, lotIndex: 20, resourceId: 1 },
    { lotId: 102, lotIndex: 30, resourceId: 1 }
  ];

  const plan = (overrides) => planCoreSamplingBatch({
    asteroidId: 1,
    blockTime: 1000,
    crew,
    crewBonuses,
    crewScheduleBuffer: 86400,
    drillSources: [source(1, 25, 10)],
    jobs,
    ...overrides
  });

  test('runs jobs sequentially, starting when the crew is next available', () => {
    const result = plan();
    expect(result.jobs[0]).toMatchObject({ startTime: 1500, finishTime: 4000 });
    expect(result.jobs[1]).toMatchObject({ startTime: 4000, finishTime: 8500 });
    expect(result).toMatchObject({ startTime: 1500, finishTime: 8500, isWithinBudget: true });
  });

  test('flags jobs that exceed the schedule buffer, including current busy time', () => {
    const result = plan({ crewScheduleBuffer: 3100 });
    expect(result.jobs[0].isWithinBudget).toBe(true);
    expect(result.jobs[1].isWithinBudget).toBe(false);
    expect(result.isWithinBudget).toBe(false);
  });

  test('allocates the closest drill source and decrements availability', () => {
    const result = plan({ drillSources: [source(1, 22, 1), source(2, 40, 1)] });
    expect(result.jobs[0].drillSource).toMatchObject({ id: 1, remaining: 0 });
    expect(result.jobs[1].drillSource).toMatchObject({ id: 2, remaining: 0 });
  });

  test('flags jobs without any remaining drill source', () => {
    const result = plan({ drillSources: [source(1, 25, 1)] });
    expect(result.jobs[0].hasDrillSource).toBe(true);
    expect(result.jobs[1]).toMatchObject({ hasDrillSource: false, isWithinBudget: false });
    expect(result.isWithinBudget).toBe(false);
  });

  test('prefers starter-pack entitlement over sourced drills', () => {
    const result = plan({ drillSources: [source(1, 25, 10), source(0, null, 1)] });
    expect(result.jobs[0].drillSource).toMatchObject({ id: 0, lotIndex: null, remaining: 0 });
    expect(result.jobs[1].drillSource).toMatchObject({ id: 1, remaining: 9 });
  });

  test('uses starter-pack entitlement only up to its allowance', () => {
    const result = plan({ drillSources: [source(0, null, 1)] });
    expect(result.jobs[0].drillSource).toMatchObject({ id: 0 });
    expect(result.jobs[1].hasDrillSource).toBe(false);
  });
});

describe('getExtractorLots', () => {
  const extractor = (id, lotId) => ({
    id,
    label: 2,
    Location: { locations: [{ label: 1, id: lotId }] }
  });

  test('maps extractors to their lots with distance from the crew', () => {
    const lots = getExtractorLots(1, [extractor(1, 50), extractor(2, 15)], 10);
    expect(lots).toEqual([
      { extractor: extractor(1, 50), lotId: 50, lotIndex: 50, distance: 40 },
      { extractor: extractor(2, 15), lotId: 15, lotIndex: 15, distance: 5 }
    ]);
  });

  test('skips extractors without a lot location', () => {
    expect(getExtractorLots(1, [{ id: 1, label: 2, Location: { locations: [] } }], 10)).toEqual([]);
  });
});

describe('getLotResourceAbundances', () => {
  test('returns abundances sorted from most to least abundant', () => {
    expect(getLotResourceAbundances({ id: 9 }, 5)).toEqual([
      { i: 2, abundance: 0.75 },
      { i: 1, abundance: 0.25 }
    ]);
  });

  test('caches results per asteroid and lot', () => {
    const first = getLotResourceAbundances({ id: 10 }, 5);
    const second = getLotResourceAbundances({ id: 10 }, 5);
    expect(second).toBe(first);
  });
});
