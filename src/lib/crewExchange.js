import { hasRemainingStarterPackBenefits } from './starterPacks';

export const rosterChanged = (before, after) => (
  before.length !== after.length || before.some((id) => !after.some((other) => String(id) === String(other)))
);

export const getCrewExchangeWarnings = (crews, rosters, missions) => {
  const changed = crews.map((crew, i) => rosterChanged(crew.Crew.roster, rosters[i]));
  const moved = crews.map((crew, i) => crew.Crew.roster.some((id) => rosters[1 - i].some((other) => String(id) === String(other))));
  const invalid = missions.map((view, i) => !!view?.campaign && (
    view.invalidated || BigInt(crews[i].id) <= BigInt(view.cutoff)
  ));
  const becomesInvalid = missions.map((view, i) => invalid[i] || (!!view?.campaign && view.participated && changed[i]));
  // Match the contract's bidirectional propagation, including a newly formed crew.
  if (becomesInvalid[0] && moved[0]) becomesInvalid[1] = true;
  if (becomesInvalid[1] && moved[1]) becomesInvalid[0] = true;
  if (becomesInvalid[0] && moved[0]) becomesInvalid[1] = true;
  return {
    missions: crews.filter((_, i) => becomesInvalid[i] && !invalid[i]),
    benefits: crews.filter((crew, i) => changed[i] && hasRemainingStarterPackBenefits(crew))
  };
};
