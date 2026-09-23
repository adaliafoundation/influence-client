import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { appConfig } from '~/appConfig';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';
import useSession from '~/hooks/useSession';
import useCrewContext from '~/hooks/useCrewContext';
import useLot from '~/hooks/useLot';
import useStore from '~/hooks/useStore';
import useStarterMissions from '~/hooks/useStarterMissions';
import useMissionBindings from '~/hooks/useMissionBindings';
import api from '~/lib/api';
import { getStarterMissionAssignment } from '~/lib/starterMissions';
import { bindingUnavailableMessage, getMissionDialogBindings, MISSION_ACTIONS, MISSION_DIALOGS } from '~/lib/missionBindings';

const MissionActionContext = createContext(null);
export const useMissionAction = () => useContext(MissionActionContext);

// The delivery manager can resolve a transaction link to an entity after indexing.
export const useMissionDeliveryTarget = (deliveryId) => {
  const setDeliveryId = useMissionAction()?.setDeliveryId;
  useEffect(() => { setDeliveryId?.(deliveryId || null); }, [deliveryId, setDeliveryId]);
};

const MissionActionState = ({ type, params, children }) => {
  const { crew, pendingTransactions = [] } = useCrewContext();
  const lotId = useStore(s => params?.lotId || s.asteroids.lot);
  const { data: lot } = useLot(lotId);
  const campaignQuery = useStarterMissions(crew?.id);
  const view = campaignQuery.data;
  const { chainId } = useSession();
  const scope = JSON.stringify([chainId, appConfig.get('Api.influence'), view?.campaign, crew?.id]);
  const participation = useStore(s => s.missionParticipation[scope]);
  const setParticipation = useStore(s => s.dispatchMissionParticipation);
  const [deliveryId, setDeliveryId] = useState(null);
  const active = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [error, setError] = useState(null);
  const [checking, setChecking] = useState(false);
  const accepted = view?.missions?.filter(m => m.accepted) || [];
  const mission = accepted.find(m => !m.completed) || accepted[accepted.length - 1];
  const requests = useMemo(() => {
    if (!view?.active || !view?.campaign || !mission) return [];
    const base = { campaign: view.campaign, subject: view.subject };
    return getMissionDialogBindings({ type, params, buildingId: lot?.building?.id, deliveryId })
      .map(check => ({ ...base, ...check }));
  }, [view?.active, view?.campaign, view?.subject, mission, lot?.building?.id, type, params, deliveryId]);
  const checks = useMissionBindings(requests);
  const stateUnavailable = !view || campaignQuery.isError;
  const targetResolving = type === 'SURFACE_TRANSFER' && !!params?.txHash && !params?.deliveryId && !deliveryId;
  const bound = checks[0]?.data?.status === 'matched';
  const campaignUnderway = !!mission && view.missions.some(entry => !entry.completed);
  const selected = !!view?.eligible && (participation ?? (campaignUnderway || bound));
  const pending = pendingTransactions.some(tx => {
    const assignment = tx.meta?.missionAssignment;
    return assignment && view?.campaign && BigInt(assignment.campaign) === BigInt(view.campaign)
      && BigInt(assignment.subject.id) === BigInt(crew.id);
  });
  const unavailable = checks.find(q => q.isLoading || q.isError || q.data?.status === 'unknown' || q.data?.status === 'mismatched');
  const constructionMissing = checks.find((q, index) => index > 0 && requests[index].kind === 'Built' && q.data?.status === 'unbound');
  let verificationMessage;
  if (stateUnavailable) {
    verificationMessage = campaignQuery.isError
      ? 'Campaign state is unavailable. Retry before submitting this action.'
      : 'Loading campaign state…';
  } else if (targetResolving) {
    verificationMessage = 'Waiting for the delivery to be indexed…';
  } else if (selected && constructionMissing) {
    verificationMessage = 'This building has no indexed campaign construction. Retry after indexing catches up, or use a campaign building.';
  } else if (selected && unavailable) {
    verificationMessage = unavailable.isLoading ? 'Checking campaign bindings…' : bindingUnavailableMessage(unavailable.data);
  }
  const message = error || verificationMessage;

  const prepare = useCallback(async (key, vars, options) => {
    setError(null);
    setChecking(true);
    try {
      // Cancellation and abandonment do not earn evidence and stay native.
      if (['CancelDelivery', 'ConstructionAbandon'].includes(key)) return options;
      if (stateUnavailable || targetResolving) throw new Error('Wait for campaign verification before submitting this action.');
      if (!selected) return options;
      const fresh = await api.getStarterMissions(crew.id);
      if (!active.current) return null;
      if (String(fresh.campaign) !== String(view?.campaign)) throw new Error('The starter campaign changed. Reopen this action.');
      const rule = MISSION_ACTIONS[key];
      if (rule?.binding) {
        const binding = await api.getMissionBinding({
          campaign: fresh.campaign, subject: fresh.subject, kind: rule.binding,
          entity: vars[rule.target], ...(rule.slot ? { slot: vars[rule.slot] } : {})
        });
        if (!active.current) return null;
        if (binding.status === 'unknown' || binding.status === 'mismatched') throw new Error(bindingUnavailableMessage(binding));
      }
      if (!rule) throw new Error(`${key} does not support campaign credit. Use a supported action or turn off campaign participation.`);
      const available = fresh.missions.filter(m => m.accepted);
      const assignmentMission = available.find(m => !m.completed) || available[available.length - 1];
      if (!fresh.eligible || !assignmentMission) throw new Error('This crew cannot perform campaign work.');
      return { ...options, missionAssignment: getStarterMissionAssignment(fresh, assignmentMission.id) };
    } catch (e) {
      if (!active.current) return null;
      setError(e.response || e.request ? 'Campaign verification is unavailable. Retry shortly.' : e.message || 'Campaign verification failed. Retry shortly.');
      return null;
    } finally {
      if (active.current) setChecking(false);
    }
  }, [crew?.id, view?.campaign, mission, selected, stateUnavailable, targetResolving]);

  const retry = () => { setError(null); campaignQuery.refetch(); checks.forEach(q => q.refetch()); };
  return <MissionActionContext.Provider value={{
    missionTitle: mission?.title,
    visible: !!mission || stateUnavailable || targetResolving, ready: !stateUnavailable && !targetResolving, selected, bound, setDeliveryId, setSelected: value => { setParticipation(scope, value); setError(null); },
    unavailable: !!unavailable, constructionMissing: !!constructionMissing, message, pending, checking, eligible: view?.eligible, retry, prepare
  }}>{children}</MissionActionContext.Provider>;
};

export const MissionActionProvider = ({ type, params, children }) => {
  const { crew } = useCrewContext();
  const { chainId, token } = useSession();
  const simulation = useSimulationEnabled();
  if (!Object.hasOwn(MISSION_DIALOGS, type) || !crew?.id || !token || simulation) return children;
  const identity = JSON.stringify([chainId, appConfig.get('Api.influence'), crew?.id, type, params?.lotId, params?.sampleId, params?.processorSlot, params?.deliveryId, params?.txHash]);
  return <MissionActionState key={identity} type={type} params={params}>{children}</MissionActionState>;
};

export default MissionActionContext;
