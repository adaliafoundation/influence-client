const { TextDecoder, TextEncoder } = require('util');
global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;
const { Entity, Product } = require('@influenceth/sdk');
const { canParticipateInCampaign, missionBindingKey, missionBindingUrl, verifyMissionAction } = require('./missionBindings');
const subject = { label: Entity.IDS.CREW, id: '501' };
const building = { label: Entity.IDS.BUILDING, id: '999' };
const constructed = { Control: { controller: subject }, Building: { status: 3 } };
const assignment = { campaign: '123', subject, mission: 2 };
const request = { campaign: '123', subject, kind: 'Process', entity: building, slot: 2 };

test('binding identity packs both entities and scopes campaign, environment, and slot', () => {
  expect(missionBindingUrl(request)).toBe(`/v2/missions/campaigns/123/subjects/${Entity.packEntity(subject)}/bindings/Process/${Entity.packEntity(building)}?slot=2`);
  expect(missionBindingUrl({ ...request, kind: 'Built', slot: undefined })).not.toContain('?');
  expect(missionBindingKey('sepolia', 'api', request)).not.toEqual(missionBindingKey('mainnet', 'api', request));
  expect(missionBindingKey('sepolia', 'api', request)).not.toEqual(missionBindingKey('sepolia', 'api', { ...request, slot: 1 }));
});

test('process finishes verify both campaign construction and the exact processor slot', async () => {
  const getBinding = jest.fn().mockResolvedValue({ status: 'matched' });
  await verifyMissionAction({ key: 'ProcessProductsFinish', vars: { processor: building, processor_slot: 2 }, assignment, getBinding, getEntity: async () => constructed });
  expect(getBinding.mock.calls.map(([r]) => [r.kind, r.slot])).toEqual([['Built', undefined], ['Process', 2]]);
});

test.each(['unknown', 'mismatched'])('does not submit an unverified process: %s', async status => {
  const getBinding = jest.fn().mockResolvedValue({ status, reason: 'processor_not_running' });
  await expect(verifyMissionAction({ key: 'ProcessProductsStart', vars: { processor: building }, assignment, getBinding })).rejects.toThrow();
});

test('unbound incoming warehouse deliveries can bind at receipt, but need campaign construction', async () => {
  const getBinding = jest.fn(({ kind }) => Promise.resolve({ status: kind === 'Built' ? 'matched' : 'unbound' }));
  const delivery = { label: Entity.IDS.DELIVERY, id: '1234' };
  const options = { key: 'ReceiveDelivery', vars: { delivery }, assignment, view: { progress: { warehouseId: '999' } }, getBinding,
    getEntity: async entity => entity.label === Entity.IDS.BUILDING ? constructed : ({ Delivery: { dest: building, destSlot: 2 } }) };
  await expect(verifyMissionAction(options)).resolves.toBe(true);
  expect(getBinding).toHaveBeenCalledWith(expect.objectContaining({ kind: 'Built', entity: building }));
  await expect(verifyMissionAction({ ...options, getEntity: async () => ({ Delivery: { dest: building, destSlot: 1 } }) })).resolves.toBe(false);
});

test('unknown delivery evidence does not become the warehouse receipt exception', async () => {
  await expect(verifyMissionAction({ key: 'ReceiveDelivery', vars: { delivery: { label: Entity.IDS.DELIVERY, id: '1234' } }, assignment,
    view: { progress: { warehouseId: '999' } }, getBinding: async ({ kind }) => ({ status: kind === 'Built' ? 'matched' : 'unknown' }),
    getEntity: async entity => entity.label === Entity.IDS.BUILDING ? constructed : ({ Delivery: { dest: building, destSlot: 2 } }) })).rejects.toThrow(/verification/);
});

test('market orders never become campaign actions', async () => {
  await expect(verifyMissionAction({ key: 'CreateSellOrder' })).rejects.toThrow(/cannot contribute/);
});

test('campaign planning rejects unsupported buildings and a second campaign warehouse', async () => {
  await expect(verifyMissionAction({ key: 'ConstructionPlan', vars: { building_type: 9 }, view: {} })).rejects.toThrow(/building type/);
  await expect(verifyMissionAction({ key: 'ConstructionPlan', vars: { building_type: 1 }, view: { progress: { warehouseId: '999' } } })).rejects.toThrow(/already has/);
});

test('campaign extraction rejects sub-threshold quantities before wallet submission', async () => {
  await expect(verifyMissionAction({ key: 'FlexibleExtractResourceStart', vars: { yield: 1, deposit: {} },
    getEntity: async () => ({ Deposit: { resource: 1 } }) })).rejects.toThrow(/100,000 kg/);
});


