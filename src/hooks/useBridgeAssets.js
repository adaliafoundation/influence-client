import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount, useBalance } from 'wagmi';

import { bridgeAssetConfigs, getBridgeAssetConfig } from '~/bridge/assets';
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

const isActiveProgressItem = (item) => !['complete', 'COMPLETE', 'failed'].includes(getTransferValue(item, 'status'));

const hasAnyAsset = (assets, assetIds) => {
  const ids = new Set((assetIds || []).map(Number));
  return (assets || []).some((asset) => ids.has(Number(asset.id)));
};

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

const toLocalTransferArray = (bridgeTransfers) => {
  try {
    return Object.keys(bridgeTransfers || {}).map((key) => normalizeProgressItem(bridgeTransfers[key]));
  } catch (e) {
    return [];
  }
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
        : undefined
    ),
    error: getTransferValue(transfer, 'error'),
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
  const localTransferMap = useStore(s => s.bridgeTransfers);
  const localTransfers = useMemo(() => toLocalTransferArray(localTransferMap), [localTransferMap]);
  const config = getBridgeAssetConfig(assetType);
  const hasActiveLocalTransfers = useMemo(() => (
    localTransfers
      .some((item) => getTransferAssetType(item) === assetType && isActiveProgressItem(item))
  ), [assetType, localTransfers]);

  const ethereumAssets = useQuery({
    queryKey: ['bridgeAssets', assetType, 'ethereum', ethereumAddress],
    queryFn: () => api.getBridgeWalletAssets({
      address: ethereumAddress,
      chain: 'ethereum',
      label: config.entityLabel
    }),
    enabled: !!ethereumAddress && !!config?.entityLabel,
    refetchInterval: hasActiveLocalTransfers ? 30 * 1000 : false,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const starknetAssets = useQuery({
    queryKey: ['bridgeAssets', assetType, 'starknet', starknetAddress],
    queryFn: () => api.getBridgeWalletAssets({
      address: starknetAddress,
      chain: 'starknet',
      label: config.entityLabel
    }),
    enabled: !!starknetAddress && !!config?.entityLabel,
    refetchInterval: hasActiveLocalTransfers ? 30 * 1000 : false,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const hasActiveIndexedBridgeAssets = useMemo(() => (
    [...(ethereumAssets.data || []), ...(starknetAssets.data || [])]
      .some((asset) => asset?.Nft?.bridge?.status && asset.Nft.bridge.status !== 'COMPLETE')
  ), [ethereumAssets.data, starknetAssets.data]);

  const l2ToL1Crossings = useQuery({
    queryKey: ['bridgeCrossings', assetType, 'l2ToL1', ethereumAddress, starknetAddress],
    queryFn: () => api.getBridgeCrossings({
      destination: 'ETHEREUM',
      fromAddress: starknetAddress,
      origin: 'STARKNET',
      toAddress: ethereumAddress
    }),
    enabled: !!assetType && (!!ethereumAddress || !!starknetAddress),
    refetchInterval: hasActiveLocalTransfers || hasActiveIndexedBridgeAssets ? 30 * 1000 : false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const l1ToL2Crossings = useQuery({
    queryKey: ['bridgeCrossings', assetType, 'l1ToL2', ethereumAddress, starknetAddress],
    queryFn: () => api.getBridgeCrossings({
      destination: 'STARKNET',
      origin: 'ETHEREUM',
      toAddress: starknetAddress
    }),
    enabled: !!assetType && !!starknetAddress,
    refetchInterval: hasActiveLocalTransfers || hasActiveIndexedBridgeAssets ? 30 * 1000 : false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const progressItems = useMemo(() => {
    const visibleEthereumAssets = (ethereumAssets.data || [])
      .filter((asset) => isAssetVisibleOnChain(asset, 'ethereum'));
    const visibleStarknetAssets = (starknetAssets.data || [])
      .filter((asset) => isAssetVisibleOnChain(asset, 'starknet'));
    const indexed = [
      ...toArray(l1ToL2Crossings.data),
      ...toArray(l2ToL1Crossings.data)
    ]
      .filter((item) => !getTransferAssetType(item) || getTransferAssetType(item) === assetType)
      .filter((item) => getTransferValue(item, 'status') !== 'COMPLETE')
      .map((item) => normalizeProgressItem(item, assetType));
    const indexedAssetIds = indexed.reduce((ids, item) => {
      item.assetIds?.forEach((id) => ids.add(Number(id)));
      return ids;
    }, new Set());
    const indexedAssetBridgeProgress = [
      ...getAssetBridgeProgressItems(visibleEthereumAssets, assetType, indexedAssetIds),
      ...getAssetBridgeProgressItems(visibleStarknetAssets, assetType, indexedAssetIds)
    ];
    const indexedProgressAssetIds = indexedAssetBridgeProgress.reduce((ids, item) => {
      item.assetIds?.forEach((id) => ids.add(Number(id)));
      return ids;
    }, new Set(indexedAssetIds));
    const local = localTransfers
      .filter((item) => getTransferAssetType(item) === assetType)
      .map((item) => normalizeProgressItem(item, assetType))
      .filter((item) => (
        !(
          item.direction === 'l1_to_l2'
          && hasAnyAsset(visibleStarknetAssets, item.assetIds)
        )
        && !(
          item.direction === 'l2_to_l1'
          && hasAnyAsset(visibleEthereumAssets, item.assetIds)
        )
        && !(
          item.direction === 'receive_l1'
          && hasAnyAsset(visibleEthereumAssets, item.assetIds)
        )
        && !item.assetIds?.some((id) => indexedProgressAssetIds.has(Number(id)))
      ));

    return [...local, ...indexedAssetBridgeProgress, ...indexed];
  }, [assetType, ethereumAssets.data, l1ToL2Crossings.data, l2ToL1Crossings.data, localTransfers, starknetAssets.data]);

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
  const { address: ethereumAddress } = useAccount();
  const { accountAddress: starknetAddress } = useSession();
  const starknetSway = useSwayBalance(starknetAddress);
  const localTransferMap = useStore(s => s.bridgeTransfers);
  const localTransfers = useMemo(() => toLocalTransferArray(localTransferMap), [localTransferMap]);
  const hasActiveLocalTransfers = useMemo(() => (
    localTransfers.some((item) => getTransferAssetType(item) === 'sway' && isActiveProgressItem(item))
  ), [localTransfers]);

  const ethereumSway = useBalance({
    address: ethereumAddress,
    token: appConfig.get('Ethereum.Address.swayToken') || undefined,
    query: {
      enabled: !!ethereumAddress && !!appConfig.get('Ethereum.Address.swayToken'),
      refetchInterval: hasActiveLocalTransfers ? 30 * 1000 : false,
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    }
  });

  const swayCrossings = useQuery({
    queryKey: ['bridgeSwayCrossings', ethereumAddress, starknetAddress],
    queryFn: () => api.getSwayCrossings({
      fromAddress: starknetAddress,
      toAddress: ethereumAddress
    }),
    enabled: !!ethereumAddress || !!starknetAddress,
    refetchInterval: hasActiveLocalTransfers ? 30 * 1000 : false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const crossingItems = useMemo(() => {
    const local = localTransfers
      .filter((item) => getTransferAssetType(item) === 'sway')
      .map((item) => normalizeProgressItem(item, 'sway'));
    const indexed = toArray(swayCrossings.data).map((item) => normalizeProgressItem(item, 'sway'));
    const seen = new Set();
    return [...indexed, ...local].filter((item) => {
      const key = item.txHash || item.id || `${item.direction}:${item.amount}:${item.fromAddress}:${item.toAddress}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [localTransfers, swayCrossings.data]);

  return {
    ethereumSway,
    starknetSway,
    swayCrossings: crossingItems,
  };
};

export { useBridgeSway };

export default useBridgeAssets;
