const { isWalletAccountLocked, supportsWalletAccountRequest } = require('./walletLock');

test('treats a missing account as unavailable', async () => {
  await expect(isWalletAccountLocked()).resolves.toBe(true);
});

test('allows signer-only accounts without injected wallet lock probing', async () => {
  await expect(isWalletAccountLocked({ execute: jest.fn() })).resolves.toBe(false);
  expect(supportsWalletAccountRequest({ execute: jest.fn() })).toBe(false);
});

test('unlocks injected wallet accounts through wallet_requestAccounts', async () => {
  const request = jest.fn().mockResolvedValue(['0x1']);
  const account = { walletProvider: { request } };

  await expect(isWalletAccountLocked(account)).resolves.toBe(false);
  expect(request).toHaveBeenCalledWith({
    type: 'wallet_requestAccounts',
    params: { silent_mode: false }
  });
});

test('treats rejected injected wallet account requests as unavailable', async () => {
  const account = {
    walletProvider: {
      request: jest.fn().mockRejectedValue(new Error('User rejected request'))
    }
  };

  await expect(isWalletAccountLocked(account)).resolves.toBe(true);
});
