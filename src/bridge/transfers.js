// Local records only bridge the indexing delay. API messages have no expiry.
export const LOCAL_BRIDGE_TRANSFER_TTL = 24 * 60 * 60 * 1000;

export const sameBridgeAddress = (left, right) => {
  if (!left || !right) return false;
  try {
    return BigInt(left) === BigInt(right);
  } catch {
    return false;
  }
};

export const isActiveBridgeTransfer = (transfer) => (
  !['complete', 'failed'].includes(String(transfer?.status).toLowerCase())
);

export const pruneBridgeTransfers = (transfers = {}, now = Date.now()) => (
  Object.fromEntries(Object.entries(transfers).filter(([, transfer]) => (
    // Legacy records have no network and cannot safely be assigned to one.
    transfer?.network
    && transfer.fromAddress
    && transfer.toAddress
    && Number.isFinite(transfer.createdAt)
    && now - transfer.createdAt < LOCAL_BRIDGE_TRANSFER_TTL
    && isActiveBridgeTransfer(transfer)
  )))
);

export const isBridgeTransferInScope = (transfer, { network, ethereumAddress, starknetAddress }) => {
  if (transfer.network !== network) return false;
  if (transfer.direction === 'mint_crew') return sameBridgeAddress(transfer.fromAddress, ethereumAddress);
  const toStarknet = transfer.direction === 'l1_to_l2';
  return sameBridgeAddress(transfer.fromAddress, toStarknet ? ethereumAddress : starknetAddress)
    && sameBridgeAddress(transfer.toAddress, toStarknet ? starknetAddress : ethereumAddress);
};

export const isBridgeTransferIndexed = (transfer, crossings, destinationAssets = []) => {
  if (transfer.assetType === 'sway') {
    // SWAY rows aggregate repeated amounts; only a matching event identifies this transfer.
    return crossings.some((crossing) => crossing.events?.some((event) => (
      sameBridgeAddress(event.transactionHash, transfer.txHash)
    )));
  }
  if (!transfer.assetIds?.length || transfer.direction === 'mint_crew') return false;
  const destination = transfer.direction === 'l1_to_l2' ? 'starknet' : 'ethereum';
  const direction = transfer.direction === 'receive_l1' ? 'l2_to_l1' : transfer.direction;
  const matchingCrossings = crossings.filter((crossing) => (
    crossing.assetType === transfer.assetType
    && crossing.direction === direction
    && sameBridgeAddress(crossing.toAddress, transfer.toAddress)
    && (!crossing.fromAddress || sameBridgeAddress(crossing.fromAddress, transfer.fromAddress))
    // A previous crossing of the same NFT must not retire a new submission.
    && crossing.eventTimestamp >= Math.floor(transfer.createdAt / 1000)
    && (transfer.direction !== 'receive_l1' || !isActiveBridgeTransfer(crossing))
  ));
  return transfer.assetIds.every((id) => (
    matchingCrossings.some((crossing) => crossing.assetIds.includes(Number(id)))
    || destinationAssets.some((asset) => (
      Number(asset.id) === Number(id)
      && asset.Nft?.bridge?.status === 'COMPLETE'
      && asset.Nft.bridge.destination.toLowerCase() === destination
      && sameBridgeAddress(asset.Nft.owners?.[destination], transfer.toAddress)
    ))
  ));
};
