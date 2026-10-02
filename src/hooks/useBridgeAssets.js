import { useEffect, useMemo } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccount, useBalance } from 'wagmi';

import { bridgeNetwork, bridgeAssetConfigs, getBridgeAssetConfig } from '~/bridge/assets';
import { isSwayDepositComplete } from '~/bridge/sway';
import { isActiveBridgeTransfer, isBridgeTransferIndexed, isBridgeTransferInScope, pruneBridgeTransfers } from '~/bridge/transfers';
import useSession from '~/hooks/useSession';
import useStore from '~/hooks/useStore';
import { useSwayBalance } from '~/hooks/useWalletTokenBalance';
import api from '~/lib/api';
import { appConfig } from '~/appConfig';

const toArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.crossings)) return value.crossings;
  if (Array.isArray(value?.results)) return value.results;
  return [];
};

const normalizeId = (value) => Number(value?.id ?? value?.tokenId ?? value);

const getTransferValue = (transfer, key) => {
  try {
    return transfer?.[key];
  } catch (e) {
    return undefined;
  }
};

const getTransferAssetIds = (transfer) => {
  const ids = getTransferValue(transfer, 'assetIds')
    || getTransferValue(transfer, 'tokenIds')
    || getTransferValue(transfer, 'ids')
    || [];
  try {
    return ids.map(normalizeId).filter(Number.isFinite);
  } catch (e) {
    return [];
  }
};

const getTransferAssetType = (transfer) => {
  const candidate = getTransferValue(transfer, 'assetType')
    || getTransferValue(transfer, 'type')
    || getTransferValue(transfer, 'asset_type');
  if (typeof candidate === 'string') {
    return Object.values(bridgeAssetConfigs)
      .find((config) => [config.assetType, config.starknetName].includes(candidate))
      ?.assetType || candidate;
  }
  return Object.values(bridgeAssetConfigs)
    .find((config) => [candidate, getTransferValue(transfer, 'label')].includes(config.entityLabel))
    ?.assetType;
};

const isReceiveReady = (transfer) => (
  getTransferValue(transfer, 'ready')
  || getTransferValue(transfer, 'readyToReceive')
  || Number(getTransferValue(transfer, 'readyCount') || 0) > 0
  || getTransferValue(transfer, 'status') === 'ready'
  || getTransferValue(transfer, 'status') === 'waiting_confirmation'
  || getTransferValue(transfer, 'status') === 'arrived'
  || (
    getTransferAssetType(transfer) !== 'sway'
    &&
    getTransferValue(transfer, 'origin') === 'STARKNET'
    && getTransferValue(transfer, 'destination') === 'ETHEREUM'
    && getTransferValue(transfer, 'status') === 'PROCESSING'
  )
);

const getChain = (value) => value?.toLowerCase();

const isAssetVisibleOnChain = (asset, chain) => {
  const bridge = asset?.Nft?.bridge;
  if (!bridge?.status) return true;
  if (bridge.status === 'COMPLETE') return getChain(bridge.destination) === chain;
  return getChain(bridge.origin) === chain;
};

const normalizeAssetBridgeProgressItem = (asset, assetType) => {
  const bridge = asset?.Nft?.bridge;
  const assetId = normalizeId(asset);
  const originChain = getChain(bridge?.origin);
  const destinationChain = getChain(bridge?.destination);

  if (!bridge?.status || bridge.status === 'COMPLETE' || !Number.isFinite(assetId)) return null;

  return {
    assetIds: [assetId],
    assetType,
    canConfirm: false,
    displayChain: originChain,
    direction: originChain && destinationChain ? `${originChain === 'ethereum' ? 'l1' : 'l2'}_to_${destinationChain === 'ethereum' ? 'l1' : 'l2'}` : undefined,
    fromAddress: asset?.Nft?.owners?.[originChain],
    id: `${assetType}:${assetId}:bridge`,
    originChain,
    status: bridge.status,
    toAddress: asset?.Nft?.owners?.[destinationChain],
  };
};

