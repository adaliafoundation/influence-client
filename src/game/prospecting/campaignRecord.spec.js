/** @jest-environment node */
import { campaignProofInput } from './proofInput';
import { replayCampaign, campaignRecord } from './campaignRecord';
import fixture from './__fixtures__/campaign.json';

jest.mock('@zkpassport/poseidon2', () =>
  jest.requireActual('../../../node_modules/@zkpassport/poseidon2/dist/cjs/index.cjs')
);
const input = fixture.input;
const identity = { chainId: '0x1', game: '0x9', owner: '0x2', asteroidId: 1, originIndex: Number(input.origin), resource: 1 };
const actions = input.methods.map((method, i) => ({
  action: { method: Number(method), target: Number(input.targets[i]), source: Number(input.sources[i]),
    depth: Number(input.depths[i]), salt: input.salts[i] },
  meta: input.meta[i], mask: input.blockedApproaches[i], randomness: input.randomness[i]
}));
const record = {
  schema: 1, rules: 7, mode: 'local-simulation', quantityMultiplierBps: 15000,
  identity, context: input.context, actions,
  pending: null, selected: null, claimIndex: Number(input.selected)
};

it('replays the transcript and derives the boosted claim, never trusting saved observations', () => {
  const restored = replayCampaign(record, identity);
  expect(restored.finalized.quantity).toBe(Math.floor(fixture.expected.result.quantity * 1.5));
  expect(restored.finalized.rate).toBe(fixture.expected.result.rate);
  expect(campaignRecord({ ...restored, storage: { identity } }).actions).toEqual(actions);
});

it('resolves an interrupted local action without drawing new randomness', () => {
  const interrupted = { ...record, actions: actions.slice(0, -1), pending: actions.at(-1), claimIndex: null };
  const recovered = replayCampaign(interrupted, identity);
  const complete = replayCampaign({ ...record, claimIndex: null }, identity);
  expect(recovered.cells).toEqual(complete.cells);
  expect(recovered.history).toEqual(complete.history);
  expect(recovered.pending).toBeNull();
});

it('rejects another account or incompatible rule version', () => {
  expect(() => replayCampaign(record, { ...identity, owner: 'other' })).toThrow();
  expect(() => replayCampaign({ ...record, rules: 8 }, identity)).toThrow();
});

it('prepares the corrected reward statement and rejects old unresolved campaigns', () => {
  const packet = campaignProofInput(record, identity);
  expect(packet.circuit).toBe('fieldwork-r7-volume150-p10-v1');
  expect(packet.sampleCount).toBe(5);
  expect(packet.input.commitments.slice(0, input.commitments.length).map(String)).toEqual(input.commitments.map(String));
  expect(packet.expectedPublicSignals).not.toEqual(fixture.expected.publicSignals);
  expect(() => campaignProofInput({ ...record, pending: actions[0] }, identity)).toThrow('fully resolved');
});
