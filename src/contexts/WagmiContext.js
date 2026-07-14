import { useMemo } from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { injected } from '@wagmi/core';
import { mainnet, sepolia } from 'wagmi/chains';

import { appConfig } from '~/appConfig';

const chainById = {
  1: mainnet,
  11155111: sepolia
};

const configuredChainId = Number(appConfig.get('Ethereum.chainId') || 1);
const configuredChain = chainById[configuredChainId] || mainnet;

const getConfiguredChains = () => {
  if (configuredChain.id === mainnet.id) return [mainnet];
  if (configuredChain.id === sepolia.id) return [sepolia];
  return [configuredChain];
};

const getConnectors = () => {
  return [
    injected({ shimDisconnect: true })
  ];
};

const createWagmiConfig = () => {
  const chains = getConfiguredChains();
  return createConfig({
    chains,
    connectors: getConnectors(),
    multiInjectedProviderDiscovery: true,
    transports: chains.reduce((acc, chain) => ({
      ...acc,
      [chain.id]: http(appConfig.get('Ethereum.provider') || undefined)
    }), {})
  });
};

const WagmiContextProvider = ({ children }) => {
  const config = useMemo(() => createWagmiConfig(), []);
  return <WagmiProvider config={config}>{children}</WagmiProvider>;
};

export { configuredChain };

export default WagmiContextProvider;
