import { Asteroid, Claim, Lot, Mining, Product, Prospecting } from '@influenceth/sdk';

export const localAbundancePpm = (asteroid, lotIndex, resource) =>
  Math.round(Asteroid.Entity.getAbundanceAtLot(asteroid, lotIndex, resource) * 1e6);

export function getLocalClaim(record) {
  if (record.mode !== 'local-simulation') return null;
  const state = Prospecting.replayCampaign(record);
  if (!state.finalized) return null;
  const { finalized } = state;
  const lotId = Lot.toId(record.identity.asteroidId, finalized.lot);
  const referenceAbundancePpm = Prospecting.unpackMeta(state.history[record.claimIndex].meta).abundance;
  return {
    id: `local:${Prospecting.getScopeKey(record.identity)}:${record.context}`,
    kind: 'local', usable: true, resource: record.identity.resource,
    lotId, lotIndex: finalized.lot, initialYield: String(finalized.quantity),
    remainingYield: String(finalized.quantity), rateBps: finalized.rateBps,
    referenceAbundancePpm, rulesVersion: Prospecting.CLAIM_RULES_VERSION
  };
}

export function getMiningOptions({ asteroid, lot, campaigns, canUseClaim }) {
  const lotIndex = Lot.toIndex(lot.id);
  const claims = (lot.deposits || []).filter((entity) => Claim.isUsable(entity) && canUseClaim(entity))
    .map((entity) => Claim.fromEntity(entity, {
      localAbundancePpm: localAbundancePpm(asteroid, lotIndex, entity.Deposit.resource)
    }));
  const localClaims = campaigns.map(getLocalClaim)
    .filter((claim) => claim && Number(claim.lotId) === Number(lot.id));
  const claimOptions = [...localClaims, ...claims].map((claim) => ({
    value: `${claim.kind}:${claim.id}`,
    label: `${Product.TYPES[claim.resource].name} · ${claim.kind === 'legacy' ? `Legacy claim #${claim.id}` : 'Campaign claim'} · ${(Number(claim.remainingYield) / 1000).toLocaleString()} t · ${claim.rateBps / 100}% rate`,
    mode: Mining.MODES.CLAIM, resource: claim.resource, lotId: lot.id, claim
  }));
  const baselineOptions = Array.from({ length: 22 }, (_, index) => index + 1)
    .filter((resource) => Mining.canBaselineMine(Mining.getGlobalAbundancePpm(asteroid.Celestial.abundances, resource)))
    .map((resource) => ({
      value: `baseline:${resource}`,
      label: `${Product.TYPES[resource].name} · Baseline · ${Mining.BASELINE_RATE_BPS / 100}% rate`,
      mode: Mining.MODES.BASELINE, resource, lotId: lot.id,
      globalAbundancePpm: Mining.getGlobalAbundancePpm(asteroid.Celestial.abundances, resource),
      localAbundancePpm: localAbundancePpm(asteroid, lotIndex, resource)
    })).filter((option) => option.localAbundancePpm > 0);
  return [...claimOptions, ...baselineOptions];
}

export function getMiningPreview(option, quantity, { bonus = 1, timeAcceleration = 24 } = {}) {
  const parameters = { ...option, bonusBps: Math.round(bonus * 10000), timeAcceleration };
  const maxQuantity = Mining.getMaxQuantity(parameters);
  const quote = quantity > 0 ? Mining.quote({ ...parameters, quantity }) : null;
  return { maxQuantity, quote };
}

// The extractor component can load before its activity/deposit. A committed job
// must never be quoted again using the new mining rules while that data loads.
export function getExtractionDuration(extraction, quote) {
  if (!extraction) return quote();
  if (extraction.startTime == null || extraction.finishTime == null) return 0;
  return Math.max(0, extraction.finishTime - extraction.startTime);
}
