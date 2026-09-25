const { TextDecoder, TextEncoder } = require('util');
global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

jest.mock('~/lib/priceUtils', () => ({ TOKEN: { SWAY: 'sway' }, TOKEN_SCALE: { sway: 1e6 } }), { virtual: true });
jest.mock('~/lib/utils', () => ({ safeBigInt: (value) => BigInt(value || 0) }), { virtual: true });

const { Building, Permission } = require('@influenceth/sdk');
const { canRestoreExpiredLotLease, canExtendAgreement, getLotLeaseAuctionStatus } = require('./leaseUtils');
const blockTime = 10000000;
const agreement = { permission: Permission.IDS.USE_LOT, endTime: 1000, rate: 100 };
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
  const expiredAgreement = { ...agreement, permitted: { id: 2493 } };
  const buildingLot = {
    ...lot,
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
  expect(canExtendAgreement({ agreement: { endTime: 1000 }, blockTime, isExpiredLeaseRenewal })).toBe(expected);
});

test('owning another eligible crew does not allow the selected unrelated crew to restore', () => {
  expect(canRestoreExpiredLotLease({
    crewId: 999,
    accountCrewIds: [999, 2493],
    lot,
    expiredAgreement: { ...agreement, permitted: { id: 2493 } }
  })).toBe(false);
});
