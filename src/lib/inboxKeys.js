import { PrivateData } from '@influenceth/sdk';

// Inbox and prospecting use the same wallet recovery message and encryption identity.
export const recoverInboxKey = (walletAccount, chainId, seed) =>
  PrivateData.deriveKey({ walletAccount, chainId, seed });
export const assertInboxKey = PrivateData.assertKey;
