import { useCallback, useMemo, useState } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { formatUnits } from 'viem';
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from 'wagmi';

import AsteroidsHeroImage from '~/assets/images/sales/asteroids_hero.png';
import CrewmatesHeroImage from '~/assets/images/sales/crewmates_hero.png';
import CrewHeroImage from '~/assets/images/modal_headers/OwnedCrew.png';
import ShipHeroImage from '~/assets/images/hud_headers/SurfaceShip.png';
import StarknetIconImage from '~/assets/images/starknet-icon.png';
import SwayHeroImage from '~/assets/images/sales/sway_hero.jpg';
import {
  AsteroidIcon,
  CopyIcon,
  CrewIcon,
  CrewmateIcon,
  EthIcon,
  GoIcon,
  ShipIcon,
  SwayIcon,
  WalletIcon,
} from '~/components/Icons';
import { bridgeAssetTypes, getBridgeAssetConfig, isBridgeAssetConfigured } from '~/bridge/assets';
import LauncherDialog from '~/game/launcher/components/LauncherDialog';
import useBridgeActions from '~/hooks/useBridgeActions';
import useBridgeAssets, { useBridgeSway } from '~/hooks/useBridgeAssets';
import useSession from '~/hooks/useSession';
import useStore from '~/hooks/useStore';
import { configuredChain } from '~/contexts/WagmiContext';

const iconByType = {
  asteroids: <AsteroidIcon />,
  crewmates: <CrewmateIcon />,
  crews: <CrewIcon />,
  ships: <ShipIcon />,
  sway: <SwayIcon />,
};

const backgroundByType = {
  asteroids: AsteroidsHeroImage,
  crewmates: CrewmatesHeroImage,
  crews: CrewHeroImage,
  ships: ShipHeroImage,
  sway: SwayHeroImage,
};

const Pane = styled.div`
  box-sizing: border-box;
  color: white;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 24px 30px;
  position: relative;
`;

const CoverImage = styled.div`
  height: 260px;
  left: 0;
  opacity: 0.38;
  pointer-events: none;
  position: absolute;
  top: 0;
  width: 100%;
  z-index: 0;

  &:before {
    background-color: #111;
    background-image: url(${p => p.src});
    background-position: ${p => p.center || 'center center'};
    background-repeat: no-repeat;
    background-size: cover;
    content: '';
    display: block;
    height: 100%;
    mask-image: linear-gradient(to bottom, transparent 0%, black 20%, black 48%, transparent 100%);
  }
`;

const PaneContent = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  position: relative;
  z-index: 1;
`;

const Header = styled.div`
  flex: 0 0 auto;
  align-items: center;
  border-bottom: 1px solid #222;
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  padding: 0 45px 18px 0;

  & > svg, & > .icon {
    color: ${p => p.theme.colors.main};
    font-size: 28px;
  }
`;

const Title = styled.div`
  font-size: 26px;
  text-transform: uppercase;
`;

const Subtitle = styled.div`
  color: #aaa;
  font-size: 14px;
  margin-top: 4px;
`;

const ConnectGrid = styled.div`
  align-self: center;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 20px;
  width: min(350px, 100%);
`;

const Button = styled.button`
  align-items: center;
  background: rgba(${p => p.theme.colors.mainRGB}, ${p => p.primary ? 0.25 : 0.12});
  border: 1px solid rgba(${p => p.theme.colors.mainRGB}, ${p => p.primary ? 0.8 : 0.4});
  color: white;
  cursor: ${p => p.disabled ? 'default' : p.theme.cursors.active};
  display: inline-flex;
  font-family: inherit;
  font-size: 14px;
  gap: 8px;
  justify-content: center;
  min-height: 40px;
  opacity: ${p => p.disabled ? 0.45 : 1};
  padding: 0 16px;
  text-transform: uppercase;

  &:hover {
    ${p => !p.disabled && `border-color: ${p.theme.colors.main};`}
  }
`;

const ConnectButton = styled(Button)`
  min-height: 48px;
  width: 100%;
`;

const ConnectorLogo = styled.img`
  border-radius: 50%;
  height: 22px;
  object-fit: contain;
  width: 22px;
`;

const Columns = styled.div`
  display: grid;
  flex: 1;
  gap: 18px;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  min-height: 0;
`;

const ChainColumn = styled.div`
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid #222;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
`;

const ChainHeader = styled.div`
  align-items: center;
  background: #080808;
  border-bottom: 1px solid #222;
  display: flex;
  justify-content: space-between;
  min-height: 58px;
  padding: 0 14px;