const getAssetBridgeProgressItems = (assets, assetType, excludedAssetIds) => (
  (assets || [])
    .map((asset) => normalizeAssetBridgeProgressItem(asset, assetType))
    .filter((item) => (
      item
      && item.assetIds.length > 0
      && !item.assetIds.some((id) => excludedAssetIds.has(Number(id)))
    ))
);

const useLocalBridgeTransfers = (assetType, ethereumAddress, starknetAddress) => {
  const localTransferMap = useStore(s => s.bridgeTransfers);
  const pruneTransfers = useStore(s => s.dispatchBridgeTransfersPruned);
  useEffect(() => {
    pruneTransfers();
    const interval = setInterval(() => pruneTransfers(), 30 * 1000);
    return () => clearInterval(interval);
  }, [pruneTransfers]);
  return useMemo(() => Object.values(pruneBridgeTransfers(localTransferMap))
    .filter((item) => item.assetType === assetType && isBridgeTransferInScope(item, { network: bridgeNetwork, ethereumAddress, starknetAddress }))
    .map((item) => normalizeProgressItem(item)), [assetType, ethereumAddress, localTransferMap, starknetAddress]);
};

const useRetireIndexedTransfers = (localTransfers, crossings, ethereumAssets, starknetAssets) => {
  const pruneTransfers = useStore(s => s.dispatchBridgeTransfersPruned);
  const ethereumData = ethereumAssets?.data;
  const ethereumUpdatedAt = ethereumAssets?.dataUpdatedAt;
  const starknetData = starknetAssets?.data;
  const starknetUpdatedAt = starknetAssets?.dataUpdatedAt;
  const retiredIds = useMemo(() => localTransfers.filter((item) => {
    const toStarknet = item.direction === 'l1_to_l2';
    const updatedAt = toStarknet ? starknetUpdatedAt : ethereumUpdatedAt;
    // A cached ownership snapshot from before submission is not completion evidence.
    const assets = updatedAt > item.createdAt ? (toStarknet ? starknetData : ethereumData) : [];
    return isBridgeTransferIndexed(item, crossings, assets);
  }).map((item) => item.id), [crossings, ethereumData, ethereumUpdatedAt, localTransfers, starknetData, starknetUpdatedAt]);
  useEffect(() => {
    if (retiredIds.length) pruneTransfers(retiredIds);
  }, [pruneTransfers, retiredIds]);
  return retiredIds;
};

const bridgeQueryOptions = {
  refetchInterval: 30 * 1000,
  staleTime: 30 * 1000,
  refetchOnMount: 'always',
  refetchOnWindowFocus: true,
};

const normalizeProgressItem = (transfer, fallbackAssetType) => {
  const direction = getTransferValue(transfer, 'direction') || getTransferValue(transfer, 'bridgeDirection');
  const originChain = getTransferValue(transfer, 'originChain') || (
    direction === 'l1_to_l2' || getTransferValue(transfer, 'origin') === 'ETHEREUM' ? 'ethereum' : 'starknet'
  );
  const readyCount = Number(getTransferValue(transfer, 'readyCount') || 0);
  const pendingCount = Number(getTransferValue(transfer, 'pendingCount') || 0);
  const status = getTransferValue(transfer, 'status')
    || (readyCount > 0 ? 'ready' : undefined)
    || (pendingCount > 0 ? 'waiting_l1' : undefined)
    || 'in_progress';
  const canConfirm = originChain === 'starknet' && isReceiveReady(transfer);
  return {
    amount: getTransferValue(transfer, 'amount'),
    assetIds: getTransferAssetIds(transfer),
    assetType: getTransferAssetType(transfer) || fallbackAssetType,
    canConfirm,
    createdAt: getTransferValue(transfer, 'createdAt'),
    displayChain: getTransferValue(transfer, 'displayChain') || (canConfirm ? 'ethereum' : originChain),
    direction: direction || (
      getTransferValue(transfer, 'origin') === 'STARKNET' && getTransferValue(transfer, 'destination') === 'ETHEREUM'
        ? 'l2_to_l1'
        : (getTransferValue(transfer, 'origin') === 'ETHEREUM' ? 'l1_to_l2' : undefined)
    ),
    error: getTransferValue(transfer, 'error'),
    eventTimestamp: getTransferValue(transfer, 'event')?.timestamp,
    events: getTransferValue(transfer, 'events'),
    fromAddress: getTransferValue(transfer, 'fromAddress'),
    id: getTransferValue(transfer, 'id') || getTransferValue(transfer, '_id') || getTransferValue(transfer, 'txHash'),
    layer: getTransferValue(transfer, 'layer'),
    originChain,
    pendingCount,
    recipient: getTransferValue(transfer, 'recipient') || getTransferValue(transfer, 'toAddress'),
    readyCount,
    status,
    toAddress: getTransferValue(transfer, 'toAddress'),
    txHash: getTransferValue(transfer, 'txHash'),
    updatedAt: getTransferValue(transfer, 'updatedAt'),
  };
};

