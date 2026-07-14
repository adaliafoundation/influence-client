import { Entity, ethereumContracts, starknetContracts } from '@influenceth/sdk';

import { appConfig } from '~/appConfig';

const getConfig = (key) => appConfig.has(key) ? appConfig.get(key) : '';

const buildAssetConfig = ({
  assetType,
  label,
  entityLabel,
  ethereumTokenKey,
  ethereumBridgeKey,
  ethereumBridgeContract,
  starknetTokenKey,
  starknetContract,
  starknetName,
}) => ({
  assetType,
  label,
  entityLabel,
  ethereumBridgeAddress: getConfig(ethereumBridgeKey),
  ethereumBridgeContract,
  ethereumTokenAddress: getConfig(ethereumTokenKey),
  starknetAssetAddress: getConfig(starknetTokenKey),
  starknetAssetContract: starknetContract,
  starknetName,
});

const bridgeAssetConfigs = {
  asteroids: buildAssetConfig({
    assetType: 'asteroids',
    label: 'Asteroids',
    entityLabel: Entity.IDS.ASTEROID,
    ethereumTokenKey: 'Ethereum.Address.asteroidToken',
    ethereumBridgeKey: 'Ethereum.Address.asteroidBridge',
    ethereumBridgeContract: ethereumContracts.AsteroidBridge,
    starknetTokenKey: 'Starknet.Address.asteroidToken',
    starknetContract: starknetContracts.Asteroid,
    starknetName: 'Asteroid',
  }),
  crewmates: buildAssetConfig({
    assetType: 'crewmates',
    label: 'Crewmates',
    entityLabel: Entity.IDS.CREWMATE,
    ethereumTokenKey: 'Ethereum.Address.crewmateToken',
    ethereumBridgeKey: 'Ethereum.Address.crewmateBridge',
    ethereumBridgeContract: ethereumContracts.CrewmateBridge,
    starknetTokenKey: 'Starknet.Address.crewmateToken',
    starknetContract: starknetContracts.Crewmate,
    starknetName: 'Crewmate',
  }),
  crews: buildAssetConfig({
    assetType: 'crews',
    label: 'Crews',
    entityLabel: Entity.IDS.CREW,
    ethereumTokenKey: 'Ethereum.Address.crewToken',
    ethereumBridgeKey: 'Ethereum.Address.crewBridge',
    ethereumBridgeContract: ethereumContracts.CrewBridge,
    starknetTokenKey: 'Starknet.Address.crewToken',
    starknetContract: starknetContracts.Crew,
    starknetName: 'Crew',
  }),
  ships: buildAssetConfig({
    assetType: 'ships',
    label: 'Ships',
    entityLabel: Entity.IDS.SHIP,
    ethereumTokenKey: 'Ethereum.Address.shipToken',
    ethereumBridgeKey: 'Ethereum.Address.shipBridge',
    ethereumBridgeContract: ethereumContracts.ShipBridge,
    starknetTokenKey: 'Starknet.Address.shipToken',
    starknetContract: starknetContracts.Ship,
    starknetName: 'Ship',
  }),
};

const bridgeAssetTypes = Object.keys(bridgeAssetConfigs);

const getBridgeAssetConfig = (assetType) => bridgeAssetConfigs[assetType];

const isBridgeAssetConfigured = (assetType) => {
  const config = getBridgeAssetConfig(assetType);
  return !!(
    config?.ethereumBridgeAddress
    && config?.ethereumTokenAddress
    && config?.starknetAssetAddress
  );
};

export {
  bridgeAssetConfigs,
  bridgeAssetTypes,
  getBridgeAssetConfig,
  getConfig,
  isBridgeAssetConfigured,
};
