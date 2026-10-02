import { searchAffectedByEntity, searchInvalidationFilters } from './searchInvalidation';
jest.mock('@influenceth/sdk', () => ({ Entity: { IDS: { ASTEROID: 3, BUILDING: 5, SHIP: 6, DEPOSIT: 4, CREW: 1, CREWMATE: 2, LOT: 7 } } }));

const search = (type, filters, hits = []) => ({
  queryKey: ['search', type, { from: 100 }],
  meta: { searchFilters: searchInvalidationFilters(type, filters) },
  state: { data: { hits } }
});
const building = { id: 10, label: 5, newGroupEval: { updatedValues: { status: 2 }, filters: { asteroidId: 1, controllerId: 20 } } };

test('narrows building refreshes by unchanged asteroid and controller, including paginated searches', () => {
  expect(searchAffectedByEntity(search('buildings', { asteroid: '1' }), building)).toBe(true);
  expect(searchAffectedByEntity(search('buildings', { asteroid: 2 }), building)).toBe(false);
  expect(searchAffectedByEntity(search('buildings', { controller: 21 }), building)).toBe(false);
  expect(searchAffectedByEntity(search('buildings', { construction: ['1'] }), building)).toBe(true);
  expect(searchAffectedByEntity(search('ships', { asteroid: 1 }), building)).toBe(false);
});

test('refreshes searches an entity leaves, even when it is not on the cached page', () => {
  const moved = { id: 10, label: 6, newGroupEval: { updatedValues: { asteroidId: 2 }, filters: { asteroidId: 1 } } };
  expect(searchAffectedByEntity(search('ships', { asteroid: 1 }), moved)).toBe(true);
  expect(searchAffectedByEntity(search('ships', { asteroid: 2 }), moved)).toBe(true);
  const transferred = { ...building, newGroupEval: { updatedValues: { controllerId: 30 }, filters: { controllerId: 20 } } };
  expect(searchAffectedByEntity(search('buildings', { controller: 20 }), transferred)).toBe(true);
});

test('new stationary assets only affect their own asteroid, and existing hits are always refreshed', () => {
  const created = { id: 10, label: 5, newGroupEval: { updatedValues: { asteroidId: 1 } } };
  expect(searchAffectedByEntity(search('buildings', { asteroid: 2 }), created)).toBe(false);
  expect(searchAffectedByEntity(search('buildings', { asteroid: 2 }, [{ id: 10, label: 5 }]), created)).toBe(true);
});

test('unknown criteria remain conservative and deposits use the actual search type', () => {
  expect(searchAffectedByEntity(search('buildings', { asteroid: 2 }), { id: 10, label: 5 })).toBe(true);
  const autocomplete = search('buildings', {});
  delete autocomplete.meta;
  expect(searchAffectedByEntity(autocomplete, building)).toBe(true);
  const deposit = { id: 10, label: 4, newGroupEval: { filters: { asteroidId: 1, resourceId: 3 } } };
  expect(searchAffectedByEntity(search('deposits', { asteroid: 1, resource: ['3', '4'] }), deposit)).toBe(true);
  expect(searchAffectedByEntity(search('deposits', { resource: ['4'] }), deposit)).toBe(false);
});
