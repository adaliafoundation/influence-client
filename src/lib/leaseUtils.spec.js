const { TextDecoder, TextEncoder } = require('util');
global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

jest.mock('~/lib/priceUtils', () => ({ TOKEN: { SWAY: 'sway' }, TOKEN_SCALE: { sway: 1e6 } }), { virtual: true });
jest.mock('~/lib/utils', () => ({ safeBigInt: (value) => BigInt(value || 0) }), { virtual: true });

const { Building, Entity, Permission } = require('@influenceth/sdk');
const { canRestoreExpiredLotLease, canExtendAgreement, getLotLeaseAuctionStatus } = require('./leaseUtils');
const blockTime = 10000000;
const agreement = { permission: Permission.IDS.USE_LOT, endTime: 1000, noticeTime: 0, rate: 100 };
const asteroid = { PrepaidAgreementAuctionSet: { mode: Permission.AUCTION_MODES.MANUAL, gracePeriod: 0 } };
const lot = {
  PrepaidAgreements: [agreement],
  building: { Building: { status: Building.CONSTRUCTION_STATUSES.OPERATIONAL } }
};

test('expired building lots require the administrator to start a manual auction', () => {
  const status = getLotLeaseAuctionStatus({ asteroid, lot, blockTime });
  expect(status.isAuctionRequired).toBe(true);
  expect(status.isManualAuctionBlocked).toBe(true);
  expect(status.isAuctionAvailable).toBe(false);
});

test('manual auction time starts at the start transaction, not lease expiration', () => {
  const status = getLotLeaseAuctionStatus({
    asteroid, blockTime,
    lot: { ...lot, PrepaidAgreementAuction: { status: 1, startTime: blockTime - 60 } }
  });
  expect(status.isAuctionAvailable).toBe(true);
  expect(status.isManualAuctionBlocked).toBe(false);
  expect(status.auctionElapsed).toBe(60);
});

test('expired empty lots do not require an auction', () => {
  const status = getLotLeaseAuctionStatus({ asteroid, lot: { ...lot, building: null }, blockTime });
  expect(status.isAuctionRequired).toBe(false);
  expect(status.isManualAuctionBlocked).toBe(false);
});

test('automatic auctions use the lease expiration time', () => {
  const status = getLotLeaseAuctionStatus({
    asteroid: { PrepaidAgreementAuctionSet: { mode: Permission.AUCTION_MODES.AUTO, gracePeriod: 0 } },
    lot, blockTime
  });
  expect(status.isAuctionAvailable).toBe(true);
  expect(status.auctionElapsed).toBe(blockTime - agreement.endTime);
});

describe('expired lot lease restoration eligibility', () => {
  const expiredAgreement = { ...agreement, permitted: { id: 2493, label: Entity.IDS.CREW } };
  const buildingLot = {
    ...lot,
    UseLot: { tenant: expiredAgreement.permitted },
    building: { ...lot.building, Control: { controller: { id: 5630 } } }
  };

  test.each([
    ['vacant', { building: null }],
    ['ship-only', { building: null, surfaceShip: { id: 751, Control: { controller: { id: 2493 } } } }],
    ['unplanned building', { building: { Building: { status: Building.CONSTRUCTION_STATUSES.UNPLANNED } } }],
  ])('%s lots use new lease handling even for the previous tenant', (_, occupancy) => {
    const vacantLot = { ...lot, ...occupancy };
    expect(canRestoreExpiredLotLease({ crewId: 2493, lot: vacantLot, expiredAgreement })).toBe(false);
    expect(getLotLeaseAuctionStatus({ asteroid, lot: vacantLot, blockTime }).isAuctionRequired).toBe(false);
  });

  test.each([[2493], [5630]])('crew %s can restore a building-backed lease', (crewId) => {
    expect(canRestoreExpiredLotLease({ crewId, lot: buildingLot, expiredAgreement })).toBe(true);
  });

  test('unrelated crews cannot restore the lease', () => {
    expect(canRestoreExpiredLotLease({ crewId: 999, lot: buildingLot, expiredAgreement })).toBe(false);
  });

  test('restoration requires an expired agreement and no active lease', () => {
    expect(canRestoreExpiredLotLease({ crewId: 2493, lot: buildingLot })).toBe(false);
    expect(canRestoreExpiredLotLease({
      crewId: 2493,
      lot: { ...buildingLot, _activeUseLotAgreement: { ...expiredAgreement, endTime: blockTime + 1000 } },
      expiredAgreement
    })).toBe(false);
  });

});

test.each([
  [999, false, true],
  [1000, false, false],
  [1001, false, false],
  [1000, true, true],
])('extension at time %s with restoration %s is allowed: %s', (blockTime, isExpiredLeaseRenewal, expected) => {
  expect(canExtendAgreement({ agreement: { endTime: 1000, noticeTime: 0 }, blockTime, isExpiredLeaseRenewal })).toBe(expected);
});

