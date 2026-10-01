import { Address } from '@influenceth/sdk';

export const supportsWalletAccountRequest = (account) => (
  typeof account?.walletProvider?.request === 'function'
);

export const isWalletAccountLocked = async (account) => {
  if (!account) return true;
  if (!supportsWalletAccountRequest(account)) return false;

  try {
    const accounts = await account.walletProvider.request({
      type: 'wallet_requestAccounts',
      params: { silent_mode: true }
    });

    return !accounts.some(address => Address.areEqual(address, account.address));
  } catch (e) {
    return true;
  }
};
