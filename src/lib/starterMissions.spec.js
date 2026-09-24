const { TextDecoder, TextEncoder } = require('util');
global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;
const { Entity, StarterMission, System } = require('@influenceth/sdk');
const {
  STARTER_MISSION_IMAGES, canonicalCrewId, starterMissionsQueryKey,
  getStarterMissionAssignment, getMissionAssignmentKey,
  assertStarterMissionOperation, assertStarterMissionAction,
  getStarterMissionActionCall, getMissionValidationArguments, getMissionCompletionCalls
} = require('./starterMissions');
const manifest = require('../assets/media/licensedMedia.v1.json');

const view = {
  campaign: '123', active: true, eligible: true, recipient: '0xabc',
  subject: { label: Entity.IDS.CREW, id: '501' },
  missions: [{ id: 0, canAccept: true, accepted: false, claimable: false }]
};
const assignment = getStarterMissionAssignment(view, 0);
const crew = view.subject;
const entity = (id, label = Entity.IDS.BUILDING) => ({ id, label });

test('completion validates before claiming and requires recorded objectives', () => {
  expect(getMissionCompletionCalls({ assignment })).toEqual([
    { system: 'MissionValidate', vars: { assignment, arguments: [] } },
    { system: 'ClaimMissionReward', vars: { assignment } }
  ]);
  const ready = { ...view, missions: [{ id: 0, accepted: true, earned: true }] };
  expect(() => assertStarterMissionOperation(ready, assignment, 'CompleteStarterMission', '0xabc')).not.toThrow();
  for (const flags of [{ earned: false }, { accepted: false }, { claimed: true }]) {
    const blocked = { ...ready, missions: [{ ...ready.missions[0], ...flags }] };
    expect(() => assertStarterMissionOperation(blocked, assignment, 'CompleteStarterMission', '0xabc')).toThrow('not currently');
  }
  expect(() => assertStarterMissionOperation({ ...ready, eligible: false }, assignment, 'CompleteStarterMission', '0xabc')).toThrow('not currently');
});

test('maps all eight SDK missions to registered media', () => {
  expect(Object.keys(STARTER_MISSION_IMAGES)).toHaveLength(8);
  Object.values(StarterMission.IDS).forEach((id) => {
    expect(manifest.assets[STARTER_MISSION_IMAGES[id]]).toBeDefined();
  });
});

test('normalizes crew IDs without losing precision and scopes queries by deployment', () => {
  expect(canonicalCrewId('0x20000000000001')).toBe('9007199254740993');
  expect(() => canonicalCrewId(9007199254740992)).toThrow('Unsafe');
  expect(() => canonicalCrewId('1.5')).toThrow();
  expect(() => canonicalCrewId('18446744073709551616')).toThrow();
  expect(starterMissionsQueryKey('SN', 'api', '0x1f5')).toEqual(['starterMissions', 'SN', 'api', '501']);
  expect(getMissionAssignmentKey(assignment)).toBe('123:1:501:0');
});

test('checks authority and campaign, but allows completed rewards after invalidation', () => {
  expect(() => assertStarterMissionOperation(view, assignment, 'AcceptMission', '0xabc')).not.toThrow();
  expect(() => assertStarterMissionOperation(view, assignment, 'AcceptMission', '0xdef')).toThrow('delegate');
  expect(() => assertStarterMissionOperation({ ...view, campaign: '124' }, assignment, 'AcceptMission', '0xabc')).toThrow('changed');
  const invalidated = { ...view, eligible: false, invalidated: true, missions: [{ id: 0, accepted: true, completed: true, claimable: true }] };
  expect(() => assertStarterMissionOperation(invalidated, assignment, 'ClaimMissionReward', '0xabc')).not.toThrow();
  expect(() => assertStarterMissionOperation(invalidated, assignment, 'MissionValidate', '0xabc')).toThrow('not currently');
  expect(() => assertStarterMissionOperation(view, assignment, 'ConstructionPlan', '0xabc')).toThrow('not currently');
});

test.each(['FillSellOrder', 'FillBuyOrder', 'BulkFillSellOrder', 'ResupplyFoodFromExchange', 'AcceptDelivery', 'SampleDepositImprove'])('does not wrap %s', (name) => {
  expect(() => assertStarterMissionAction(name)).toThrow('not supported');
});

test.each(['FlexibleExtractResourceStart', 'LeaseAndProcessProductsStart'])('supports independently paid composite %s', (name) => {
  expect(() => assertStarterMissionAction(name)).not.toThrow();
});

test.each([
  ['ConstructionPlan', { building_type: 1, lot: entity(100, Entity.IDS.LOT), caller_crew: crew }],
  ['SampleDepositStart', { lot: entity(100, Entity.IDS.LOT), resource: 1, origin: entity(4), origin_slot: 2, caller_crew: crew }],
  ['ProcessProductsStart', { processor: entity(4), processor_slot: 1, process: 1, target_output: 1, recipes: 1.5, origin: entity(5), origin_slot: 2, destination: entity(6), destination_slot: 2, caller_crew: crew }],
  ['SendDelivery', { origin: entity(4), origin_slot: 2, products: [{ product: 1, amount: 100 }], dest: entity(5), dest_slot: 2, caller_crew: crew }]
])('serializes %s arguments without caller crew, preserving native struct/array formats', (name, vars) => {
  const call = getStarterMissionActionCall(name, vars, assignment, '0x123');
  const native = System.formatSystemCalldata(name, vars);
  const crewData = System.formatSystemCalldata(name, vars, ['caller_crew']);
  expect(call).toEqual(System.getRunSystemCall('MissionAction', {
    assignment, action: name, arguments: native.slice(0, -crewData.length)
  }, '0x123'));
  expect(() => getStarterMissionActionCall(name, { ...vars, caller_crew: entity(502, Entity.IDS.CREW) }, assignment, '0x123')).toThrow('does not match');
});

test('serializes optional delivery reconciliation without caller crew', () => {
  expect(getMissionValidationArguments()).toEqual([]);
  const delivery = entity(999, Entity.IDS.DELIVERY);
  expect(getMissionValidationArguments(delivery)).toEqual([Entity.IDS.DELIVERY, 999]);
  expect(() => getMissionValidationArguments(entity(999))).toThrow('Delivery');
});

test('finds pending native mission actions and lifecycle transactions across canonical IDs', () => {
  const { findPendingMissionTransaction } = require('./starterMissions');
  const tx = { key: 'ConstructionPlan', meta: { missionAssignment: { ...assignment, campaign: '0x7b' } } };
  expect(findPendingMissionTransaction([tx], assignment)).toBe(tx);
  expect(findPendingMissionTransaction([tx], { ...assignment, mission: 1 })).toBeUndefined();
  const claim = { key: 'ClaimMissionReward', vars: { assignment } };
  expect(findPendingMissionTransaction([claim], assignment)).toBe(claim);
});