test('owning another eligible crew does not allow the selected unrelated crew to restore', () => {
  expect(canRestoreExpiredLotLease({
    crewId: 999,
    accountCrewIds: [999, 2493],
    lot,
    expiredAgreement: { ...agreement, permitted: { id: 2493, label: Entity.IDS.CREW } }
  })).toBe(false);
});

test('active and expired lot lease helpers share the inclusive notice boundary', () => {
  const { getActiveUseLotAgreement, getExpiredUseLotAgreement } = require('./leaseUtils');
  const lease = { permission: Permission.IDS.USE_LOT, endTime: 90, noticeTime: 80, noticePeriod: 20 };
  expect(getActiveUseLotAgreement([lease], 100)).toBe(lease);
  expect(getExpiredUseLotAgreement([lease], 100)).toBeNull();
  expect(getActiveUseLotAgreement([lease], 101)).toBeNull();
  expect(getExpiredUseLotAgreement([lease], 101)).toBe(lease);
});

test('cancelled agreements cannot be extended', () => {
  expect(canExtendAgreement({ agreement: { endTime: 1000, noticeTime: 10 }, blockTime: 100 })).toBe(false);
});
test('cleared tenancy cannot be restored from a historical agreement', () => {
  expect(canRestoreExpiredLotLease({ crewId: 1, expiredAgreement: { noticeTime: 0, permitted: { id: 1, label: Entity.IDS.CREW } }, lot: { UseLot: { tenant: null }, building: { Building: { status: 3 } } } })).toBe(false);
});

describe('lot lease eligibility', () => {
  const { getLotLeaseEligibility } = require('./leaseUtils');
  const { evaluateAuthorization } = require('./authorization');
  const asteroidCrew = { label: Entity.IDS.CREW, id: 101, Crew: { delegatedTo: '0x123' } };
  const buildingCrew = { label: Entity.IDS.CREW, id: 102, Crew: { delegatedTo: '0x456' } };
  const asteroid = { Control: { controller: { label: asteroidCrew.label, id: asteroidCrew.id } } };
  const occupiedLot = controller => ({ building: {
    label: Entity.IDS.BUILDING, id: 201, Control: { controller }, Building: { status: Building.CONSTRUCTION_STATUSES.OPERATIONAL }
  } });
  const check = (lot, crews = [asteroidCrew, buildingCrew], targetAsteroid = asteroid) => getLotLeaseEligibility({
    asteroid: targetAsteroid, lot: { UseLot: null, ...lot },
    authorize: (method, args, entities) => evaluateAuthorization({ method, args, entities: [...entities, ...crews], blockTime: 1000 })
  });

  test('blocks a building controlled by the asteroid crew', () => {
    expect(check(occupiedLot(asteroidCrew)).status).toBe('denied');
  });
  test('blocks a different controlling crew delegated to the same wallet', () => {
    expect(check(occupiedLot(buildingCrew), [asteroidCrew, { ...buildingCrew, Crew: { delegatedTo: '0x0123' } }]).status).toBe('denied');
  });
  test('allows buildings controlled by an independent account and empty lots', () => {
    expect(check(occupiedLot(buildingCrew)).status).toBe('allowed');
    expect(check({ building: null }).status).toBe('allowed');
  });
  test('waits for missing controller and delegate data', () => {
    expect(check(occupiedLot(buildingCrew), [], {}).status).toBe('unresolved');
    expect(check(occupiedLot({ label: buildingCrew.label, id: buildingCrew.id }), []).status).toBe('unresolved');
  });

  test.each(['allowed', 'denied', 'unresolved'])('a recorded tenant with %s access determines lease availability', status => {
    const authorize = jest.fn(() => ({ status }));
    const leasedLot = { label: Entity.IDS.LOT, id: 1, UseLot: { tenant: buildingCrew } };
    const result = getLotLeaseEligibility({ asteroid, lot: leasedLot, crew: asteroidCrew, authorize });
    expect(result.status).toBe(status === 'allowed' ? 'denied' : status === 'denied' ? 'allowed' : 'unresolved');
    expect(authorize).toHaveBeenCalledWith('can', [buildingCrew, leasedLot, Permission.IDS.USE_LOT], [buildingCrew, leasedLot]);
  });

  test('waits for tenancy data even on an empty lot', () => {
    expect(getLotLeaseEligibility({ lot: {} }).status).toBe('unresolved');
  });

  test('only prepaid policies allow replacing the same crew’s active lease', () => {
    const authorize = jest.fn(() => ({ status: 'allowed' }));
    const leasedLot = { UseLot: { tenant: buildingCrew } };
    const args = { lot: leasedLot, crew: buildingCrew, authorize };
    expect(getLotLeaseEligibility({ ...args, policyType: Permission.POLICY_IDS.PREPAID }).status).toBe('allowed');
    expect(authorize).not.toHaveBeenCalled();
    expect(getLotLeaseEligibility({ ...args, policyType: Permission.POLICY_IDS.CONTRACT }).status).toBe('denied');
    expect(getLotLeaseEligibility({ ...args, crew: asteroidCrew, policyType: Permission.POLICY_IDS.PREPAID }).status).toBe('denied');
  });
});
