const { TextDecoder, TextEncoder } = require('util');
global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;
jest.mock('~/hooks/useStore', () => ({
  __esModule: true, default: { getState: () => ({ currentSession: {} }) }
}), { virtual: true });
const { executePaidTransaction, preparePaidTransactionFee, executeReviewedTransaction } = require('./transactionFees');

const tx = { transaction_hash: '0xabc' };
const bounds = {
  l1_gas: { max_amount: 2n, max_price_per_unit: 3n },
  l1_data_gas: { max_amount: 2n, max_price_per_unit: 4n },
  l2_gas: { max_amount: 2n, max_price_per_unit: 5n }
};
const unavailable = () => Object.assign(new Error('Paymaster not found'), { status: 404 });
let options;
beforeEach(() => {
  options = {
    account: {
      estimateInvokeFee: jest.fn().mockResolvedValue({ resourceBounds: bounds }),
      estimatePaymasterTransactionFee: jest.fn().mockResolvedValue({ suggested_max_fee_in_gas_token: 10n }),
      executePaymasterTransaction: jest.fn().mockResolvedValue(tx),
      execute: jest.fn().mockResolvedValue(tx)
    },
    getStrkBalance: jest.fn().mockResolvedValue(100n),
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

test.each([24n, 100n])('prefers STRK when it covers all resource bounds (%s)', async balance => {
  options.getStrkBalance.mockResolvedValue(balance);
  await expect(executePaidTransaction(options)).resolves.toEqual(tx);
  expect(options.account.estimateInvokeFee).toHaveBeenCalledWith(options.calls, { skipValidate: true });
  expect(options.account.execute).toHaveBeenCalledWith(options.calls, { resourceBounds: bounds });
  expect(options.account.estimatePaymasterTransactionFee).not.toHaveBeenCalled();
  expect(options.requestFeePermission).not.toHaveBeenCalled();
});

test.each(['execute', 'review'])('uses validation-inclusive gas bounds for native %s', async mode => {
  options.validateAccount = true;
  const validatedBounds = {
    ...bounds,
    l2_gas: { max_amount: 5045337n, max_price_per_unit: 5n }
  };
  options.getStrkBalance.mockResolvedValue(100000000n);
  options.account.estimateInvokeFee.mockImplementation(async (calls, { skipValidate }) => ({
    resourceBounds: skipValidate ? bounds : validatedBounds
  }));

  if (mode === 'review') {
    const fee = await preparePaidTransactionFee(options);
    expect(fee).toMatchObject({ mode: 'native', maxFee: 25226699n, resourceBounds: validatedBounds });
    expect(options.account.execute).not.toHaveBeenCalled();
    await executeReviewedTransaction({ ...options, fee });
  } else {
    await executePaidTransaction(options);
  }

  expect(options.account.estimateInvokeFee).toHaveBeenCalledTimes(1);
  expect(options.account.execute).toHaveBeenCalledWith(options.calls, { resourceBounds: validatedBounds });
});

test.each([executePaidTransaction, preparePaidTransactionFee])('stops when signing the fee estimate is rejected (%p)', async process => {
  options.validateAccount = true;
  const error = new Error('User rejected transaction');
  options.account.estimateInvokeFee.mockRejectedValue(error);
  await expect(process(options)).rejects.toBe(error);
  expect(options.account.execute).not.toHaveBeenCalled();
  expect(options.account.estimatePaymasterTransactionFee).not.toHaveBeenCalled();
  expect(options.account.executePaymasterTransaction).not.toHaveBeenCalled();
  expect(options.requestFeePermission).not.toHaveBeenCalled();
});

test.each([0n, 23n])('uses enabled USDC only when STRK is insufficient (%s)', async balance => {
  options.getStrkBalance.mockResolvedValue(balance);
  await expect(executePaidTransaction(options)).resolves.toEqual(tx);
  expect(options.account.execute).not.toHaveBeenCalled();
  expect(options.account.executePaymasterTransaction).toHaveBeenCalledWith(options.calls, {
    feeMode: { mode: 'default', gasToken: '0x2' }
  });
  expect(options.requestFeePermission).not.toHaveBeenCalled();
  expect(options.account.estimateInvokeFee).toHaveBeenCalledTimes(balance === 0n ? 0 : 1);
});

test('uses enabled SWAY before asking permission for disabled USDC', async () => {
  options.getStrkBalance.mockResolvedValue(0n);
  options.feeTokens[0].enabled = false;
  options.feeTokens[1].enabled = true;
  await executePaidTransaction(options);
  expect(options.account.executePaymasterTransaction).toHaveBeenCalledWith(options.calls, {
    feeMode: { mode: 'default', gasToken: '0x3' }
  });
  expect(options.requestFeePermission).not.toHaveBeenCalled();
});

test('tries USDC before SWAY when both are enabled', async () => {
  options.getStrkBalance.mockResolvedValue(0n);
  options.feeTokens[1].enabled = true;
  options.account.executePaymasterTransaction.mockRejectedValueOnce(new Error('Insufficient balance'));
  await expect(executePaidTransaction(options)).resolves.toEqual(tx);
  expect(options.account.executePaymasterTransaction.mock.calls.map(([, details]) => details.feeMode.gasToken)).toEqual(['0x2', '0x3']);
  expect(options.requestFeePermission).not.toHaveBeenCalled();
});

test('asks before enabling a disabled fee token', async () => {
  options.getStrkBalance.mockResolvedValue(0n);
  options.feeTokens[0].enabled = false;
  await executePaidTransaction(options);
  expect(options.requestFeePermission).toHaveBeenCalledWith('USDC');
  expect(options.enableFeeToken).toHaveBeenCalledWith('0x2');
});

test('respects declined fee-token permission', async () => {
  options.getStrkBalance.mockResolvedValue(0n);
  options.feeTokens[0].enabled = false;
  options.requestFeePermission.mockResolvedValue(false);
  await expect(executePaidTransaction(options)).rejects.toMatchObject({ suppressTransactionFailure: true });
  expect(options.account.executePaymasterTransaction).not.toHaveBeenCalled();
  expect(options.account.execute).not.toHaveBeenCalled();
});

test.each(['estimatePaymasterTransactionFee', 'executePaymasterTransaction'])('offers a STRK top-up after paymaster unavailability in %s', async method => {
  options.getStrkBalance.mockResolvedValue(0n);
  options.account[method].mockRejectedValue(unavailable());
  await expect(executePaidTransaction(options)).rejects.toMatchObject({ suppressTransactionFailure: true });
  expect(options.account[method]).toHaveBeenCalledTimes(1);
  expect(options.requestFeePermission).toHaveBeenCalledWith('TOP_UP_STRK');
  expect(options.account.execute).not.toHaveBeenCalled();
});

test('skips the unavailable paymaster and requests a STRK top-up', async () => {
  options.getStrkBalance.mockResolvedValue(0n);
  options.usePaymaster = false;
  await expect(executePaidTransaction(options)).rejects.toMatchObject({ suppressTransactionFailure: true });
  expect(options.account.estimatePaymasterTransactionFee).not.toHaveBeenCalled();
  expect(options.requestFeePermission).toHaveBeenCalledWith('TOP_UP_STRK');
});

test('offers a top-up when neither fallback token covers its estimated fee', async () => {
  options.getStrkBalance.mockResolvedValue(0n);
  options.account.estimatePaymasterTransactionFee.mockResolvedValue({ suggested_max_fee_in_gas_token: 101n });
  await expect(executePaidTransaction(options)).rejects.toMatchObject({ suppressTransactionFailure: true });
  expect(options.requestFeePermission).toHaveBeenCalledWith('TOP_UP');
  expect(options.openTopUp).toHaveBeenCalledTimes(1);
  expect(options.account.executePaymasterTransaction).not.toHaveBeenCalled();
});

test.each(['User rejected transaction', 'Timeout waiting for wallet signature', 'Network request failed', 'Execute failed', 'Contract execution reverted', 'Insufficient max fee', 'Insufficient balance'])('never resubmits a native execution failure: %s', async message => {
  const error = new Error(message);
  options.account.execute.mockRejectedValue(error);
  await expect(executePaidTransaction(options)).rejects.toBe(error);
  expect(options.account.executePaymasterTransaction).not.toHaveBeenCalled();
  expect(options.requestFeePermission).not.toHaveBeenCalled();
});

test.each(['getStrkBalance', 'estimateInvokeFee'])('does not mistake a %s failure for insufficient STRK', async method => {
  const error = new Error('Network request failed');
  (options[method] || options.account[method]).mockRejectedValue(error);
  await expect(executePaidTransaction(options)).rejects.toBe(error);
  expect(options.account.executePaymasterTransaction).not.toHaveBeenCalled();
  expect(options.requestFeePermission).not.toHaveBeenCalled();
});

test.each(['estimatePaymasterTransactionFee', 'executePaymasterTransaction'])('does not retry user rejection in %s', async method => {
  options.getStrkBalance.mockResolvedValue(0n);
  options.account[method].mockRejectedValue(new Error('User rejected transaction'));
  await expect(executePaidTransaction(options)).rejects.toThrow('User rejected');
  expect(options.requestFeePermission).not.toHaveBeenCalled();
});

test('does not resubmit an ambiguous paymaster execution failure', async () => {
  options.getStrkBalance.mockResolvedValue(0n);
  options.account.executePaymasterTransaction.mockRejectedValue(new Error('Execute failed'));
  await expect(executePaidTransaction(options)).rejects.toThrow('Execute failed');
  expect(options.account.executePaymasterTransaction).toHaveBeenCalledTimes(1);
  expect(options.account.execute).not.toHaveBeenCalled();
});

test('keeps reviewed fee bounds and checks approval immediately before submission', async () => {
  const assertCurrent = jest.fn();
  await executePaidTransaction({ ...options, resourceBounds: bounds, assertCurrent });
  expect(options.account.estimateInvokeFee).not.toHaveBeenCalled();
  expect(assertCurrent).toHaveBeenCalledTimes(1);
  expect(options.account.execute).toHaveBeenCalledWith(options.calls, { resourceBounds: bounds });
});

test('does not submit a review invalidated while checking fees', async () => {
  await expect(executePaidTransaction({
    ...options, assertCurrent: () => { throw new Error('Quote expired'); }
  })).rejects.toThrow('Quote expired');
  expect(options.account.execute).not.toHaveBeenCalled();
});


test('reviews USDC fees without executing when there is no STRK', async () => {
  options.getStrkBalance.mockResolvedValue(0n);
  const fee = await preparePaidTransactionFee(options);
  expect(fee).toMatchObject({ mode: 'default', name: 'USDC', maxFee: 10n });
  expect(options.account.executePaymasterTransaction).not.toHaveBeenCalled();
  await executeReviewedTransaction({ ...options, fee });
  expect(options.account.executePaymasterTransaction).toHaveBeenCalledWith(options.calls, fee.details, 10n);
});

test('review preserves enabled SWAY priority over disabled USDC', async () => {
  options.getStrkBalance.mockResolvedValue(0n);
  options.feeTokens[0].enabled = false;
  options.feeTokens[1].enabled = true;
  expect(await preparePaidTransactionFee(options)).toMatchObject({ name: 'SWAY' });
  expect(options.requestFeePermission).not.toHaveBeenCalled();
});

test('review asks before enabling a new fee token', async () => {
  options.getStrkBalance.mockResolvedValue(0n);
  options.feeTokens[0].enabled = false;
  expect(await preparePaidTransactionFee(options)).toMatchObject({ name: 'USDC' });
  expect(options.requestFeePermission).toHaveBeenCalledWith('USDC');
  expect(options.enableFeeToken).toHaveBeenCalledWith('0x2');
  expect(options.account.executePaymasterTransaction).not.toHaveBeenCalled();
});

test.each(['disabled', 'unsupported', 'insufficient'])('does not submit if reviewed fee token becomes %s', async reason => {
  options.getStrkBalance.mockResolvedValue(0n);
  const fee = await preparePaidTransactionFee(options);
  if (reason === 'disabled') options.feeTokens[0].enabled = false;
  if (reason === 'unsupported') options.feeTokens[0].supported = false;
  if (reason === 'insufficient') options.feeTokens[0].balance = 9n;
  await expect(executeReviewedTransaction({ ...options, fee })).rejects.toThrow(/Review the swap again/);
  expect(options.account.executePaymasterTransaction).not.toHaveBeenCalled();
});

test('reviewed payment failure never changes fee token or resubmits', async () => {
  options.getStrkBalance.mockResolvedValue(0n);
  const fee = await preparePaidTransactionFee(options);
  options.account.executePaymasterTransaction.mockRejectedValue(new Error('Insufficient balance'));
  await expect(executeReviewedTransaction({ ...options, fee })).rejects.toThrow('Insufficient balance');
  expect(options.account.executePaymasterTransaction).toHaveBeenCalledTimes(1);
});

test('expired review cannot submit through the paymaster', async () => {
  options.getStrkBalance.mockResolvedValue(0n);
  const fee = await preparePaidTransactionFee(options);
  await expect(executeReviewedTransaction({ ...options, fee, assertCurrent: () => { throw new Error('Expired'); } })).rejects.toThrow('Expired');
  expect(options.account.executePaymasterTransaction).not.toHaveBeenCalled();
});


test('includes account deployment in the reviewed user-paid fee', async () => {
  options.getStrkBalance.mockResolvedValue(0n);
  const deploymentData = { address: '0xabc' };
  const fee = await preparePaidTransactionFee({ ...options, deploymentData });
  expect(fee.details).toEqual({ feeMode: { mode: 'default', gasToken: '0x2' }, deploymentData });
  await executeReviewedTransaction({ ...options, fee });
  expect(options.account.executePaymasterTransaction).toHaveBeenCalledWith(options.calls, fee.details, 10n);
});


test.each([false, true])('SDK fee estimation signs only for raw-signing accounts (%s)', async validateAccount => {
  const { Account, WalletAccount } = require('starknet');
  const { PrivyStarknetSigner } = require('./privyWallet');
  const signRawHash = jest.fn().mockResolvedValue(`0x${'1'.padStart(64, '0')}${'2'.padStart(64, '0')}`);
  const accountOptions = {
    provider: { nodeUrl: 'https://rpc.example/rpc/v0_10' }, address: '0x123', cairoVersion: '1'
  };
  const account = validateAccount
    ? new Account({ ...accountOptions, signer: new PrivyStarknetSigner({ publicKey: '0x123', signRawHash }) })
    : new WalletAccount({ ...accountOptions, walletProvider: { on: jest.fn() } });
  const sign = jest.spyOn(account.signer, 'signTransaction');
  if (!validateAccount) sign.mockRejectedValue(new Error('Browser wallets cannot sign fee estimates'));
  jest.spyOn(account, 'getNonce').mockResolvedValue('0x0');
  jest.spyOn(account.provider, 'getChainId').mockResolvedValue('0x534e5f4d41494e');
  jest.spyOn(account.provider, 'getEstimateTip').mockResolvedValue({ recommendedTip: 0n });
  const estimate = jest.spyOn(account.provider, 'getEstimateFeeBulk').mockResolvedValue([{ resourceBounds: bounds }]);

  const fee = await preparePaidTransactionFee({ ...options, account, validateAccount });
  expect(fee).toMatchObject({ mode: 'native', resourceBounds: bounds });
  expect(sign).toHaveBeenCalledTimes(validateAccount ? 1 : 0);
  expect(signRawHash).toHaveBeenCalledTimes(validateAccount ? 1 : 0);
  if (validateAccount) {
    expect(sign).toHaveBeenCalledWith(options.calls, expect.objectContaining({ version: '0x100000000000000000000000000000003' }));
  }
  expect(estimate).toHaveBeenCalledWith(
    expect.arrayContaining([expect.objectContaining({ signature: validateAccount ? ['0x1', '0x2'] : [] })]),
    expect.objectContaining({ skipValidate: !validateAccount })
  );
});
