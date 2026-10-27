const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const { Entity, ColonizationMission } = require('@influenceth/sdk');
const { canManageColony, getColonizationAssignment, assertColonizationMissionOperation, getColonizationObjectives, colonizationMissionsQueryKey } = require('./colonizationMissions');
const { isMissionTransactionIndexed } = require('./starterMissions');
const view = { active: true, campaign: '123', subject: { label: Entity.IDS.ASTEROID, id: '99' },
  owner: '0xabc', colonizer: null, missions: [{ id: 0, canAccept: true }] };

test('enrollment allows the NFT owner, not another player or a new owner of an enrolled colony', () => {
  const assignment = getColonizationAssignment(view, 0);
  expect(() => assertColonizationMissionOperation(view, assignment, 'AcceptMission', '0xabc')).not.toThrow();
  expect(() => assertColonizationMissionOperation(view, assignment, 'AcceptMission', '0xdef')).toThrow('original colonizer');
  const sold = { ...view, owner: '0xdef', colonizer: '0xabc' };
  expect(canManageColony(sold, '0xabc')).toBe(false);
  expect(canManageColony(sold, '0xdef')).toBe(false);
  expect(canManageColony({ ...sold, owner: '0xabc' }, '0xabc')).toBe(true);
});

test('cannot accept a scanned asteroid or an unavailable branch', () => {
  const scanned = { ...view, missions: [{ id: 0, canAccept: false }] };
  expect(() => assertColonizationMissionOperation(scanned, getColonizationAssignment(view, 0), 'AcceptMission', '0xabc')).toThrow('not currently');
});

test('a completed capstone cannot be claimed or completed while selected buildings are unavailable', () => {
  const colony = { ...view, colonizer: '0xabc', missions: [{ id: 4, accepted: true, completed: true, earned: false, claimable: false }] };
  for (const operation of ['ClaimMissionReward', 'CompleteMission']) {
    expect(() => assertColonizationMissionOperation(colony, getColonizationAssignment(colony, 4), operation, '0xabc')).toThrow('not currently');
  }
  const restored = { ...colony, missions: [{ ...colony.missions[0], earned: true, claimable: true }] };
  expect(() => assertColonizationMissionOperation(restored, getColonizationAssignment(restored, 4), 'ClaimMissionReward', '0xabc')).not.toThrow();
  const objectives = getColonizationObjectives(colony.missions[0], { selectedBuildings: [{ ready: true }, { ready: false }, { ready: true }] });
  expect(objectives.map(o => o.complete)).toEqual([true, false, true]);
});

test('historical branch rewards survive a building removal, with explicit ownership and claimed guards', () => {
  const branch = { ...view, colonizer: '0xabc', missions: [{ id: 3, accepted: true, completed: true, earned: true, claimable: true }] };
  expect(() => assertColonizationMissionOperation(branch, getColonizationAssignment(branch, 3), 'ClaimMissionReward', '0xabc')).not.toThrow();
  const paid = { ...branch, missions: [{ ...branch.missions[0], claimed: true, claimable: false }] };
  expect(() => assertColonizationMissionOperation(paid, getColonizationAssignment(paid, 3), 'CompleteMission', '0xabc')).toThrow('not currently');
});

test('pending reconciliation distinguishes asteroid and crew subjects with the same ID', () => {
  const accepted = { ...view, missions: [{ id: 0, accepted: true }] };
  const tx = { key: 'AcceptMission', vars: { assignment: getColonizationAssignment(view, 0) } };
  expect(isMissionTransactionIndexed(tx, accepted)).toBe(true);
  expect(isMissionTransactionIndexed(tx, { ...accepted, subject: { ...view.subject, label: Entity.IDS.CREW } })).toBe(false);
  expect(colonizationMissionsQueryKey('SN', 'api', '0x63')).toEqual(['colonizationMissions', 'SN', 'api', '99']);
  expect(Object.values(ColonizationMission.TYPES).reduce((sum, m) => sum + m.reward, 0)).toBe(1500000);
});
