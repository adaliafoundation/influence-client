import { Prospecting } from '@influenceth/sdk';
import { resolveChainId } from '~/lib/utils';

export function campaignIdentity({ chainId, dispatcher, owner, asteroidId, originIndex, resource }) {
  if (!chainId || !owner) return null;
  return Prospecting.getIdentity({
    chainId: resolveChainId(chainId, 'hex'), game: dispatcher,
    owner, asteroidId, originIndex, resource
  });
}
