jest.mock('@influenceth/sdk', () => ({ Address: { areEqual: (a, b) => BigInt(a) === BigInt(b) } }));

const { isWalletAccountLocked, supportsWalletAccountRequest } = require('./walletLock');

test('treats a missing account as unavailable', async () => {
  await expect(isWalletAccountLocked()).resolves.toBe(true);
});

test('allows signer-only accounts without injected wallet lock probing', async () => {
  await expect(isWalletAccountLocked({ execute: jest.fn() })).resolves.toBe(false);
  expect(supportsWalletAccountRequest({ execute: jest.fn() })).toBe(false);
});

test('checks injected wallet accounts without prompting', async () => {
  const request = jest.fn().mockResolvedValue(['0x1']);
  const account = { address: '0x1', walletProvider: { request } };

  await expect(isWalletAccountLocked(account)).resolves.toBe(false);
  expect(request).toHaveBeenCalledWith({
    type: 'wallet_requestAccounts',
    params: { silent_mode: true }
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

test('treats an empty account response as disconnected', async () => {
  const account = { address: '0x1', walletProvider: { request: jest.fn().mockResolvedValue([]) } };
  await expect(isWalletAccountLocked(account)).resolves.toBe(true);
});

test('does not use a different account selected in the extension', async () => {
  const account = { address: '0x1', walletProvider: { request: jest.fn().mockResolvedValue(['0x2']) } };
  await expect(isWalletAccountLocked(account)).resolves.toBe(true);
});

test('recognizes the same account after the wallet is unlocked', async () => {
  const request = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(['0x1']);
  const account = { address: '0x1', walletProvider: { request } };
  await expect(isWalletAccountLocked(account)).resolves.toBe(true);
  await expect(isWalletAccountLocked(account)).resolves.toBe(false);
});
