const { getMissionObjectiveRows, getMissionScope } = require('./missionObjectives');
const pending = () => null;

test('only the available invitation appears before acceptance, in Ready', () => {
  const view = { active: true, eligible: true, missions: [{ id: 0, canAccept: true }, { id: 1 }] };
  expect(getMissionObjectiveRows(view, pending)).toEqual([
    expect.objectContaining({ invitation: true, type: 'ready', mission: view.missions[0] })
  ]);
  expect(getMissionObjectiveRows({ ...view, eligible: false }, pending)).toEqual([]);
});

test('acceptance replaces the invitation and pending submissions stay in progress', () => {
  const mission = { id: 0, accepted: true };
  expect(getMissionObjectiveRows({ active: true, eligible: true, missions: [mission] }, pending)[0])
    .toMatchObject({ invitation: false, type: 'progress' });
  expect(getMissionObjectiveRows({ active: true, eligible: true, missions: [{ id: 0, canAccept: true }] }, () => ({}))[0])
    .toMatchObject({ type: 'progress' });
});

test('claims survive lost eligibility and claimed missions leave the operational list', () => {
  const missions = [{ id: 0, accepted: true, completed: true, claimable: true }, { id: 1, claimed: true }];
  expect(getMissionObjectiveRows({ active: true, eligible: false, missions }, pending))
    .toEqual([expect.objectContaining({ type: 'ready' })]);
});

test('earned work needs explicit finalization and is not silently marked claimed', () => {
  const mission = { id: 0, accepted: true, earned: true };
  expect(getMissionObjectiveRows({ active: true, eligible: true, missions: [mission] }, pending)[0])
    .toMatchObject({ type: 'ready' });
});

test('dependent invitations wait until the previous reward has been claimed', () => {
  const previous = { id: 0, accepted: true, completed: true, claimable: true };
  const next = { id: 1, prerequisiteId: 0, canAccept: true };
  const view = { active: true, eligible: true, missions: [previous, next] };
  expect(getMissionObjectiveRows(view, pending).map(row => row.mission.id)).toEqual([0]);
  expect(getMissionObjectiveRows(view, () => ({})).map(row => row.mission.id)).toEqual([0]);
  expect(getMissionObjectiveRows({ ...view, missions: [{ ...previous, claimed: true }, next] }, pending))
    .toEqual([expect.objectContaining({ type: 'ready', mission: next })]);
});

test('independent invitations and already accepted missions remain visible', () => {
  const missions = [
    { id: 0, accepted: true, completed: true, claimable: true },
    { id: 1, prerequisiteId: 0, accepted: true },
    { id: 2, canAccept: true }
  ];
  expect(getMissionObjectiveRows({ active: true, eligible: true, missions }, pending).map(row => row.mission.id))
    .toEqual([0, 1, 2]);
});

test('preferences are isolated by crew, campaign, network, and API', () => {
  const base = getMissionScope('chain', 'api', 1, 2);
  expect(base).toBe(getMissionScope('chain', 'api', '1', '2'));
  expect(new Set([base, getMissionScope('other', 'api', 1, 2), getMissionScope('chain', 'other', 1, 2),
    getMissionScope('chain', 'api', 2, 2), getMissionScope('chain', 'api', 1, 3)]).size).toBe(5);
});