`;

const ChainTitle = styled.div`
  align-items: center;
  display: flex;
  font-size: 16px;
  gap: 8px;
  text-transform: uppercase;
`;

const Address = styled.div`
  color: #999;
  font-size: 12px;
`;

const RowList = styled.div`
  flex: 1;
  min-height: 0;
  overflow: hidden auto;
`;

const rowProgressAnimation = keyframes`
  from { background-position: 0 0; }
  to { background-position: 400px 0; }
`;

const AssetRow = styled.div`
  align-items: center;
  background: ${p => p.selected ? `rgba(${p.theme.colors.mainRGB}, 0.18)` : 'transparent'};
  border-bottom: 1px solid #171717;
  border-left: 3px solid ${p => p.selected ? p.theme.colors.main : 'transparent'};
  color: ${p => p.selected ? 'white' : (p.dim ? '#888' : 'white')};
  cursor: ${p => p.disabled ? 'default' : p.theme.cursors.active};
  display: grid;
  gap: 12px;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  min-height: 48px;
  opacity: ${p => p.disabled ? 0.62 : 1};
  overflow: hidden;
  padding: 8px 14px 8px 11px;
  position: relative;

  ${p => p.$inProgress && css`
    &::before {
      animation: ${rowProgressAnimation} 5000ms linear infinite;
      background-image: repeating-linear-gradient(
        90deg,
        transparent 0%,
        transparent 16%,
        rgba(${p.theme.colors.mainRGB}, 0.12) 28%,
        rgba(${p.theme.colors.mainRGB}, 0.30) 50%,
        rgba(${p.theme.colors.mainRGB}, 0.12) 72%,
        transparent 84%,
        transparent 100%
      );
      background-size: 400px 100%;
      content: "";
      inset: 0;
      pointer-events: none;
      position: absolute;
    }
  `}

  & > * {
    position: relative;
    z-index: 1;
  }

  &:hover {
    ${p => !p.disabled && `
      background: ${p.selected ? `rgba(${p.theme.colors.mainRGB}, 0.24)` : 'rgba(255, 255, 255, 0.035)'};
    `}
  }
`;

const AssetBadge = styled.div`
  align-items: center;
  border: 1px solid rgba(${p => p.theme.colors.mainRGB}, 0.35);
  color: ${p => p.selected ? 'white' : p.theme.colors.main};
  display: flex;
  height: 30px;
  justify-content: center;
  opacity: ${p => p.dim ? 0.7 : 1};
  width: 30px;

  & > svg {
    height: 19px;
    width: 19px;
  }
`;

const AssetName = styled.div`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const AssetMeta = styled.div`
  color: #888;
  font-size: 12px;
  margin-top: 3px;
`;

const Status = styled.div`
  border: 1px solid #333;
  color: ${p => p.ready ? p.theme.colors.success : '#aaa'};
  font-size: 11px;
  padding: 4px 7px;
  text-transform: uppercase;
`;

const ColumnControls = styled.div`
  align-items: center;
  border-bottom: 1px solid #222;
  display: flex;
  gap: 10px;
  justify-content: space-between;
  min-height: 60px;
  padding: 10px 14px;
`;

const ControlButtons = styled.div`
  display: flex;
  gap: 8px;
`;

const DirectionalActionButton = styled(Button)`
  & > svg {
    transform: ${p => p.direction === 'left' ? 'rotate(180deg)' : 'none'};
  }
`;

const ColumnFooter = styled(ColumnControls)`
  border-bottom: 0;
  border-top: 1px solid #222;
`;

const HoverContent = styled.label`
  display: none;
`;

const NoHoverContent = styled.label`
  display: block;
`;

const ConnectedButton = styled.div`
  align-items: center;
  background: rgba(${p => p.theme.colors.darkMainRGB}, 0.2);
  border: 1px solid rgba(${p => p.theme.colors.mainRGB}, 0.4);
  border-radius: 20px;
  color: #aaa;
  cursor: ${p => p.theme.cursors.active};
  display: flex;
  height: 34px;
  justify-content: center;
  margin: 0 0 10px 30px;
  overflow: hidden;
  position: relative;
  transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
  width: 250px;

  &:hover {
    background: rgba(${p => p.theme.colors.mainRGB}, 0.3);
    border-color: rgba(${p => p.theme.colors.mainRGB}, 0.8);
    color: white;

    & ${HoverContent} {
      display: block;
    }

    & ${NoHoverContent} {
      display: none;
    }
  }
`;

