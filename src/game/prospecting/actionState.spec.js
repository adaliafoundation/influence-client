/** @jest-environment node */
import { prospectingActionState } from './actionState';
const base = { resourceName: 'Water', connected: true, unlocked: true };

it('uses the standard start style rather than the finish style for a new campaign', () => {
  const state = prospectingActionState(base);
  expect(state.label).toBe('Prospect for Water');
  expect(state.flags.attention).toBe(false);
  expect(state.flags.disabled).toBe(false);
});

it.each([
  [{ unlocked: false }, 'Prospect for Water', false],
  [{ loading: true }, 'Loading Prospecting', false],
  [{ error: true }, 'Recover Prospecting', false],
  [{ summary: { samples: 3 } }, 'Continue Water Prospecting', false],
  [{ summary: { samples: 10, productive: true } }, 'Review Water Claim', true],
  [{ summary: { samples: 10, productive: false } }, 'Review Water Campaign', false],
  [{ summary: { samples: 10, finalized: true } }, 'View Water Claim', false]
])('has the appropriate hover label and completion styling for %o', (changes, label, attention) => {
  const state = prospectingActionState({ ...base, ...changes });
  expect(state.label).toBe(label);
  expect(state.detail.length).toBeGreaterThan(0);
  expect(state.flags.attention).toBe(attention);
});

it('disables signed-out and loading actions but lets locked campaigns open recovery', () => {
  expect(prospectingActionState({ ...base, connected: false }).flags.disabled).toBe(true);
  expect(prospectingActionState({ ...base, loading: true }).flags.loading).toBe(true);
  expect(prospectingActionState({ ...base, unlocked: false }).flags.disabled).toBe(false);
});
