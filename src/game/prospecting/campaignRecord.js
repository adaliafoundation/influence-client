import { Prospecting } from '@influenceth/sdk';

export const scopeKey = (identity, campaignId) => campaignId === undefined
  ? Prospecting.getScopeKey(identity)
  : JSON.stringify({ ...Prospecting.getIdentity(identity), campaignId: BigInt(campaignId).toString() });
export const replayCampaign = Prospecting.replayCampaign;

export function campaignRecord(state) {
  return {
    ...Prospecting.createRecord({
      identity: state.storage.identity, context: state.context, mode: state.mode || 'local-simulation',
      campaignId: state.campaignId, qualityBps: state.qualityBps || 10000
    }),
    actions: state.history.map(({ action, meta, mask, randomness, commitment }) => ({ action, meta, mask, randomness,
      ...(state.mode === 'chain' ? { commitment } : {}) })),
    ...(state.mode === 'chain' ? { chainOperation: state.chainOperation || null } : {}),
    pending: state.pending || null,
    selected: state.selected,
    claimIndex: state.finalized ? state.cells.findIndex((cell) =>
      cell[0] && cell[1] === state.finalized.lot && cell[2] === state.finalized.depth) : null
  };
}