test('a matched construction fingerprint does not authorize another crew’s building', async () => {
  await expect(verifyMissionAction({ key: 'ProcessProductsStart', vars: { processor: building, recipes: 1 }, assignment,
    getBinding: async () => ({ status: 'matched' }),
    getEntity: async () => ({ ...constructed, Control: { controller: { ...subject, id: '502' } } })
  })).rejects.toThrow(/controlled by this crew/);
});


test.each(['ProcessProductsStart', 'ProcessProductsFinish', 'ConstructionFinish'])(
  'unbound construction makes %s an ordinary action', async key => {
    await expect(verifyMissionAction({ key, vars: { processor: building, building, recipes: 1 }, assignment,
      getBinding: async () => ({ status: 'unbound' }) })).resolves.toBe(false);
  }
);

test('unbound delivery receipt without campaign construction remains ordinary', async () => {
  await expect(verifyMissionAction({ key: 'ReceiveDelivery', vars: { delivery: { label: Entity.IDS.DELIVERY, id: '1234' } }, assignment,
    view: { progress: { warehouseId: '999' } }, getBinding: async () => ({ status: 'unbound' }),
    getEntity: async () => ({ Delivery: { dest: building, destSlot: 2 } }) })).resolves.toBe(false);
});

const preview = {
  view: { active: true, eligible: true, subject, missions: [{ id: 0, accepted: true }], progress: { warehouseId: '999', finalProductIds: [Product.IDS.FOOD] } },
  building: { ...building, ...constructed },
  bindings: [{ kind: 'Built', status: 'matched' }]
};

test.each([
  ['PLAN_BUILDING', { buildingType: 9 }, false],
  ['PLAN_BUILDING', { buildingType: 1 }, false],
  ['PLAN_BUILDING', { buildingType: 2 }, true],
  ['PROCESS', { recipes: 0.5 }, false],
  ['PROCESS', { recipes: 1 }, true],
  ['PROCESS', { running: true }, false],
  ['EXTRACT_RESOURCE', { resource: 1, amount: 1 }, false],
  ['EXTRACT_RESOURCE', { resource: 1, amount: 100000000 / Product.TYPES[1].massPerUnit }, true],
  ['FEED_CREW', { inventorySource: false }, false],
  ['FEED_CREW', { inventorySource: true }, true],
  ['TRANSFER_TO_SITE', {}, false]
])('%s previews qualification for %j', (type, details, expected) => {
  expect(canParticipateInCampaign({ ...preview, type, details })).toBe(expected);
});

test('campaign processing requires crew control and operational construction', () => {
  const options = { ...preview, type: 'PROCESS', details: { recipes: 1 } };
  expect(canParticipateInCampaign({ ...options, building: { ...preview.building, Control: { controller: { ...subject, id: '502' } } } })).toBe(false);
  expect(canParticipateInCampaign({ ...options, building: { ...preview.building, Building: { status: 1 } } })).toBe(false);
  expect(canParticipateInCampaign({ ...options, bindings: [{ kind: 'Built', status: 'unbound' }] })).toBe(false);
});

test('new deliveries qualify only for produced final goods between distinct entities', () => {
  const options = { ...preview, type: 'SURFACE_TRANSFER', details: {
    origin: building, destination: { ...building, id: '1000' }, products: { [Product.IDS.FOOD]: 1 }
  } };
  expect(canParticipateInCampaign(options)).toBe(true);
  expect(canParticipateInCampaign({ ...options, details: { ...options.details, products: { 1: 1 } } })).toBe(false);
  expect(canParticipateInCampaign({ ...options, details: { ...options.details, destination: building } })).toBe(false);
  expect(canParticipateInCampaign({ ...options, details: { ...options.details, unsupported: true } })).toBe(false);
});


test('planned campaign buildings can start construction before a Built binding exists', () => {
  const options = { ...preview, type: 'CONSTRUCT', bindings: [], building: { ...preview.building, Building: { status: 1, buildingType: 1 } } };
  expect(canParticipateInCampaign(options)).toBe(true);
  expect(canParticipateInCampaign({ ...options, building: { ...options.building, id: '1000' } })).toBe(false);
  expect(canParticipateInCampaign({ ...options, building: { ...options.building, Building: { status: 1, buildingType: 2 } } })).toBe(true);
  expect(canParticipateInCampaign({ ...options, building: { ...options.building, Building: { status: 1, buildingType: 9 } } })).toBe(false);
  expect(canParticipateInCampaign({ ...options, building: { ...options.building, Building: { status: 2, buildingType: 1 } } })).toBe(false);
});
