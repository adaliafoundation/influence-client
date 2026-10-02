// Conservative client cap: a ten-crewmate L1 -> L2 estimate exceeded 40,000 L1 gas.
// Apply to new NFT transfers only; existing withdrawal messages must stay intact.
export const MAX_BRIDGE_ASSETS = 5;

export const getBridgeBatchError = (assetCount) => {
  if (assetCount < 1) return 'Select at least one asset to bridge.';
  if (assetCount > MAX_BRIDGE_ASSETS) {
    return `Bridge at most ${MAX_BRIDGE_ASSETS} assets at a time. Split your selection into smaller batches.`;
  }
  return null;
};
