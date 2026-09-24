const { TextDecoder, TextEncoder } = require('util');
global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;
jest.mock('~/hooks/useStore', () => ({
  __esModule: true, default: { getState: () => ({ currentSession: {} }) }
}), { virtual: true });
const { executePaidTransaction } = require('./transactionFees');

const tx = { transaction_hash: '0xabc' };
const unavailable = () => Object.assign(new Error('Paymaster not found'), { status: 404 });
let options;
beforeEach(() => {
  options = {
    account: {
      estimatePaymasterTransactionFee: jest.fn().mockResolvedValue({ suggested_max_fee_in_gas_token: 10n }),
      executePaymasterTransaction: jest.fn().mockResolvedValue(tx),
      execute: jest.fn().mockResolvedValue(tx)
    },
    calls: [{ contractAddress: '0x1', entrypoint: 'test', calldata: [] }],
    usePaymaster: true,
    feeTokens: [
      { address: '0x2', name: 'USDC', balance: 100n, enabled: true, supported: true },
      { address: '0x3', name: 'SWAY', balance: 100n, enabled: false, supported: true }
    ],
    requestFeePermission: jest.fn().mockResolvedValue(true),
    enableFeeToken: jest.fn(),
    openTopUp: jest.fn()
  };
});

test('uses paid gasless fees when sponsorship has ended but the paymaster works', async () => {
  await expect(executePaidTransaction(options)).resolves.toEqual(tx);
  expect(options.account.executePaymasterTransaction).toHaveBeenCalledWith(options.calls, {
    feeMode: { mode: 'default', gasToken: '0x2' }
  });
  expect(options.account.execute).not.toHaveBeenCalled();
});

test('skips gasless fees when the sponsored endpoint was unavailable', async () => {
  options.usePaymaster = false;
  await expect(executePaidTransaction(options)).resolves.toEqual(tx);
  expect(options.account.estimatePaymasterTransactionFee).not.toHaveBeenCalled();
  expect(options.account.execute).toHaveBeenCalledWith(options.calls, {});
});

test.each(['estimatePaymasterTransactionFee', 'executePaymasterTransaction'])('falls back to STRK after a 404 from %s', async (method) => {
  options.account[method].mockRejectedValue(unavailable());
  await expect(executePaidTransaction(options)).resolves.toEqual(tx);
  expect(options.account[method]).toHaveBeenCalledTimes(1);
  expect(options.account.execute).toHaveBeenCalledTimes(1);
});

test('tries another permitted token after an insufficient fee balance', async () => {
  options.account.executePaymasterTransaction.mockRejectedValueOnce(new Error('Insufficient balance'));
  await expect(executePaidTransaction(options)).resolves.toEqual(tx);
  expect(options.requestFeePermission).toHaveBeenCalledWith('SWAY');
  expect(options.enableFeeToken).toHaveBeenCalledWith('0x3');
  expect(options.account.executePaymasterTransaction).toHaveBeenCalledTimes(2);
});

test('falls back to native fees after failed gasless estimates', async () => {
  options.account.estimatePaymasterTransactionFee.mockRejectedValue(new Error('Estimation failed'));
  await expect(executePaidTransaction(options)).resolves.toEqual(tx);
  expect(options.account.execute).toHaveBeenCalledTimes(1);
});

test.each([true, false])('shows a top-up prompt when all payment methods fail (paymaster available: %s)', async (available) => {
  options.account.estimatePaymasterTransactionFee.mockRejectedValue(available ? new Error('Estimation failed') : unavailable());
  options.account.execute.mockRejectedValue(new Error('Insufficient STRK balance'));
  await expect(executePaidTransaction(options)).rejects.toMatchObject({ suppressTransactionFailure: true });
  expect(options.requestFeePermission).toHaveBeenCalledWith(available ? 'TOP_UP' : 'TOP_UP_STRK');
  expect(options.openTopUp).toHaveBeenCalledTimes(available ? 1 : 0);
});

test.each(['estimatePaymasterTransactionFee', 'executePaymasterTransaction', 'execute'])('does not retry or request a top-up after rejection in %s', async (method) => {
  if (method === 'execute') options.usePaymaster = false;
  options.account[method].mockRejectedValue(new Error('User rejected transaction'));
  await expect(executePaidTransaction(options)).rejects.toThrow('User rejected');
  expect(options.requestFeePermission).not.toHaveBeenCalled();
  expect(options.account.execute).toHaveBeenCalledTimes(method === 'execute' ? 1 : 0);
});

test('does not resubmit after an ambiguous execution failure', async () => {
  options.account.executePaymasterTransaction.mockRejectedValue(new Error('Execute failed'));
  await expect(executePaidTransaction(options)).rejects.toThrow('Execute failed');
  expect(options.account.execute).not.toHaveBeenCalled();
});

test('respects declined fee-token permission', async () => {
  options.feeTokens[0].enabled = false;
  options.requestFeePermission.mockResolvedValue(false);
  await expect(executePaidTransaction(options)).rejects.toMatchObject({ suppressTransactionFailure: true });
  expect(options.account.executePaymasterTransaction).not.toHaveBeenCalled();
  expect(options.account.execute).not.toHaveBeenCalled();
});
