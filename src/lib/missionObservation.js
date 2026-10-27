import { Entity, MissionObservation } from '@influenceth/sdk';
import { verifyMissionAction } from './missionBindings';

const targets = {
  ConstructionPlan: 'lot', ConstructionStart: 'building', ConstructionFinish: 'building',
  SampleDepositStart: 'lot', SampleDepositFinish: 'deposit',
  ExtractResourceStart: 'extractor', ExtractResourceFinish: 'extractor',
  ProcessProductsStart: 'processor', ProcessProductsFinish: 'processor',
  SendDelivery: 'origin', ReceiveDelivery: 'delivery', ResupplyFood: 'origin',
  FillSellOrder: 'exchange', FillBuyOrder: 'exchange',
  ScanSurfaceStart: 'asteroid', ScanSurfaceFinish: 'asteroid', StationCrew: 'destination', DockShip: 'target'
};

export const getObservationRequest = (system, vars) => {
  const target = vars[targets[system]];
  if (!target || BigInt(target.id) === 0n || vars.isCancellation) return null;
  if (['StationCrew', 'DockShip'].includes(system) && target.label !== Entity.IDS.BUILDING) return null;
  return {
    system, targetUuid: String(Entity.packEntity(target)),
    ...(vars.caller_crew?.id ? { crewId: String(vars.caller_crew.id) } : {}),
    ...(system === 'ConstructionPlan' ? { buildingType: vars.building_type } : {})
  };
};

// Discover by native target, never by the executing account's owned asteroids.
export const getObservationCandidates = async (system, vars, api) => {
  const request = getObservationRequest(system, vars);
  if (!request) return [];
  const { candidates } = await api.getMissionObservationCandidates(request);
  const starter = candidates.find(candidate => candidate.subject.label === Entity.IDS.CREW);
  if (!starter) return candidates;
  const view = await api.getStarterMissions(starter.subject.id);
  if (!view.active || !view.eligible || !view.missions[0]?.accepted
    || BigInt(view.campaign) !== BigInt(starter.campaign)) {
    throw new Error('Campaign state changed. Refresh and try again.');
  }
  const qualifies = await verifyMissionAction({ key: system, vars, assignment: starter, view,
    getBinding: api.getMissionBinding, getEntity: api.getEntityById });
  return qualifies ? candidates : candidates.filter(candidate => candidate.subject.label !== Entity.IDS.CREW);
};

export const observeNativeMissionCall = async ({ system, vars, call, dispatcher, account, api, escrow }) => {
  const candidates = await getObservationCandidates(system, vars, api);
  if (!candidates.length) return { calls: [call], candidates };
  // Escrow appends the executing account, token and actual withdrawals to its stored hook.
  const calldata = escrow ? MissionObservation.escrowWithdrawalArguments({
    nativeArguments: [...escrow.hook.calldata.slice(2), ...escrow.data],
    caller: account, token: escrow.token, withdrawals: escrow.withdrawals
  }) : call.calldata.slice(2);
  return {
    candidates,
    calls: MissionObservation.observeMissionAction({ dispatcher, account, system, calldata, candidates,
      executionCalls: [call], expectedCaller: escrow?.address || account })
  };
};
