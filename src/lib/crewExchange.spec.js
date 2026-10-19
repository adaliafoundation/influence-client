const { TextDecoder, TextEncoder } = require('util');
global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;
const { getCrewExchangeWarnings } = require('./crewExchange');

const crew = (id, roster, StarterPack) => ({ id, Crew: { roster }, StarterPack });
const clean = { campaign: '1', cutoff: '100', participated: false, invalidated: false };
const participated = { ...clean, participated: true };
const pack = { valid: true, lotAllowance: 1 };
const source = crew(101, [1, 2], pack);
const destination = crew(102, [3], pack);

test('reordering preserves mission eligibility and pack benefits', () => {
  expect(getCrewExchangeWarnings([source, destination], [[2, 1], [3]], [participated, participated]))
    .toEqual({ missions: [], benefits: [] });
});

test('moving a participating member warns for both crews', () => {
  expect(getCrewExchangeWarnings([source, destination], [[2], [1, 3]], [participated, clean]))
    .toEqual({ missions: [source, destination], benefits: [source, destination] });
});

test('acceptance alone does not invalidate missions', () => {
  expect(getCrewExchangeWarnings([source, destination], [[2], [1, 3]], [clean, clean]).missions).toEqual([]);
});

test('receiving a member changes a participating destination even when the source is clean', () => {
  expect(getCrewExchangeWarnings([source, destination], [[2], [1, 3]], [clean, participated]).missions).toEqual([destination]);
});

test('a legacy source invalidates its recipient, but does not warn for already invalid crews', () => {
  expect(getCrewExchangeWarnings([crew(100, [1, 2]), destination], [[2], [1, 3]], [clean, clean]).missions).toEqual([destination]);
});

test('splitting into a new crew propagates mission invalidation', () => {
  const newCrew = crew(0, []);
  expect(getCrewExchangeWarnings([source, newCrew], [[2], [1]], [participated, null]).missions).toEqual([source, newCrew]);
});

test('inactive campaigns and exhausted or invalid packs do not warn', () => {
  const crews = [crew(101, [1], { valid: true, lotAllowance: 0 }), crew(102, [2], { ...pack, valid: false })];
  expect(getCrewExchangeWarnings(crews, [[], [1, 2]], [{ campaign: null }, { campaign: null }]))
    .toEqual({ missions: [], benefits: [] });
});

test.each([
  { buildingAllowances: [{ count: 1 }] }, { foodReloadAllowance: 1 }, { coreSampleAllowance: 1 }, { lotAllowance: 1 }
])('any remaining benefit requires acknowledgement: %j', (allowances) => {
  const funded = crew(101, [1], { valid: true, ...allowances });
  expect(getCrewExchangeWarnings([funded, destination], [[], [1, 3]], [clean, clean]).benefits).toContain(funded);
});

test('two-way exchange propagates invalidity back to a clean source', () => {
  expect(getCrewExchangeWarnings([source, destination], [[3], [1, 2]], [clean, participated]).missions)
    .toEqual([source, destination]);
});

test('splitting an unused crew does not invalidate mission eligibility', () => {
  expect(getCrewExchangeWarnings([source, crew(0, [])], [[2], [1]], [clean, null]).missions).toEqual([]);
});