const GreenDot = styled.div`
  align-items: center;
  background: rgba(${p => p.theme.colors.successRGB}, 0.15);
  border-radius: 100%;
  display: flex;
  height: 18px;
  justify-content: center;
  left: 8px;
  position: absolute;
  top: 8px;
  width: 18px;

  &:before {
    background: rgba(${p => p.theme.colors.successRGB}, 1);
    border-radius: 100%;
    content: "";
    display: block;
    height: 10px;
    width: 10px;
  }
`;

const CopyLink = styled.div`
  color: ${p => p.theme.colors.main};
  cursor: ${p => p.theme.cursors.active};
  opacity: 0.5;
  padding: 10px 12px;
  position: absolute;
  right: 0;
  top: 0;
  transition: opacity 100ms ease;
  z-index: 1;

  &:hover {
    filter: drop-shadow(0 0 4px ${p => p.theme.colors.brightMain});
    opacity: 1;
  }
`;

const ChainImageIcon = styled.img`
  height: 18px;
  object-fit: contain;
  width: 18px;
`;

const EthereumConnection = () => {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const createAlert = useStore(s => s.dispatchAlertLogged);

  const onCopyWalletAddress = useCallback((e) => {
    e.stopPropagation();
    try {
      navigator.clipboard.writeText(`${address}`);
      createAlert({
        type: 'ClipboardAlert',
        data: { content: 'Ethereum wallet address copied to clipboard.' },
        duration: 3000
      });
    } catch (err) {
      console.warn(err);
    }
  }, [address, createAlert]);

  if (!isConnected) return null;

  return (
    <div style={{ marginRight: 16, position: 'relative', width: 280 }}>
      <ConnectedButton onClick={() => disconnect()}>
        <GreenDot />
        <NoHoverContent>{formatAddress(address)}</NoHoverContent>
        <HoverContent>Disconnect</HoverContent>
      </ConnectedButton>
      <CopyLink
        data-tooltip-content="Copy Ethereum Address"
        data-tooltip-id="launcherTooltip"
        data-tooltip-place="bottom"
        onClick={onCopyWalletAddress}>
        <CopyIcon />
      </CopyLink>
    </div>
  );
};

const Empty = styled.div`
  color: #777;
  padding: 30px 14px;
  text-align: center;
`;

const SwayGrid = styled(Columns)`
  align-items: stretch;
`;

const Balance = styled.div`
  font-size: 32px;
  margin: 0 14px 24px;
`;

const BalanceLabel = styled.div`
  color: #888;
  margin: 28px 14px 6px;
`;

const BalancePending = styled.div`
  color: ${p => p.amount > 0 ? p.theme.colors.success : p.theme.colors.error};
  font-size: 13px;
  margin: -18px 14px 24px;
`;

const Input = styled.input`
  background: #050505;
  border: 1px solid #333;
  color: white;
  font-family: inherit;
  font-size: 16px;
  height: 40px;
  padding: 0 12px;
  width: 150px;
`;

const formatAddress = (address) => address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not connected';

const swayBalanceFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 6,
});

const formatSwayBalance = (value) => {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue)) return '0';
  return swayBalanceFormatter.format(numericValue);
};

const getSwayAmountValue = (amount) => {
  if (typeof amount === 'string' && amount.startsWith('0x')) {
    return Number(formatUnits(BigInt(amount), 6));
  }
  return Number(amount || 0);
};

const getSwayCrossingBaseKey = (item) => (
  item.id || item.txHash || `${item.amount}:${item.fromAddress}:${item.toAddress || item.recipient}`
);

const getSwayCrossingKey = (item) => {
  const baseKey = getSwayCrossingBaseKey(item);
  if (item.readyIndex != null) return `${baseKey}:ready:${item.readyIndex}`;
  if (item.pendingIndex != null) return `${baseKey}:pending:${item.pendingIndex}`;
  return baseKey;
};

const isSameAddress = (left, right) => (
  !!left && !!right && `${left}`.toLowerCase() === `${right}`.toLowerCase()
);

const expandReadySwayItems = (items) => (
  items.flatMap((item) => (
    Array.from({ length: Math.max(1, Number(item.readyCount || 1)) }, (_, readyIndex) => ({
      ...item,
      readyIndex
    }))
  ))
);

const expandPendingSwayItems = (items) => (
  items.flatMap((item) => (
    Array.from({ length: Math.max(1, Number(item.pendingCount || 1)) }, (_, pendingIndex) => ({
      ...item,
      canConfirm: false,
      pendingIndex
    }))
  ))
);

