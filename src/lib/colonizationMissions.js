import { Address, Entity, ColonizationMission } from '@influenceth/sdk';
import content from './colonizationMissionContent.json';
import { canonicalEntityId } from './starterMissions';

export const colonizationMissionsQueryKey = (chainId, apiUrl, asteroidId) => [
  'colonizationMissions', chainId, apiUrl, asteroidId == null ? null : canonicalEntityId(asteroidId)
];

export const canManageColony = (view, account) => !!(account && view?.owner
  && Address.areEqual(account, view.owner)
  && (!view.colonizer || Address.areEqual(account, view.colonizer)));

export const getColonizationAssignment = (view, missionId) => ColonizationMission.getAssignment({
  campaign: view.campaign, asteroidId: view.subject.id, missionId
});

export const assertColonizationMissionOperation = (view, assignment, operation, account) => {
  if (!canManageColony(view, account)) throw new Error('Only the original colonizer who currently owns this asteroid can manage its missions.');
  if (!view.active || !view.campaign || BigInt(view.campaign) !== BigInt(assignment.campaign)
    || assignment.subject.label !== Entity.IDS.ASTEROID
    || BigInt(view.subject.id) !== BigInt(assignment.subject.id)) {
    throw new Error('The colonization campaign or asteroid has changed. Refresh and try again.');
  }
  const mission = view.missions.find(entry => entry.id === assignment.mission);
  const allowed = operation === 'AcceptMission' ? mission?.canAccept
    : operation === 'ClaimMissionReward' ? mission?.claimable
      : operation === 'CompleteMission' ? mission?.accepted && mission?.earned && !mission?.claimed
        : operation === 'MissionValidate' && mission?.accepted && !mission?.claimed;
  if (!allowed) throw new Error('This mission operation is not currently available.');
};

export const COLONIZATION_IMAGES = {
  0: 'stories/claim-a-new-world/1.jpg',
  1: 'stories/build-a-habitat/1.jpg',
  2: 'stories/connect-the-colony/1.jpg',
  3: 'stories/establish-commerce/1.jpg',
  4: 'stories/found-a-colony/1.jpg'
};

export const getColonizationObjectives = (mission, progress) => {
  const complete = !!(mission.earned || mission.completed || mission.claimed);
  if (mission.id === 0) return [
    { label: 'Accept before the first surface scan starts', complete: !!mission.accepted },
    { label: 'Start and finish the surface scan as the original colonizer while owning the asteroid', complete }
  ];
  if (mission.id === 4) return ['Habitat', 'Spaceport', 'Marketplace'].map((name, index) => ({
    label: `Keep the qualifying used ${name} operational`,
    complete: mission.claimed || !!progress.selectedBuildings[index]?.ready
  }));
  const uses = { 1: 'Station a crew in the Habitat', 2: 'Dock a ship at the Spaceport', 3: 'Fill a positive quantity of a buy or sell order at the Marketplace' };
  return [
    { label: 'Start construction after the campaign surface scan completes', complete },
    { label: uses[mission.id], complete }
  ];
};

export const colonizationPresentation = {
  stories: Object.fromEntries(content.missions.map(mission => [mission.key, mission.brief])),
  name: 'Colonization', images: COLONIZATION_IMAGES,
  description: 'Claim a new world and grow a working colony. Anyone can contribute to its construction and use.',
  warning: 'Enroll before starting the first surface scan. Rewards belong to the original colonizer and can only be claimed while they own the asteroid. Other players can build and use the colony’s buildings.',
  authorityMessage: 'Connect as the original colonizer who currently owns this asteroid to accept missions or claim rewards.',
  lockedLabel: 'Enrollment or completed surface scan required',
  lockedMessage: 'Complete Claim a New World to unlock the colony branches. Enrollment requires an unscanned asteroid you own.',
  getObjectives: getColonizationObjectives
};
