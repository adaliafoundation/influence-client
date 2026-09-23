import { StarterMission } from '@influenceth/sdk';

export const getMissionStatus = (mission, pending, eligible = true) => {
  if (pending) return { key: 'pending', label: 'Transaction pending' };
  if (mission.claimed) return { key: 'claimed', label: 'Reward claimed' };
  if (mission.claimable) return { key: 'claimable', label: 'Reward ready to claim' };
  if (mission.completed) return { key: 'completed', label: 'Completed' };
  if (!eligible) return { key: 'locked', label: 'Crew no longer eligible' };
  if (mission.accepted) return { key: 'active', label: mission.earned ? 'Objective met' : 'In progress' };
  if (mission.canAccept) return { key: 'available', label: 'Ready to accept' };
  return { key: 'locked', label: 'Complete the previous mission' };
};

export const isStarterCampaignVisible = (view) => !!(view?.active && (
  view.eligible || view.missions.some((mission) => mission.accepted || mission.completed || mission.claimed || mission.claimable)
));

// Only mark individual objectives complete when the campaign exposes supporting evidence.
export const getMissionObjectives = (mission, progress = {}) => {
  const met = !!(mission.earned || mission.completed || mission.claimed);
  const objective = (label, recorded = false) => ({ label, complete: met || recorded });
  const requirements = mission.requirements;
  switch (mission.id) {
    case StarterMission.IDS.MAKE_LANDFALL:
      return [objective('Plan your campaign Warehouse', !!progress.warehouseId)];
    case StarterMission.IDS.PROSPECT_THE_SURFACE:
      return Array.from({ length: requirements.distinctDeposits }, (_, index) => objective(
        `Sample ${index + 1}: reveal at least ${requirements.minInitialYieldKg.toLocaleString()} kg in a distinct deposit`,
        (progress.sampleCount || 0) > index
      ));
    case StarterMission.IDS.BEGIN_EXTRACTION:
      return [objective('Construct an Extractor'), objective(`Finish a single raw-resource extraction of at least ${(requirements.minExtractionMassGrams / 1000).toLocaleString()} kg`)];
    case StarterMission.IDS.ESTABLISH_STORAGE:
      return [objective('Complete your campaign Warehouse'), objective(`Receive goods bringing stored inventory to at least ${(requirements.minStoredMassGrams / 1000).toLocaleString()} kg`)];
    case StarterMission.IDS.REFINE_THE_YIELD:
      return [objective('Construct a Refinery'), objective('Finish a full recipe-equivalent of a supported refinery process')];
    case StarterMission.IDS.CULTIVATE_LIFE:
      return [objective('Construct a Bioreactor'), objective('Finish a full batch of a supported biological process')];
    case StarterMission.IDS.MANUFACTURE_GOODS:
      return [objective('Construct a Factory'), objective('Finish a full recipe-equivalent of a supported manufacturing process')];
    case StarterMission.IDS.CLOSE_THE_PRODUCTION_LOOP:
      return [
        objective('Finish the first stage of an approved production route', progress.upstreamRoutes?.some(Boolean)),
        objective('Finish the second stage using the first stage’s output', !!progress.finalProductIds?.length),
        objective('Use or complete a delivery of some final output')
      ];
    default:
      return [];
  }
};