const getPendingSwayAmounts = (crossings) => (
  (crossings || []).reduce((acc, crossing) => {
    if (!crossing.txHash || ['complete', 'failed'].includes(crossing.status)) return acc;
    const amount = getSwayAmountValue(crossing.amount);
    if (!Number.isFinite(amount) || amount <= 0) return acc;

    if (crossing.direction === 'l1_to_l2') {
      acc.ethereum -= amount;
      acc.starknet += amount;
    } else if (crossing.direction === 'l2_to_l1') {
      acc.ethereum += amount;
      acc.starknet -= amount;
    }
    return acc;
  }, { ethereum: 0, starknet: 0 })
);

const getAssetName = (asset, fallbackLabel) => {
  const name = asset?.Name?.name || asset?.name;
  return name || `${fallbackLabel.slice(0, -1)} #${asset?.id}`;
};

const getItemKey = (item) => `${item.kind}:${item.id || item.txHash || item.assetIds?.join('-')}`;

const getProgressItemKey = (item) => (
  `${item.assetType}:${item.assetIds?.join('-')}:${item.fromAddress}:${item.toAddress}`
);

const isActiveProgressItem = (item) => !['complete', 'failed'].includes(item?.status);

const findProgressForAsset = (items, assetId) => (
  items.find((item) => item.assetIds?.some((id) => Number(id) === assetId))
);

const ConnectEthereum = () => {
  const chainId = useChainId();
  const { connectors, connect, isPending } = useConnect();
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();
  const { isPending: switchIsPending, switchChain } = useSwitchChain();
  const isWrongChain = isConnected && chainId !== configuredChain.id;

  if (isConnected) {
    return (
      <Pane>
        <Header>
          <WalletIcon />
          <div>
            <Title>Ethereum Wallet Connected</Title>
            <Subtitle>
              {isWrongChain
                ? `Switch to ${configuredChain.name} to bridge assets.`
                : formatAddress(address)}
            </Subtitle>
          </div>
        </Header>
        <ConnectGrid>
          {isWrongChain && (
            <ConnectButton
              disabled={switchIsPending}
              onClick={() => switchChain({ chainId: configuredChain.id })}
              primary>
              Switch to {configuredChain.name}
            </ConnectButton>
          )}
          <ConnectButton onClick={() => disconnect()}>
            Disconnect
          </ConnectButton>
        </ConnectGrid>
      </Pane>
    );
  }

  return (
    <Pane>
      <Header>
        <WalletIcon />
        <div>
          <Title>Connect Ethereum Wallet</Title>
          <Subtitle>Connect an Ethereum wallet to view and bridge assets.</Subtitle>
        </div>
      </Header>
      <ConnectGrid>
        {connectors.map((connector) => (
          <ConnectButton
            key={connector.uid}
            disabled={isPending}
            onClick={() => connect({ connector, chainId: configuredChain.id })}>
            {connector.icon
              ? <ConnectorLogo alt="" src={connector.icon} />
              : <WalletIcon />}
            {connector.name}
          </ConnectButton>
        ))}
      </ConnectGrid>
    </Pane>
  );
};

