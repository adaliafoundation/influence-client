/** @jest-environment node */
import { zero, transition, unpackMeta, claim } from './rules';
import fixture from './__fixtures__/campaign.json';

jest.mock('@zkpassport/poseidon2', () =>
  jest.requireActual(
    '../../../node_modules/@zkpassport/poseidon2/dist/cjs/index.cjs'
  )
);

it('replays the verified five-sample sandbox campaign without changing its claim', () => {
  const { input: p, expected } = fixture;
  let state = Array.from({ length: 10 }, zero);
  state.origin = p.origin;
  const history = [];
  for (let i = 0; i < 5; i++) {
    const action = {
      method: p.methods[i],
      target: p.targets[i],
      source: p.sources[i],
      depth: p.depths[i],
      salt: p.salts[i]
    };
    const result = transition(
      state,
      history,
      p.context,
      i,
      action,
      p.meta[i],
      p.blockedApproaches[i],
      p.randomness[i],
      p.quality
    );
    expect(result.commitment).toBe(p.commitments[i]);
    state = result.state;
    history.push(result);
  }
  const cell = state[p.selected];
  const sample = history.findIndex((h) => h.lot === cell[1]);
  expect(claim(cell, unpackMeta(p.meta[sample]).abundance)).toEqual(
    expected.result
  );
});
