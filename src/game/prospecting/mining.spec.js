/** @jest-environment node */
import { Claim, Deposit, Entity, Lot, Mining, Prospecting } from '@influenceth/sdk';
import { getLocalClaim, getMiningOptions, getMiningPreview, getExtractionDuration } from './mining';
import fixture from './__fixtures__/campaign.json';

const p = fixture.input;
const record = {
  ...Prospecting.createRecord({ identity: { chainId: '0x1', game: '0x2', owner: '0x3',
    asteroidId: 1, originIndex: Number(p.origin), resource: 2 }, context: p.context, mode: 'local-simulation' }),
  claimIndex: Number(p.selected),
  actions: p.methods.map((method, i) => ({
    action: { method: Number(method), target: Number(p.targets[i]), source: Number(p.sources[i]),
      depth: Number(p.depths[i]), salt: String(p.salts[i]) },
    meta: String(p.meta[i]), mask: String(p.blockedApproaches[i]), randomness: String(p.randomness[i])
  }))
};
const claim = getLocalClaim(record);
const asteroid = { id: 1, Celestial: { abundances: String(50n + (49n << 10n)) } };
const legacy = {
  id: 9, label: Entity.IDS.DEPOSIT,
  Location: { location: { label: Entity.IDS.LOT, id: claim.lotId } },
  Deposit: { resource: 1, status: Deposit.STATUSES.USED, initialYield: 3000000, remainingYield: 2000000 }
};
const lot = { id: claim.lotId, deposits: [legacy] };
const options = () => getMiningOptions({ asteroid, lot, campaigns: [record], canUseClaim: () => true });

it('routes a finalized campaign to its chosen lot and applies the volume boost once', () => {
  expect(claim.lotId).toBe(Lot.toId(1, fixture.expected.result.lot));
  expect(claim.initialYield).toBe(String(Math.floor(fixture.expected.result.quantity * 1.5)));
  expect(options().find((option) => option.claim?.kind === 'local').claim).toEqual(claim);
  const otherLot = { id: Lot.toId(1, claim.lotIndex + 1), deposits: [] };
  expect(getMiningOptions({ asteroid, lot: otherLot, campaigns: [record], canUseClaim: () => true })
    .some((option) => option.claim)).toBe(false);
  expect(() => Mining.quote({ mode: 'claim', claim, resource: 2, lotId: otherLot.id, quantity: 1 })).toThrow('claim lot');
});

it('keeps trace resources accessible through claims, and allows baseline at the inclusive 5% threshold', () => {
  const baseline = options().filter((option) => option.mode === 'baseline');
  expect(baseline.map((option) => option.resource)).toEqual([1]);
  expect(baseline[0].globalAbundancePpm).toBe(50000);
  expect(getMiningPreview(baseline[0], 1000).quote.rateBps).toBe(2500);
  const traceClaim = options().find((option) => option.claim?.kind === 'local');
  expect(traceClaim.resource).toBe(2);
  expect(getMiningPreview(traceClaim, 1000).quote.quantity).toBe(1000);
});

it('previews existing deposits as default claims without modifying their IDs or balances', () => {
  const snapshot = JSON.stringify(legacy);
  const option = options().find((item) => item.claim?.kind === 'legacy');
  expect(option.claim).toEqual(Claim.fromEntity(legacy, { localAbundancePpm: option.claim.referenceAbundancePpm }));
  const preview = getMiningPreview(option, 1000000);
  expect(preview.maxQuantity).toBe(2000000);
  expect(preview.quote).toMatchObject({ rateBps: 12000, remainingYield: '1000000' });
  expect(JSON.stringify(legacy)).toBe(snapshot);
  expect(getMiningOptions({ asteroid, lot, campaigns: [], canUseClaim: () => false })
    .some((item) => item.claim)).toBe(false);
});

it('quotes a constant rate independently of depletion, while retaining bonuses and per-run limits', () => {
  const option = options().find((item) => item.claim?.kind === 'legacy');
  const first = getMiningPreview(option, 1000000).quote;
  const depleted = { ...option, claim: { ...option.claim, remainingYield: '1000000' } };
  expect(getMiningPreview(depleted, 1000000).quote.realSeconds).toBe(first.realSeconds);
  expect(getMiningPreview(option, 1000000, { bonus: 2 }).quote.realSeconds).toBeLessThan(first.realSeconds);
  expect(() => getMiningPreview(option, 2000001)).toThrow('Extraction exceeds');
});

it('retains a pre-activation extraction duration rather than applying the new claim quote', () => {
  const quote = jest.fn(() => { throw new Error('Legacy job must not be re-quoted'); });
  expect(getExtractionDuration({ startTime: 100, finishTime: 900 }, quote)).toBe(800);
  expect(quote).not.toHaveBeenCalled();
});
it('can display an already running extraction before its historical activity or deposit loads', () => {
  const quote = jest.fn(() => Claim.fromEntity(null));
  expect(getExtractionDuration({ finishTime: 900, yield: 1000 }, quote)).toBe(0);
  expect(quote).not.toHaveBeenCalled();
});
it('quotes new extraction jobs normally', () => {
  const quote = jest.fn(() => 800);
  expect(getExtractionDuration(null, quote)).toBe(800);
  expect(quote).toHaveBeenCalledTimes(1);
});

it.each([0, 3000000])('offers a legacy sample/improvement as the same claim only after completion: initial %i', initialYield => {
  const deposit = { ...legacy, Deposit: { ...legacy.Deposit,
    status: Deposit.STATUSES.SAMPLING, initialYield, remainingYield: initialYield } };
  const params = { asteroid, lot: { ...lot, deposits: [deposit] }, campaigns: [], canUseClaim: () => true };
  expect(getMiningOptions(params).filter(option => option.claim)).toEqual([]);
  deposit.Deposit = { ...deposit.Deposit, status: Deposit.STATUSES.SAMPLED,
    initialYield: 4000000, remainingYield: 4000000 };
  const claims = getMiningOptions(params).filter(option => option.claim);
  expect(claims).toHaveLength(1);
  expect(claims[0].claim).toMatchObject({ id: legacy.id, kind: 'legacy',
    initialYield: '4000000', remainingYield: '4000000', rateBps: 12000 });
  expect(deposit.Claim).toBeUndefined();
});