const ChainAssetColumn = ({
  actionLabel,
  address,
  actionBusy,
  assets,
  assetType,
  canAct,
  chain,
  extraAction,
  icon,
  isLoading,
  onAction,
  pendingProgressKeys = [],
  progressItems,
  title,
}) => {
  const config = getBridgeAssetConfig(assetType);
  const [selected, setSelected] = useState({});

  const rows = useMemo(() => {
    const chainProgress = (progressItems || [])
      .filter((item) => (item.displayChain || item.originChain) === chain && isActiveProgressItem(item));
    const assetIds = new Set((assets || []).map((asset) => Number(asset.id)));

    return [
      ...(assets || []).map((asset) => {
        const assetId = Number(asset.id);
        const progress = findProgressForAsset(chainProgress, assetId);
        if (progress) {
          return {
            ...progress,
            asset,
            id: assetId,
            kind: 'progress',
            label: getAssetName(asset, config.label),
            meta: progress.txHash
              ? `#${asset.id} - ${formatAddress(progress.txHash)}`
              : `#${asset.id}`,
          };
        }
        return {
          asset,
          id: assetId,
          kind: 'asset',
          label: getAssetName(asset, config.label),
          meta: `#${asset.id}`,
        };
      }),
      ...chainProgress
        .filter((item) => !item.assetIds?.some((id) => assetIds.has(Number(id))))
        .map((item) => ({
          ...item,
          id: item.assetIds?.[0] || item.txHash || item.id,
          kind: 'progress',
          label: item.assetIds?.length
            ? `${config.label} ${item.assetIds.map((id) => `#${id}`).join(', ')}`
            : config.label,
          meta: item.txHash ? formatAddress(item.txHash) : 'Bridge in progress',
        }))
    ];
  }, [assets, chain, config.label, progressItems]);

  const selectedRows = useMemo(() => (
    rows.filter((row) => selected[getItemKey(row)])
  ), [rows, selected]);

  const mode = selectedRows[0]?.kind;
  const actionDisabled = !canAct || selectedRows.length === 0;
  const renderedExtraAction = typeof extraAction === 'function' ? extraAction(selectedRows) : extraAction;

  const toggleRow = useCallback((row) => {
    if (row.kind === 'progress' && !row.canConfirm) return;
    const key = getItemKey(row);
    setSelected((current) => {
      const next = mode && mode !== row.kind ? {} : { ...current };
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });
  }, [mode]);

  const handleAction = useCallback(async () => {
    if (actionDisabled) return;
    const result = await onAction(selectedRows);
    if (result) setSelected({});
  }, [actionDisabled, onAction, selectedRows]);

  const actionButton = (
    <DirectionalActionButton
      direction={chain === 'starknet' ? 'left' : 'right'}
      disabled={actionDisabled}
      onClick={handleAction}
      primary>
      {chain === 'starknet' && <GoIcon />}
      {actionBusy ? 'Processing' : (mode === 'progress' ? 'Finalize' : actionLabel)}
      {chain !== 'starknet' && <GoIcon />}
    </DirectionalActionButton>
  );

  return (
    <ChainColumn>
      <ChainHeader>
        <ChainTitle>{icon}{title}</ChainTitle>
        <Address>{formatAddress(address)}</Address>
      </ChainHeader>
      <ColumnControls>
        {chain === 'starknet' ? (
          <>
            <ControlButtons>
              {actionButton}
              {renderedExtraAction}
            </ControlButtons>
            <span>{selectedRows.length} selected</span>
          </>
        ) : (
          <>
            <span>{selectedRows.length} selected</span>
            <ControlButtons>
              {renderedExtraAction}
              {actionButton}
            </ControlButtons>
          </>
        )}
      </ColumnControls>
      <RowList>
        {isLoading && <Empty>Loading assets...</Empty>}
        {!isLoading && rows.length === 0 && <Empty>No bridgeable items found.</Empty>}
        {rows.map((row) => {
          const key = getItemKey(row);
          const progressKey = row.kind === 'progress' ? getProgressItemKey(row) : null;
          const pending = !!progressKey && pendingProgressKeys.includes(progressKey);
          const selectable = row.kind === 'asset' || (row.canConfirm && !pending);
          const checked = !!selected[key];
          return (
            <AssetRow
              key={key}
              selected={checked}
              disabled={!selectable}
              dim={row.kind === 'progress'}
              $inProgress={row.kind === 'progress' && (!row.canConfirm || pending)}
              onClick={() => selectable && toggleRow(row)}>
              <AssetBadge selected={checked} dim={row.kind === 'progress'}>
                {iconByType[assetType]}
              </AssetBadge>
              <div>
                <AssetName>{row.label}</AssetName>
                <AssetMeta>{row.meta}</AssetMeta>
              </div>
              {row.kind === 'progress' && (
                <Status ready={row.canConfirm && !pending}>
                  {row.canConfirm && !pending ? 'Ready' : 'In progress'}
                </Status>
              )}
            </AssetRow>
          );
        })}
      </RowList>
    </ChainColumn>
  );
};

