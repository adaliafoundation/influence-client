const { TextDecoder, TextEncoder } = require('util');
global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

jest.mock('~/lib/priceUtils', () => ({ TOKEN: { SWAY: 'sway' }, TOKEN_SCALE: { sway: 1e6 } }), { virtual: true });
jest.mock('~/lib/utils', () => ({ safeBigInt: (value) => BigInt(value || 0) }), { virtual: true });

const { Building, Permission } = require('@influenceth/sdk');
const { getLotLeaseAuctionStatus } = require('./leaseUtils');
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
