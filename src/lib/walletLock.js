export const supportsWalletAccountRequest = (account) => (
  typeof account?.walletProvider?.request === 'function'
);

export const isWalletAccountLocked = async (account) => {
  if (!account) return true;
  if (!supportsWalletAccountRequest(account)) return false;

  try {
    await account.walletProvider.request({
      type: 'wallet_requestAccounts',
      params: { silent_mode: false }
    });

    return false;
  } catch (e) {
    return true;
  }
};