const useBridgeAssets = (assetType) => {
  const { address: ethereumAddress } = useAccount();
  const { accountAddress: starknetAddress } = useSession();
  const localTransfers = useLocalBridgeTransfers(assetType, ethereumAddress, starknetAddress);
  const config = getBridgeAssetConfig(assetType);

  const ethereumAssets = useQuery({
    queryKey: ['bridgeAssets', assetType, 'ethereum', ethereumAddress, bridgeNetwork],
    queryFn: () => api.getBridgeWalletAssets({
      address: ethereumAddress,
      chain: 'ethereum',
      label: config.entityLabel
    }),
    enabled: !!ethereumAddress && !!config?.entityLabel,
    ...bridgeQueryOptions,
  });

  const starknetAssets = useQuery({
    queryKey: ['bridgeAssets', assetType, 'starknet', starknetAddress, bridgeNetwork],
    queryFn: () => api.getBridgeWalletAssets({
      address: starknetAddress,
      chain: 'starknet',
      label: config.entityLabel
    }),
    enabled: !!starknetAddress && !!config?.entityLabel,
    ...bridgeQueryOptions,
  });

  const l2ToL1Crossings = useQuery({
    queryKey: ['bridgeCrossings', assetType, 'l2ToL1', ethereumAddress, starknetAddress, bridgeNetwork],
    queryFn: () => api.getBridgeCrossings({
      destination: 'ETHEREUM',
      fromAddress: ethereumAddress ? undefined : starknetAddress,
      origin: 'STARKNET',
      toAddress: ethereumAddress
    }),
    enabled: !!assetType && (!!ethereumAddress || !!starknetAddress),
    ...bridgeQueryOptions,
  });

  const l1ToL2Crossings = useQuery({
    queryKey: ['bridgeCrossings', assetType, 'l1ToL2', ethereumAddress, starknetAddress, bridgeNetwork],
    queryFn: () => api.getBridgeCrossings({
      destination: 'STARKNET',
      origin: 'ETHEREUM',
      toAddress: starknetAddress
    }),
    enabled: !!assetType && !!starknetAddress,
    ...bridgeQueryOptions,
  });

  const indexedCrossings = useMemo(() => [
    ...toArray(l1ToL2Crossings.data),
    ...toArray(l2ToL1Crossings.data)
  ].filter((item) => getTransferAssetType(item) === assetType)
    .map((item) => normalizeProgressItem(item, assetType)), [assetType, l1ToL2Crossings.data, l2ToL1Crossings.data]);
  const retiredIds = useRetireIndexedTransfers(
    localTransfers, indexedCrossings,
    ethereumAssets, starknetAssets
  );

  const progressItems = useMemo(() => {
    const visibleEthereumAssets = (ethereumAssets.data || [])
      .filter((asset) => isAssetVisibleOnChain(asset, 'ethereum'));
    const visibleStarknetAssets = (starknetAssets.data || [])
      .filter((asset) => isAssetVisibleOnChain(asset, 'starknet'));
    const indexed = indexedCrossings.filter(isActiveBridgeTransfer);
    const indexedAssetIds = indexed.reduce((ids, item) => {
      item.assetIds?.forEach((id) => ids.add(Number(id)));
      return ids;
    }, new Set());
    const indexedAssetBridgeProgress = [
      ...getAssetBridgeProgressItems(visibleEthereumAssets, assetType, indexedAssetIds),
      ...getAssetBridgeProgressItems(visibleStarknetAssets, assetType, indexedAssetIds)
    ];
    const local = localTransfers.filter((item) => item.assetType === assetType && !retiredIds.includes(item.id));

    // Indexed messages keep their full batches; only optimistic display rows may be partial.
    const indexedProgress = [...indexed, ...indexedAssetBridgeProgress];
    const visibleLocal = local.map((item) => ({
      ...item,
      assetIds: item.assetIds.filter((id) => !indexedProgress.some((progress) => progress.assetIds.includes(id)))
    })).filter((item) => item.assetIds.length > 0);
    return [...indexedProgress, ...visibleLocal];
  }, [assetType, ethereumAssets.data, indexedCrossings, localTransfers, retiredIds, starknetAssets.data]);

  return {
    config,
    ethereumAssets: {
      ...ethereumAssets,
      data: (ethereumAssets.data || []).filter((asset) => isAssetVisibleOnChain(asset, 'ethereum'))
    },
    progressItems,
    starknetAssets: {
      ...starknetAssets,
      data: (starknetAssets.data || []).filter((asset) => isAssetVisibleOnChain(asset, 'starknet'))
    },
  };
};

