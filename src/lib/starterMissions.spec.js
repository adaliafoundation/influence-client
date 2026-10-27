const { TextDecoder, TextEncoder } = require('util');
global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;
const { Entity, StarterMission } = require('@influenceth/sdk');
const {
  STARTER_MISSION_IMAGES, canonicalEntityId, starterMissionsQueryKey, isMissionTransactionIndexed,
  getStarterMissionAssignment, getMissionAssignmentKey,
  assertStarterMissionOperation,
  getMissionValidationArguments, getMissionCompletionCalls
} = require('./starterMissions');
const manifest = require('../assets/media/licensedMedia.v1.json');

const view = {
  campaign: '123', active: true, eligible: true, recipient: '0xabc',
  subject: { label: Entity.IDS.CREW, id: '501' },
  missions: [{ id: 0, canAccept: true, accepted: false, claimable: false }]
};
const assignment = getStarterMissionAssignment(view, 0);
const entity = (id, label = Entity.IDS.BUILDING) => ({ id, label });

test('completion validates before claiming and requires recorded objectives', () => {
  expect(getMissionCompletionCalls({ assignment })).toEqual([
    { system: 'MissionValidate', vars: { assignment, arguments: [] } },
    { system: 'ClaimMissionReward', vars: { assignment } }
  ]);
  const ready = { ...view, missions: [{ id: 0, accepted: true, earned: true }] };
  expect(() => assertStarterMissionOperation(ready, assignment, 'CompleteMission', '0xabc')).not.toThrow();
  for (const flags of [{ earned: false }, { accepted: false }, { claimed: true }]) {
    const blocked = { ...ready, missions: [{ ...ready.missions[0], ...flags }] };
    expect(() => assertStarterMissionOperation(blocked, assignment, 'CompleteMission', '0xabc')).toThrow('not currently');
  }
  expect(() => assertStarterMissionOperation({ ...ready, eligible: false }, assignment, 'CompleteMission', '0xabc')).toThrow('not currently');
});

test('maps all eight SDK missions to registered media', () => {
  expect(Object.keys(STARTER_MISSION_IMAGES)).toHaveLength(8);
  Object.values(StarterMission.IDS).forEach((id) => {
    expect(manifest.assets[STARTER_MISSION_IMAGES[id]]).toBeDefined();
  });
});

test('normalizes crew IDs without losing precision and scopes queries by deployment', () => {
  expect(canonicalEntityId('0x20000000000001')).toBe('9007199254740993');
  expect(() => canonicalEntityId(9007199254740992)).toThrow('Unsafe');
  expect(() => canonicalEntityId('1.5')).toThrow();
  expect(() => canonicalEntityId('18446744073709551616')).toThrow();
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


test('indexed mission confirmation requires the matching crew, campaign, mission and operation', () => {
  const tx = { key: 'AcceptMission', vars: { assignment } };
  const indexed = { ...view, missions: [{ id: 0, accepted: true }] };
  expect(isMissionTransactionIndexed(tx, indexed)).toBe(true);
  for (const other of [undefined, { ...indexed, campaign: '124' },
    { ...indexed, subject: { ...view.subject, id: '502' } },
    { ...indexed, missions: [{ id: 1, accepted: true }] }]) {
    expect(isMissionTransactionIndexed(tx, other)).toBe(false);
  }
  expect(isMissionTransactionIndexed({ ...tx, key: 'ConstructionPlan' }, indexed)).toBe(false);
});