const AssetPane = ({ assetType }) => {
  const { address: ethereumAddress } = useAccount();
  const { accountAddress: starknetAddress, login } = useSession();
  const { bridgeAssetsToEthereum, bridgeAssetsToStarknet, busyKey, mintCrewFromAsteroid, receiveAssetsOnEthereum } = useBridgeActions();
  const { config, ethereumAssets, progressItems, starknetAssets } = useBridgeAssets(assetType);
  const [finalizedProgressKeys, setFinalizedProgressKeys] = useState([]);
  const [processingProgressKeys, setProcessingProgressKeys] = useState([]);

  const configured = isBridgeAssetConfigured(assetType);
  const ethereumAssetIds = useMemo(() => (
    new Set((ethereumAssets.data || []).map((asset) => Number(asset.id)))
  ), [ethereumAssets.data]);
  const visibleProgressItems = useMemo(() => (
    progressItems.filter((item) => {
      if (!finalizedProgressKeys.includes(getProgressItemKey(item))) return true;
      return !item.assetIds?.every((id) => ethereumAssetIds.has(Number(id)));
    })
  ), [ethereumAssetIds, finalizedProgressKeys, progressItems]);
  const pendingProgressKeys = useMemo(() => ([
    ...processingProgressKeys,
    ...finalizedProgressKeys
  ]), [finalizedProgressKeys, processingProgressKeys]);

  const finalizeProgressRows = useCallback(async (rows) => {
    const progressRows = rows.filter((row) => row.kind === 'progress');
    if (progressRows.length > 0) {
      const finalizedKeys = [];
      const results = [];
      for (const row of progressRows) {
        const key = getProgressItemKey(row);
        setProcessingProgressKeys((keys) => (keys.includes(key) ? keys : [...keys, key]));
        const hash = await receiveAssetsOnEthereum({
          assetType,
          assetIds: row.assetIds,
          fromAddress: row.fromAddress
        });
        results.push(hash);
        if (hash) finalizedKeys.push(key);
        else setProcessingProgressKeys((keys) => keys.filter((processingKey) => processingKey !== key));
      }
      if (finalizedKeys.length > 0) {
        setFinalizedProgressKeys((keys) => [
          ...keys,
          ...finalizedKeys.filter((key) => !keys.includes(key))
        ]);
        setProcessingProgressKeys((keys) => keys.filter((key) => !finalizedKeys.includes(key)));
        ethereumAssets.refetch();
      }
      return results.some(Boolean);
    }
    return false;
  }, [assetType, ethereumAssets, receiveAssetsOnEthereum]);

  const bridgeFromEthereum = useCallback(async (rows) => {
    if (rows.some((row) => row.kind === 'progress')) return finalizeProgressRows(rows);
    return bridgeAssetsToStarknet({ assetType, assets: rows.map((row) => row.asset) });
  }, [assetType, bridgeAssetsToStarknet, finalizeProgressRows]);

  const bridgeFromStarknet = useCallback(async (rows) => {
    if (rows.some((row) => row.kind === 'progress')) return finalizeProgressRows(rows);
    return bridgeAssetsToEthereum({ assetType, assets: rows.map((row) => row.asset) });
  }, [assetType, bridgeAssetsToEthereum, finalizeProgressRows]);

  const renderMintCrewAction = useCallback((selectedRows) => {
    const mintableRows = selectedRows.filter((row) => row.asset?.AsteroidReward?.hasMintableCrewmate);
    return (
      <Button
        disabled={mintableRows.length === 0 || !!busyKey}
        onClick={() => Promise.all(mintableRows.map((row) => mintCrewFromAsteroid(row.asset.id)))}>
        Mint Crew{mintableRows.length > 0 ? ` (${mintableRows.length})` : ''}
      </Button>
    );
  }, [busyKey, mintCrewFromAsteroid]);

  return (
    <Pane>
      <CoverImage src={backgroundByType[assetType]} />
      <PaneContent>
        <Header>
          {iconByType[assetType]}
          <div>
            <Title>{config.label}</Title>
            <Subtitle>
              {configured
                ? 'Select assets from one chain and bridge them to the other.'
                : 'This bridge is not configured for the current deployment.'}
            </Subtitle>
          </div>
        </Header>
        <Columns>
          <ChainAssetColumn
            actionLabel="Bridge to Starknet"
            address={ethereumAddress}
            assets={ethereumAssets.data || []}
            assetType={assetType}
            canAct={!busyKey}
            chain="ethereum"
            extraAction={assetType === 'asteroids' ? renderMintCrewAction : null}
            icon={<EthIcon />}
            isLoading={ethereumAssets.isLoading}
            onAction={bridgeFromEthereum}
            pendingProgressKeys={pendingProgressKeys}
            progressItems={visibleProgressItems}
            title="Ethereum" />
          <ChainAssetColumn
            actionBusy={busyKey === `receive-${assetType}`}
            actionLabel="Bridge to Ethereum"
            address={starknetAddress}
            assets={starknetAssets.data || []}
            assetType={assetType}
            canAct={!!starknetAddress && !busyKey}
            chain="starknet"
            icon={<ChainImageIcon alt="" src={StarknetIconImage} />}
            isLoading={starknetAssets.isLoading}
            onAction={bridgeFromStarknet}
            pendingProgressKeys={pendingProgressKeys}
            progressItems={visibleProgressItems}
            title="Starknet" />
        </Columns>
        {!starknetAddress && (
          <ColumnFooter style={{ borderTop: 0, justifyContent: 'flex-end', paddingRight: 0 }}>
            <Button onClick={login}>Connect Starknet Wallet</Button>
          </ColumnFooter>
        )}
      </PaneContent>
    </Pane>
  );
};

