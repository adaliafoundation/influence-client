import { STARTER_CAMPAIGN_NAME } from '~/lib/starterCampaign';
import { reportFailure } from '../lib/errorReporting';
import { errorMessages } from '../lib/errorMessages';
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
import { bindingUnavailableMessage, canParticipateInCampaign, getMissionDialogBindings, isCampaignWarehouseReceipt, MISSION_ACTIONS, MISSION_DIALOGS, verifyMissionAction } from '~/lib/missionBindings';

const MissionActionContext = createContext(null);
export const useMissionAction = () => useContext(MissionActionContext);

// Callers memoize the selected action details so editing a dialog updates its qualification.
export const useMissionActionDetails = (details) => {
  const setDetails = useMissionAction()?.setDetails;
  useEffect(() => { setDetails?.(details); }, [details, setDetails]);
};

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
  const [details, setDetails] = useState({});
  const active = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const createAlert = useStore(s => s.dispatchAlertLogged);
  const [checking, setChecking] = useState(false);
  const accepted = view?.missions?.filter(m => m.accepted) || [];
  const mission = accepted.find(m => !m.completed) || accepted[accepted.length - 1];
  const requests = useMemo(() => {
    if (!view?.active || !view?.campaign || !mission || details.unsupported) return [];
    const base = { campaign: view.campaign, subject: view.subject };
    const targets = getMissionDialogBindings({ type, params, buildingId: lot?.building?.id, deliveryId });
    if (type === 'SURFACE_TRANSFER' && (params?.deliveryId || deliveryId)
      && isCampaignWarehouseReceipt(view, details.destination, details.destinationSlot)) {
      targets.push({ kind: 'Built', entity: { label: details.destination.label, id: details.destination.id } });
    }
    return targets
      .map(check => ({ ...base, ...check }));
  }, [view, mission, lot?.building?.id, type, params, deliveryId, details.destination, details.destinationSlot, details.unsupported]);
  const checks = useMissionBindings(requests);
  const stateUnavailable = !view || campaignQuery.isError;
  const targetResolving = type === 'SURFACE_TRANSFER' && !!params?.txHash && !params?.deliveryId && !deliveryId;
  const bound = checks[0]?.data?.status === 'matched';
  const campaignUnderway = !!mission && view.missions.some(entry => !entry.completed);
  const qualifies = canParticipateInCampaign({ type, params, view, building: lot?.building,
    details: { ...details, deliveryId }, bindings: requests.map((request, index) => ({ ...request, ...checks[index]?.data })) });
  const selected = qualifies && (participation ?? (campaignUnderway || bound));
  const pending = pendingTransactions.some(tx => {
    const assignment = tx.meta?.missionAssignment;
    return assignment && view?.campaign && BigInt(assignment.campaign) === BigInt(view.campaign)
      && BigInt(assignment.subject.id) === BigInt(crew.id);
  });
  const unavailable = checks.find(q => q.isLoading || q.isError || q.data?.status === 'unknown' || q.data?.status === 'mismatched');
  const verificationPending = !!unavailable && participation !== false && !!mission;
  let verificationMessage;
  if (stateUnavailable) {
    verificationMessage = campaignQuery.isError
      ? errorMessages.missionUnavailable
      : 'Loading campaign state…';
  } else if (targetResolving) {
    verificationMessage = 'Waiting for the delivery to be indexed…';
  } else if (verificationPending) {
    verificationMessage = unavailable.isLoading ? 'Checking campaign bindings…' : bindingUnavailableMessage(unavailable.data);
  }
  const message = verificationMessage;

  const prepare = useCallback(async (key, vars, options) => {
    setChecking(true);
    try {
      if (!MISSION_ACTIONS[key]) return options;
      if (stateUnavailable || targetResolving) throw new Error('Wait for campaign verification before submitting this action.');
      if (verificationPending) throw new Error(verificationMessage);
      if (!selected) return options;
      const fresh = await api.getStarterMissions(crew.id);
      if (!active.current) return null;
      if (String(fresh.campaign) !== String(view?.campaign)) throw new Error(`The ${STARTER_CAMPAIGN_NAME} campaign changed. Reopen this action.`);
      const available = fresh.missions.filter(m => m.accepted);
      const assignmentMission = available.find(m => !m.completed) || available[available.length - 1];
      if (!fresh.eligible || !assignmentMission) throw new Error('This crew cannot perform campaign work.');
      const assignment = getStarterMissionAssignment(fresh, assignmentMission.id);
      const qualifies = await verifyMissionAction({ key, vars, assignment, view: fresh,
        getBinding: api.getMissionBinding, getEntity: api.getEntityById });
      if (!active.current) return null;
      return qualifies ? { ...options, missionAssignment: assignment } : options;
    } catch (e) {
      if (!active.current) return null;
      reportFailure(createAlert, e, { message: 'missionUnavailable' });
      return null;
    } finally {
      if (active.current) setChecking(false);
    }
  }, [crew?.id, view?.campaign, selected, stateUnavailable, targetResolving, verificationPending, verificationMessage]);

  const retry = () => { campaignQuery.refetch(); checks.forEach(q => q.refetch()); };
  return <MissionActionContext.Provider value={{
    visible: qualifies || stateUnavailable || targetResolving || verificationPending, qualifies, missionTitle: mission?.title,
    ready: !stateUnavailable && !targetResolving && !verificationPending, selected, bound, setDeliveryId, setDetails, setSelected: value => { setParticipation(scope, value); },
    unavailable: !!unavailable, message, pending, checking, eligible: view?.eligible, retry, prepare
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