const useBridgeSway = () => {
  const queryClient = useQueryClient();
  const pruneTransfers = useStore(s => s.dispatchBridgeTransfersPruned);
  const { address: ethereumAddress } = useAccount();
  const { accountAddress: starknetAddress, provider } = useSession();
  const starknetSway = useSwayBalance(starknetAddress);
  const localTransfers = useLocalBridgeTransfers('sway', ethereumAddress, starknetAddress);

  const ethereumSway = useBalance({
    address: ethereumAddress,
    token: appConfig.get('Ethereum.Address.swayToken') || undefined,
    query: {
      enabled: !!ethereumAddress && !!appConfig.get('Ethereum.Address.swayToken'),
      ...bridgeQueryOptions,
    }
  });

  const swayCrossings = useQuery({
    queryKey: ['bridgeSwayCrossings', ethereumAddress, starknetAddress, bridgeNetwork],
    queryFn: () => api.getSwayCrossings({
      fromAddress: ethereumAddress ? undefined : starknetAddress,
      toAddress: ethereumAddress
    }),
    enabled: !!ethereumAddress || !!starknetAddress,
    ...bridgeQueryOptions,
  });

  const indexed = useMemo(() => toArray(swayCrossings.data)
    .map((item) => normalizeProgressItem(item, 'sway')), [swayCrossings.data]);
  const deposits = localTransfers.filter((item) => item.direction === 'l1_to_l2');
  const depositStatuses = useQueries({ queries: deposits.map((item) => ({
    queryKey: ['bridgeSwayDeposit', bridgeNetwork, item.txHash],
    queryFn: () => provider.getL1MessagesStatus(item.txHash),
    enabled: !!provider,
    ...bridgeQueryOptions,
  })) });
  const completedDepositIds = deposits.filter((item, index) => isSwayDepositComplete(depositStatuses[index]?.data))
    .map((item) => item.id);
  useEffect(() => {
    if (!completedDepositIds.length) return;
    pruneTransfers(completedDepositIds);
    queryClient.invalidateQueries({ queryKey: ['walletBalance', 'sway', starknetAddress] });
    ethereumSway.refetch();
  }, [completedDepositIds, ethereumSway, pruneTransfers, queryClient, starknetAddress]);
  const indexedIds = useRetireIndexedTransfers(localTransfers, indexed);
  const retiredIds = [...indexedIds, ...completedDepositIds];
  const crossingItems = [
    ...indexed,
    ...localTransfers.filter((item) => !retiredIds.includes(item.id))
  ];

  return {
    ethereumSway,
    starknetSway,
    swayCrossings: crossingItems,
  };
};

export { useBridgeSway };

export default useBridgeAssets;