const SwayPane = () => {
  const { address: ethereumAddress } = useAccount();
  const { accountAddress: starknetAddress, login } = useSession();
  const { bridgeSwayToEthereum, bridgeSwayToStarknet, busyKey, receiveSwayOnEthereum } = useBridgeActions();
  const { ethereumSway, starknetSway, swayCrossings } = useBridgeSway();
  const [ethereumAmount, setEthereumAmount] = useState('');
  const [finalizedSwayIds, setFinalizedSwayIds] = useState([]);
  const [processingSwayIds, setProcessingSwayIds] = useState([]);
  const [selectedSway, setSelectedSway] = useState({});
  const [starknetAmount, setStarknetAmount] = useState('');

  const l1Balance = ethereumSway.data?.value != null
    ? formatUnits(ethereumSway.data.value, ethereumSway.data.decimals)
    : '0';
  const l2Balance = starknetSway.data ? formatUnits(BigInt(starknetSway.data), 6) : '0';
  const pendingSway = useMemo(() => getPendingSwayAmounts(swayCrossings), [swayCrossings]);
  const displayedL1Balance = Math.max(0, Number(l1Balance || 0) + pendingSway.ethereum);
  const displayedL2Balance = Math.max(0, Number(l2Balance || 0) + pendingSway.starknet);
  const readySwayItems = useMemo(() => (
    expandReadySwayItems(swayCrossings.filter((item) => (
      item.canConfirm
      && isSameAddress(item.recipient || item.toAddress, ethereumAddress)
    ))).filter((item) => !finalizedSwayIds.includes(getSwayCrossingKey(item)))
  ), [ethereumAddress, finalizedSwayIds, swayCrossings]);
  const pendingSwayItems = useMemo(() => (
    expandPendingSwayItems(swayCrossings.filter((item) => (
      Number(item.pendingCount || 0) > 0
      && isSameAddress(item.recipient || item.toAddress, ethereumAddress)
    )))
  ), [ethereumAddress, swayCrossings]);
  const selectedReadySwayItems = useMemo(() => (
    readySwayItems.filter((item) => selectedSway[getSwayCrossingKey(item)])
  ), [readySwayItems, selectedSway]);
  const toggleSwayItem = useCallback((item) => {
    const key = getSwayCrossingKey(item);
    setSelectedSway((current) => {
      const next = { ...current };
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });
  }, []);
  const finalizeReadySway = useCallback(async () => {
    const finalizedIds = [];
    for (const item of selectedReadySwayItems) {
      const id = getSwayCrossingKey(item);
      setProcessingSwayIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
      const hash = await receiveSwayOnEthereum(item);
      if (hash) finalizedIds.push(id);
      else setProcessingSwayIds((ids) => ids.filter((processingId) => processingId !== id));
    }
    if (finalizedIds.length > 0) {
      setFinalizedSwayIds((ids) => [...ids, ...finalizedIds]);
      setProcessingSwayIds((ids) => ids.filter((id) => !finalizedIds.includes(id)));
      setSelectedSway((current) => {
        const next = { ...current };
        finalizedIds.forEach((id) => delete next[id]);
        return next;
      });
      ethereumSway.refetch();
    }
  }, [ethereumSway, receiveSwayOnEthereum, selectedReadySwayItems]);

  return (
    <Pane>
      <CoverImage src={backgroundByType.sway} />
      <PaneContent>
        <Header>
          <SwayIcon />
          <div>
            <Title>SWAY</Title>
            <Subtitle>Bridge SWAY by amount between Ethereum and Starknet.</Subtitle>
          </div>
        </Header>
        <SwayGrid>
          <ChainColumn>
            <ChainHeader>
              <ChainTitle><EthIcon />Ethereum</ChainTitle>
              <Address>{formatAddress(ethereumAddress)}</Address>
            </ChainHeader>
            <ColumnControls>
              <Input
                onChange={(e) => setEthereumAmount(e.currentTarget.value)}
                placeholder="Amount"
                value={ethereumAmount} />
              <Button
                disabled={!ethereumAmount || !!busyKey}
                onClick={() => bridgeSwayToStarknet(ethereumAmount)}
                primary>
                Bridge to Starknet
              </Button>
            </ColumnControls>
            <BalanceLabel>SWAY Balance</BalanceLabel>
            <Balance>{formatSwayBalance(displayedL1Balance)}</Balance>
            {pendingSway.ethereum !== 0 && (
              <BalancePending amount={pendingSway.ethereum}>
                {pendingSway.ethereum > 0 ? '+' : '-'}{formatSwayBalance(Math.abs(pendingSway.ethereum))} pending
              </BalancePending>
            )}
            <RowList>
              {[...readySwayItems, ...pendingSwayItems].map((item) => {
                const key = getSwayCrossingKey(item);
                const checked = !!selectedSway[key];
                const isProcessing = processingSwayIds.includes(key);
                const amount = formatSwayBalance(getSwayAmountValue(item.amount));
                return (
                  <AssetRow
                    key={key}
                    selected={checked}
                    disabled={!item.canConfirm || isProcessing}
                    dim
                    $inProgress={!item.canConfirm || isProcessing}
                    onClick={() => item.canConfirm && !isProcessing && toggleSwayItem(item)}>
                    <AssetBadge selected={checked} dim>
                      <SwayIcon />
                    </AssetBadge>
                    <div>
                      <AssetName>{amount} SWAY</AssetName>
                      <AssetMeta>from {formatAddress(item.fromAddress)}</AssetMeta>
                    </div>
                    <Status ready={item.canConfirm && !isProcessing}>
                      {item.canConfirm && !isProcessing ? 'Ready' : 'In progress'}
                    </Status>
                  </AssetRow>
                );
              })}
            </RowList>
            {(readySwayItems.length > 0 || pendingSwayItems.length > 0) && (
              <ColumnFooter>
                <span>{selectedReadySwayItems.length} selected</span>
                <Button disabled={selectedReadySwayItems.length === 0 || !!busyKey} onClick={finalizeReadySway} primary>
                  {busyKey === 'sway-receive' ? 'Processing' : 'Finalize'}
                </Button>
              </ColumnFooter>
            )}
          </ChainColumn>
          <ChainColumn>
            <ChainHeader>
              <ChainTitle><ChainImageIcon alt="" src={StarknetIconImage} />Starknet</ChainTitle>
              <Address>{formatAddress(starknetAddress)}</Address>
            </ChainHeader>
            <ColumnControls>
              <Input
                onChange={(e) => setStarknetAmount(e.currentTarget.value)}
                placeholder="Amount"
                value={starknetAmount} />
              <Button
                disabled={!starknetAmount || !starknetAddress || !!busyKey}
                onClick={() => bridgeSwayToEthereum(starknetAmount)}
                primary>
                Bridge to Ethereum
              </Button>
            </ColumnControls>
            <BalanceLabel>SWAY Balance</BalanceLabel>
            <Balance>{formatSwayBalance(displayedL2Balance)}</Balance>
            {pendingSway.starknet !== 0 && (
              <BalancePending amount={pendingSway.starknet}>
                {pendingSway.starknet > 0 ? '+' : '-'}{formatSwayBalance(Math.abs(pendingSway.starknet))} pending
              </BalancePending>
            )}
            {!starknetAddress && (
              <ColumnFooter>
                <Button onClick={login}>Connect Starknet Wallet</Button>
              </ColumnFooter>
            )}
          </ChainColumn>
        </SwayGrid>
      </PaneContent>
    </Pane>
  );
};

const BridgePane = ({ assetType }) => {
  const { isConnected } = useAccount();
  if (!isConnected) return <ConnectEthereum />;
  if (assetType === 'sway') return <SwayPane />;
  return <AssetPane assetType={assetType} />;
};

const panes = [
  ...bridgeAssetTypes.map((assetType) => ({
    key: assetType,
    label: getBridgeAssetConfig(assetType).label,
    pane: <BridgePane assetType={assetType} />
  })),
  {
    key: 'sway',
    label: 'SWAY',
    pane: <BridgePane assetType="sway" />
  }
];

const Bridge = () => (
  <BridgeDialog />
);

const BridgeDialog = () => {
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const isReady = isConnected && chainId === configuredChain.id;

  if (!isReady) {
    return (
      <LauncherDialog
        paneOverflow="hidden"
        singlePane={<ConnectEthereum />} />
    );
  }

  return (
    <LauncherDialog
      panes={panes}
      paneOverflow="hidden"
      bottomLeftMenu={<EthereumConnection />} />
  );
};

export default Bridge;
