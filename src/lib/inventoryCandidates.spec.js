const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const { Entity, Inventory } = require('@influenceth/sdk');
const { inventoryTypesForSelection, inventoryCandidateQuery, selectInventoryCandidates, inventoryCandidateAffected } = require('./inventoryCandidates');
const type = Number(Object.keys(Inventory.TYPES).find(id => Number(id) > 0));
const inventory = { slot: 1, status: Inventory.STATUSES.AVAILABLE, inventoryType: type, mass: 20, contents: [{ product: 7, amount: 2 }] };
const entity = { id: 1, label: Entity.IDS.BUILDING, Inventories: [inventory] };

test('filters empty, wrong-product and excluded slots before authorization', () => {
  const options = { inventoryTypes: [type], productIds: [7], isSourcing: true };
  const entities = [entity, { ...entity, id: 2, Inventories: [{ ...inventory, mass: 0 }] },
    { ...entity, id: 3, Inventories: [{ ...inventory, contents: [{ product: 7, amount: 0 }] }] }];
  expect(selectInventoryCandidates(entities, options).map(e => e.id)).toEqual([1]);
  expect(selectInventoryCandidates(entities, { ...options, otherEntity: entity, otherInvSlot: 1 })).toEqual([]);
  expect(entity.Inventories).toEqual([inventory]);
});

test('destination discovery includes empty compatible inventories', () => {
  expect(selectInventoryCandidates([{ ...entity, Inventories: [{ ...inventory, mass: 0, contents: [] }] }],
    { inventoryTypes: [type], isSourcing: false })).toHaveLength(1);
});

test('site exclusion and product compatibility use SDK inventory definitions', () => {
  const types = inventoryTypesForSelection({ excludeSites: true, itemIds: [7], itemIdsRequireAllAllowed: true });
  types.forEach(id => {
    expect(Inventory.TYPES[id].category).not.toBe(Inventory.CATEGORIES.SITE);
    if (Inventory.TYPES[id].productConstraints) expect(Object.keys(Inventory.TYPES[id].productConstraints)).toContain('7');
  });
});

test('search narrows within the same available inventory, retaining all permission models', () => {
  const query = inventoryCandidateQuery({ inventoryTypes: [type], productIds: [7], isSourcing: true }).toJSON();
  expect(query.nested.path).toBe('Inventories');
  expect(query.nested.query.bool.filter).toEqual(expect.arrayContaining([
    { terms: { 'Inventories.inventoryType': [type] } },
    { terms: { 'Inventories.contents.product': [7] } },
    { range: { 'Inventories.mass': { gt: 0 } } }
  ]));
  expect(JSON.stringify(query)).not.toMatch(/Control|Policy|Agreement/);
});

test('newly stocked inventories invalidate filtered discovery even if absent from its previous results', () => {
  const change = { label: Entity.IDS.BUILDING, id: 3 };
  expect(inventoryCandidateAffected(change, Entity.IDS.BUILDING, 1)).toBe(true);
  expect(inventoryCandidateAffected(change, Entity.IDS.SHIP, 1)).toBe(false);
  const elsewhere = { Location: { locations: [{ label: Entity.IDS.ASTEROID, id: 2 }] } };
  expect(inventoryCandidateAffected(change, Entity.IDS.BUILDING, 1, elsewhere)).toBe(false);
});
