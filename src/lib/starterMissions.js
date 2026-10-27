import { Address, Entity, StarterMission, System } from '@influenceth/sdk';

export const STARTER_MISSION_IMAGES = {
  [StarterMission.IDS.MAKE_LANDFALL]: 'stories/foothold/1.jpg',
  [StarterMission.IDS.PROSPECT_THE_SURFACE]: 'stories/prospect-the-surface/1.png',
  [StarterMission.IDS.BEGIN_EXTRACTION]: 'stories/begin-extraction/1.png',
  [StarterMission.IDS.ESTABLISH_STORAGE]: 'stories/establish-storage/1.jpg',
  [StarterMission.IDS.REFINE_THE_YIELD]: 'stories/keep-em-separated/1.jpg',
  [StarterMission.IDS.CULTIVATE_LIFE]: 'stories/the-cake-is-a-half-truth/1.jpg',
  [StarterMission.IDS.MANUFACTURE_GOODS]: 'stories/manufacture-goods/1.png',
  [StarterMission.IDS.CLOSE_THE_PRODUCTION_LOOP]: 'stories/close-the-production-loop/1.jpg'
};

export const MISSION_SYSTEMS = new Set(['AcceptMission', 'ClaimMissionReward', 'MissionValidate', 'CompleteMission']);

export const getMissionCompletionCalls = ({ assignment }) => [
  { system: 'MissionValidate', vars: { assignment, arguments: [] } },
  { system: 'ClaimMissionReward', vars: { assignment } }
];

export const canonicalEntityId = (id) => {
  if (typeof id === 'number' && !Number.isSafeInteger(id)) throw new Error('Unsafe entity ID');
  if (!/^(0x[0-9a-f]+|[0-9]+)$/i.test(String(id))) throw new Error('Invalid entity ID');
  const value = BigInt(id);
  if (value <= 0n || value >= (1n << 64n)) throw new Error('Invalid entity ID');
  return value.toString();
};

export const starterMissionsQueryKey = (chainId, apiUrl, crewId) => [
  'starterMissions', chainId, apiUrl, crewId == null ? null : canonicalEntityId(crewId)
];

export const getStarterMissionAssignment = (view, missionId) => StarterMission.getAssignment({
  campaign: view.campaign,
  crewId: canonicalEntityId(view.subject.id),
  missionId
});

export const getMissionAssignmentKey = ({ campaign, subject, mission }) => (
  `${BigInt(campaign)}:${subject.label}:${canonicalEntityId(subject.id)}:${mission}`
);

export const findPendingMissionTransaction = (transactions, assignment) => {
  const key = getMissionAssignmentKey(assignment);
  return transactions.find((tx) => {
    const pending = tx.meta?.missionAssignment || tx.vars?.assignment;
    return pending && getMissionAssignmentKey(pending) === key;
  });
};

// A receipt confirms execution, but buttons must wait for the indexed result.
export const isMissionTransactionIndexed = (tx, view) => {
  const assignment = tx.vars?.assignment;
  if (!MISSION_SYSTEMS.has(tx.key) || !assignment || !view?.campaign || !view?.subject
    || BigInt(view.campaign) !== BigInt(assignment.campaign)
    || view.subject.label !== assignment.subject.label
    || canonicalEntityId(view.subject.id) !== canonicalEntityId(assignment.subject.id)) return false;
  const mission = view.missions?.find(entry => entry.id === assignment.mission);
  if (tx.key === 'AcceptMission') return !!(mission?.accepted || mission?.completed || mission?.claimed);
  if (tx.key === 'MissionValidate') return !!(mission?.completed || mission?.claimed);
  return !!mission?.claimed;
};

export const assertStarterMissionAuthority = (view, accountAddress) => {
  if (!accountAddress || !view.recipient || !Address.areEqual(accountAddress, view.recipient)) {
    throw new Error('Only the current crew delegate can submit mission transactions.');
  }
};

export const assertStarterMissionOperation = (view, assignment, operation, accountAddress) => {
  assertStarterMissionAuthority(view, accountAddress);
  if (!view.active || !view.campaign
    || BigInt(view.campaign) !== BigInt(assignment.campaign)
    || assignment.subject.label !== Entity.IDS.CREW
    || canonicalEntityId(view.subject.id) !== canonicalEntityId(assignment.subject.id)) {
    throw new Error('The starter mission campaign or crew has changed. Refresh and try again.');
  }
  const mission = view.missions.find((entry) => entry.id === assignment.mission);
  const allowed = operation === 'AcceptMission' ? mission?.canAccept
    : operation === 'ClaimMissionReward' ? mission?.claimable
      : operation === 'CompleteMission' ? view.eligible && mission?.accepted && mission?.earned && !mission?.claimed
      : view.eligible && mission?.accepted;
  if (!allowed) throw new Error('This mission operation is not currently available.');
};

export const getMissionValidationArguments = (delivery) => {
  if (!delivery) return [];
  if (delivery.label !== Entity.IDS.DELIVERY) throw new Error('Expected a Delivery entity');
  return System.formatSystemCalldata('ReceiveDelivery', { delivery }, ['delivery']);
};
