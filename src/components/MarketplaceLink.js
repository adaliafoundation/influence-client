import { useCallback, useState, } from 'react';

import { appConfig } from '~/appConfig';

const MarketplaceLink = ({ assetType, chain, children, id }) => {
  const [, setReferenceEl] = useState();

  const handleMarketplaceClick = useCallback(() => {
    let url;

    // Ethereum > OpenSea
    if (chain === 'ETHEREUM') {
      url = `${appConfig.get('Url.ethereumNftMarket')}/`;
      // single asset
      if (assetType === 'asteroid' && id) {
        url += `assets/${appConfig.get('Ethereum.Address.asteroidToken')}/${id}`;
      } else if(assetType === 'crewmate' && id) {
        // TODO: swap to v2 once enough crewmates have been bridged
        // Message on OpenSea also directs to other contract
        url += `assets/${appConfig.get('Ethereum.Address.crewmateToken')}/${id}`;
      // collection (NOTE: these are not used currently)
      } else if (assetType === 'asteroid') {
        url += `influenceth-asteroids`;
      } else if (assetType === 'crewmate') {
        url += `influence-crew`;
      // account
      } else if (assetType === 'account') {
        url += `${id}`;
      }

    // Starknet > Pyramid
    } else if (chain === 'STARKNET') {
      url = `${appConfig.get('Url.starknetNftMarket')}/`;
      // single asset
      if (assetType === 'asteroid' && id) {
        url += `asset/${appConfig.get('Starknet.Address.asteroidToken')}/${id}`;
      } else if(assetType === 'crewmate' && id) {
        url += `asset/${appConfig.get('Starknet.Address.crewmateToken')}/${id}`;
      // collection
      } else if (assetType === 'asteroid') {
        url += `collection/${appConfig.get('Starknet.Address.asteroidToken')}`;
      } else if (assetType === 'crewmate') {
        url += `collection/${appConfig.get('Starknet.Address.crewmateToken')}`;
      // account
      } else if (assetType === 'account') {
        url += `user/${id}`;
      }
    }

    if (url) window.open(url, '_blank');
  }, [assetType, chain, id]);

  return (
    <>
      {children(handleMarketplaceClick, setReferenceEl)}
    </>
  );
}

export default MarketplaceLink;