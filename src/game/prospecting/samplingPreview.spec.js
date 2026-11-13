/** @jest-environment node */
import { samplingPreview } from './samplingPreview';

jest.mock('@zkpassport/poseidon2', () =>
  jest.requireActual('../../../node_modules/@zkpassport/poseidon2/dist/cjs/index.cjs')
);
const site = { index: 1, x: 0, z: 0 };
const source = [1, 1, 0, 2, 0, 0, 1, 0, 0, 100, 0, 100, 10000, 500000, 500000];

it('accounts for accidents in Follow ore chance and distinguishes productive approaches', () => {
  const initial = samplingPreview({ site, depth: 0, abundance: 0.1 });
  expect(initial[0].value).toBe('23% ore chance');
  expect(initial[0].risk).toBe('5% stuck drill');
  const following = samplingPreview({ source, site, depth: 1, abundance: 0.1 });
  expect(following[0].value).toBe('68% ore chance');
  expect(following[0].risk).toContain('5% blocked route');
});

it('shows formation-specific quantity and rate potential without inventing ore', () => {
  const choices = samplingPreview({ cell: source, source, site, depth: 0, abundance: 0.5 });
  expect(choices[1].value).toBe('Up to 3.5× ore');
  expect(choices[1].risk).toContain('8% cave-in (−20% ore)');
  expect(choices[2].value).toBe('Up to 125% rate');
  const barren = samplingPreview({ cell: [1, 1, 0, 0], site, depth: 0, abundance: 0.1 });
  expect(barren[1].value).toBe('Find ore first');
  expect(barren[2].value).toBe('Find ore first');
});
