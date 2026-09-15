import { appConfig } from './index';

export const features = Object.freeze({
  privy: !!appConfig.get('Privy.appId'),
  stripe: !!appConfig.get('Api.ClientId.stripe'),
  banxa: !!appConfig.get('Api.banxa'),
  layerswap: !!appConfig.get('Api.ClientId.layerswap'),
  tutorials: !!appConfig.get('Api.ClientId.google')
});
