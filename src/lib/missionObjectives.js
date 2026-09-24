export const getMissionScope = (chainId, apiUrl, crewId, campaign) => (
  JSON.stringify([chainId, apiUrl, crewId == null ? null : String(crewId), campaign == null ? null : String(campaign)])
);

export const hasStartedCampaign = (view) => view.missions.some(m => m.accepted || m.completed || m.claimed);

export const getMissionObjectiveRows = (view, getPending) => {
  if (!view?.active) return [];
  const started = hasStartedCampaign(view);
  const available = view.eligible && view.missions.find(m => m.canAccept && (
    m.prerequisiteId == null || view.missions.some(prerequisite => prerequisite.id === m.prerequisiteId && prerequisite.claimed)
  ));
  return view.missions.filter(m => (
    !m.claimed && (m.accepted || m.claimable || m === available)
  )).map(mission => {
    const pending = !!getPending(mission.id);
    const ready = !pending && (mission.claimable || (view.eligible && (
      mission.canAccept || mission.earned
    )));
    return {
      mission,
      type: ready ? 'ready' : 'progress',
      invitation: !started && mission === available
    };
  });
};
