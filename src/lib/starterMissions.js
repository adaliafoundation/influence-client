import { Address, Entity, StarterMission, System } from '@influenceth/sdk';
import { MISSION_ACTIONS } from './missionBindings';

export const STARTER_MISSION_IMAGES = {
  [StarterMission.IDS.MAKE_LANDFALL]: 'stories/fly-me-to-the-moon/1.jpg',
  [StarterMission.IDS.PROSPECT_THE_SURFACE]: 'stories/groundbreaking/1.jpg',
  [StarterMission.IDS.BEGIN_EXTRACTION]: 'stories/groundbreaking/1.jpg',
  [StarterMission.IDS.ESTABLISH_STORAGE]: 'stories/establish-storage/1.jpg',
  [StarterMission.IDS.REFINE_THE_YIELD]: 'stories/keep-em-separated/1.jpg',
  [StarterMission.IDS.CULTIVATE_LIFE]: 'stories/the-cake-is-a-half-truth/1.jpg',
  [StarterMission.IDS.MANUFACTURE_GOODS]: 'stories/no-sound-in-space/1.jpg',
  [StarterMission.IDS.CLOSE_THE_PRODUCTION_LOOP]: 'stories/close-the-production-loop/1.jpg'
};

// The capstone requires use or delivery; market orders do not qualify.
const COMPOSITE_ACTIONS = new Set(['FlexibleExtractResourceStart', 'LeaseAndProcessProductsStart']);
export const STARTER_MISSION_ACTIONS = new Set(Object.keys(MISSION_ACTIONS).filter(key => !COMPOSITE_ACTIONS.has(key)));
export const STARTER_MISSION_SYSTEMS = new Set(['AcceptMission', 'ClaimMissionReward', 'MissionValidate', 'CompleteStarterMission']);

export const getMissionCompletionCalls = ({ assignment }) => [
  { system: 'MissionValidate', vars: { assignment, arguments: [] } },
  { system: 'ClaimMissionReward', vars: { assignment } }
];

export const canonicalCrewId = (id) => {
  if (typeof id === 'number' && !Number.isSafeInteger(id)) throw new Error('Unsafe crew ID');
  if (!/^(0x[0-9a-f]+|[0-9]+)$/i.test(String(id))) throw new Error('Invalid crew ID');
  const value = BigInt(id);
  if (value <= 0n || value >= (1n << 64n)) throw new Error('Invalid crew ID');
  return value.toString();
};

export const starterMissionsQueryKey = (chainId, apiUrl, crewId) => [
  'starterMissions', chainId, apiUrl, crewId == null ? null : canonicalCrewId(crewId)
];

export const getStarterMissionAssignment = (view, missionId) => StarterMission.getAssignment({
  campaign: view.campaign,
  crewId: canonicalCrewId(view.subject.id),
  missionId
});

export const getMissionAssignmentKey = ({ campaign, subject, mission }) => (
  `${BigInt(campaign)}:${subject.label}:${canonicalCrewId(subject.id)}:${mission}`
);

export const findPendingMissionTransaction = (transactions, assignment) => {
  const key = getMissionAssignmentKey(assignment);
  return transactions.find((tx) => {
    const pending = tx.meta?.missionAssignment || tx.vars?.assignment;
    return pending && getMissionAssignmentKey(pending) === key;
  });
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
    || canonicalCrewId(view.subject.id) !== canonicalCrewId(assignment.subject.id)) {
    throw new Error('The starter mission campaign or crew has changed. Refresh and try again.');
  }
  const mission = view.missions.find((entry) => entry.id === assignment.mission);
  const allowed = operation === 'AcceptMission' ? mission?.canAccept
    : operation === 'ClaimMissionReward' ? mission?.claimable
      : operation === 'CompleteStarterMission' ? view.eligible && mission?.accepted && mission?.earned && !mission?.claimed
      : view.eligible && mission?.accepted;
  if (!allowed) throw new Error('This mission operation is not currently available.');
};

export const assertStarterMissionAction = (systemName) => {
  if (!STARTER_MISSION_ACTIONS.has(systemName) && !COMPOSITE_ACTIONS.has(systemName)) {
    throw new Error(`${systemName} is not supported by starter missions.`);
  }
};

export const getStarterMissionActionCall = (systemName, vars, assignment, dispatcher) => {
  if (!STARTER_MISSION_ACTIONS.has(systemName)) throw new Error(`Unsupported mission action: ${systemName}`);
  if (vars.caller_crew?.label !== assignment.subject.label
    || canonicalCrewId(vars.caller_crew?.id) !== canonicalCrewId(assignment.subject.id)) {
    throw new Error('Mission action crew does not match its assignment.');
  }
  const inputs = System.Systems[systemName].inputs
    .map(({ name }) => name).filter((name) => name !== 'caller_crew' && name !== 'context');
  return System.getRunSystemCall('MissionAction', {
    assignment,
    action: systemName,
    arguments: System.formatSystemCalldata(systemName, vars, inputs)
  }, dispatcher);
};

export const getMissionValidationArguments = (delivery) => {
  if (!delivery) return [];
  if (delivery.label !== Entity.IDS.DELIVERY) throw new Error('Expected a Delivery entity');
  return System.formatSystemCalldata('ReceiveDelivery', { delivery }, ['delivery']);
};
