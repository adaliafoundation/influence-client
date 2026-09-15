import { appConfig } from '~/appConfig';

const getIpfsGatewayUrl = () => (appConfig.get('Api.ipfs') || '').replace(/\/$/, '');

export const getIpfsUrl = (path) => {
  const gateway = getIpfsGatewayUrl();
  const cleanPath = `${path || ''}`.replace(/^\/+/, '');
  if (!gateway || !cleanPath) return undefined;

  return gateway.endsWith('/ipfs')
    ? `${gateway}/${cleanPath}`
    : `${gateway}/ipfs/${cleanPath}`;
};

export default getIpfsGatewayUrl;
