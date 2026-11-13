/** @jest-environment node */
import { Prospecting } from '@influenceth/sdk';
import fixture from './__fixtures__/campaign.json';

it('replays the verified sandbox transcript with the quantity bonus applied once', () => {
  const { input: p, expected } = fixture;
  const identity = { chainId: '0x1', game: '0x2', owner: '0x3', asteroidId: 1,
    originIndex: Number(p.origin), resource: 1 };
  let record = Prospecting.createRecord({ identity, context: p.context, mode: 'local-simulation' });
  for (let i = 0; i < p.methods.length; i++) {
    record = Prospecting.appendSample(record, {
      action: { method: Number(p.methods[i]), target: Number(p.targets[i]), source: Number(p.sources[i]),
        depth: Number(p.depths[i]), salt: String(p.salts[i]) },
      meta: String(p.meta[i]), mask: String(p.blockedApproaches[i]), randomness: String(p.randomness[i])
    });
  }
  record = Prospecting.finalizeRecord(record, Number(p.selected));
  const { finalized, history } = Prospecting.replayCampaign(record);
  expect(history.map((entry) => entry.commitment)).toEqual(p.commitments.map(String));
  expect(finalized).toMatchObject({ ...expected.result, quantity: Math.floor(expected.result.quantity * 1.5) });
});
