const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const { StarterMission } = require('@influenceth/sdk');
const { getMissionStatus, getMissionObjectives, isStarterCampaignVisible } = require('./missionPresentation');

test('claimable entitlements remain visible and actionable after invalidation', () => {
  const mission = { completed: true, claimable: true };
  expect(getMissionStatus(mission, false, false).key).toBe('claimable');
  expect(isStarterCampaignVisible({ active: true, eligible: false, missions: [mission] })).toBe(true);
  expect(isStarterCampaignVisible({ active: true, eligible: false, missions: [{}] })).toBe(false);
});

test('earned evidence alone is not completion or acceptance', () => {
  expect(getMissionStatus({ earned: true }, false).key).toBe('locked');
  expect(getMissionStatus({ earned: true, canAccept: true }, false).key).toBe('available');
  expect(getMissionStatus({ earned: true, accepted: true }, false).label).toBe('Objective met');
});

test('pending transactions take precedence over indexed flags', () => {
  expect(getMissionStatus({ claimable: true }, {}).key).toBe('pending');
  expect(getMissionStatus({ claimed: true }, false).key).toBe('claimed');
});

test('individual objectives only complete with supporting campaign evidence', () => {
  expect(getMissionObjectives(StarterMission.TYPES[1], { sampleCount: 2 }).map(o => o.complete)).toEqual([true, true, false]);
  expect(getMissionObjectives(StarterMission.TYPES[7], { upstreamRoutes: [true], finalProductIds: ['23'] }).map(o => o.complete)).toEqual([true, true, false]);
  expect(getMissionObjectives(StarterMission.TYPES[3], { warehouseId: '999' }).map(o => o.complete)).toEqual([false, false]);
  expect(getMissionObjectives(StarterMission.TYPES[0], { warehouseId: '999' })[0].complete).toBe(true);
  Object.values(StarterMission.TYPES).forEach(mission => {
    expect(getMissionObjectives({ ...mission, earned: true }).every(o => o.complete)).toBe(true);
  });
});
