const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const { createAccountDeployment } = require('./accountDeployment');

jest.mock('~/hooks/useStore', () => ({ __esModule: true, default: { getState: () => ({}) } }), { virtual: true });

jest.mock('~/lib/utils', () => ({ cleanseTxHash: tx => tx?.transaction_hash }), { virtual: true });

let ensureDeployed, options;
const missing = () => Object.assign(new Error('Contract not found'), { code: 20 });
beforeEach(() => {
  ensureDeployed = createAccountDeployment();
  options = {
    chainId: 'chain-1', address: '0x123', deploymentData: { address: '0x123' },
    account: { executePaymasterTransaction: jest.fn().mockResolvedValue({ transaction_hash: '0xabc' }) },
    provider: {
      getClassAt: jest.fn().mockRejectedValue(missing()),
      waitForTransaction: jest.fn().mockResolvedValue({ execution_status: 'SUCCEEDED' })
    },
    refreshSession: jest.fn().mockResolvedValue(), assertCurrent: jest.fn()
  };
});

test('shares standalone deployment and session upgrade across concurrent callers', async () => {
  const first = ensureDeployed(options);
  expect(ensureDeployed(options)).toBe(first);
  await expect(first).resolves.toEqual({ deployed: true, transaction: { transaction_hash: '0xabc' } });
  expect(options.account.executePaymasterTransaction).toHaveBeenCalledTimes(1);
  expect(options.account.executePaymasterTransaction).toHaveBeenCalledWith([], {
    feeMode: { mode: 'sponsored' }, deploymentData: options.deploymentData
  });
  expect(options.refreshSession).toHaveBeenCalledTimes(1);
});

test('an already deployed account only needs its session upgraded', async () => {
  options.provider.getClassAt.mockResolvedValue({});
  await ensureDeployed(options);
  expect(options.account.executePaymasterTransaction).not.toHaveBeenCalled();
  expect(options.refreshSession).toHaveBeenCalledTimes(1);
});

test('receipt timeout retries the submitted hash without redeploying', async () => {
  options.provider.waitForTransaction.mockRejectedValueOnce(new Error('Timed out'));
  await expect(ensureDeployed(options)).rejects.toThrow('Timed out');
  expect(options.refreshSession).not.toHaveBeenCalled();
  await ensureDeployed(options);
  expect(options.account.executePaymasterTransaction).toHaveBeenCalledTimes(1);
  expect(options.provider.waitForTransaction).toHaveBeenCalledTimes(2);
  expect(options.provider.waitForTransaction).toHaveBeenLastCalledWith('0xabc', { retryInterval: 5000 });
});

test('failed build requests can be retried after paymaster recovery', async () => {
  options.account.executePaymasterTransaction.mockRejectedValueOnce(new Error('Unavailable'));
  await expect(ensureDeployed(options)).rejects.toThrow('Unavailable');
  await ensureDeployed(options);
  expect(options.account.executePaymasterTransaction).toHaveBeenCalledTimes(2);
});

test('a lost execution response does not trigger another deployment', async () => {
  const error = Object.assign(new Error('Network error'), { paymasterMethod: 'paymaster_executeTransaction' });
  options.account.executePaymasterTransaction.mockRejectedValueOnce(error);
  await expect(ensureDeployed(options)).rejects.toBe(error);
  await expect(ensureDeployed(options)).rejects.toBe(error);
  expect(options.account.executePaymasterTransaction).toHaveBeenCalledTimes(1);
  options.provider.getClassAt.mockResolvedValue({});
  await expect(ensureDeployed(options)).resolves.toMatchObject({ deployed: true });
});

test.each([undefined, {}, { execution_status: 'REVERTED' }])('does not report success without a successful receipt: %j', async receipt => {
  options.provider.waitForTransaction.mockResolvedValue(receipt);
  await expect(ensureDeployed(options)).rejects.toThrow();
  expect(options.refreshSession).not.toHaveBeenCalled();
});

test('a confirmed revert allows a fresh deployment attempt', async () => {
  options.provider.waitForTransaction.mockResolvedValueOnce({ execution_status: 'REVERTED' });
  await expect(ensureDeployed(options)).rejects.toThrow('reverted');
  await ensureDeployed(options);
  expect(options.account.executePaymasterTransaction).toHaveBeenCalledTimes(2);
});

test('RPC outages do not get mistaken for an undeployed account', async () => {
  options.provider.getClassAt.mockRejectedValue(new Error('RPC unavailable'));
  await expect(ensureDeployed(options)).rejects.toThrow('RPC unavailable');
  expect(options.account.executePaymasterTransaction).not.toHaveBeenCalled();
});

test('deployment state is separate for each network and account', async () => {
  await Promise.all([
    ensureDeployed(options),
    ensureDeployed({ ...options, chainId: 'chain-2' }),
    ensureDeployed({ ...options, address: '0x456' })
  ]);
  expect(options.account.executePaymasterTransaction).toHaveBeenCalledTimes(3);
});

test('stops before session upgrade when the account changes while confirming', async () => {
  options.provider.waitForTransaction.mockImplementation(async () => {
    options.assertCurrent.mockImplementation(() => { throw new Error('Account changed'); });
    return { execution_status: 'SUCCEEDED' };
  });
  await expect(ensureDeployed(options)).rejects.toThrow('Account changed');
  expect(options.refreshSession).not.toHaveBeenCalled();
});


test.each([undefined, {}])('a missing submission hash stays uncertain until chain state confirms deployment: %j', async response => {
  options.account.executePaymasterTransaction.mockResolvedValue(response);
  await expect(ensureDeployed(options)).rejects.toThrow('no transaction hash');
  await expect(ensureDeployed(options)).rejects.toThrow('no transaction hash');
  expect(options.account.executePaymasterTransaction).toHaveBeenCalledTimes(1);
  expect(options.provider.waitForTransaction).not.toHaveBeenCalled();
});

test('session-upgrade failure does not redeploy a confirmed account', async () => {
  options.refreshSession.mockRejectedValueOnce(new Error('Session upgrade failed'));
  await expect(ensureDeployed(options)).rejects.toThrow('Session upgrade failed');
  options.provider.getClassAt.mockResolvedValue({});
  await ensureDeployed(options);
  expect(options.account.executePaymasterTransaction).toHaveBeenCalledTimes(1);
  expect(options.refreshSession).toHaveBeenCalledTimes(2);
});

const bounds = {
  l1_gas: { max_amount: 2n, max_price_per_unit: 3n },
  l1_data_gas: { max_amount: 2n, max_price_per_unit: 4n },
  l2_gas: { max_amount: 2n, max_price_per_unit: 5n }
};

const usePaidDeployment = () => {
  options.deploymentData = { class_hash: '0x1', calldata: ['0x2'], salt: '0x3' };
  options.account.executePaymasterTransaction.mockRejectedValue(new Error('No eligible starter pack purchase for paymaster sponsorship'));
  options.account.estimateAccountDeployFee = jest.fn().mockResolvedValue({ resourceBounds: bounds });
  options.account.deployAccount = jest.fn().mockResolvedValue({ transaction_hash: '0xpaid' });
  options.getStrkBalance = jest.fn().mockResolvedValue(100n);
  options.requestPaidDeployment = jest.fn().mockResolvedValue();
};

test('deploys with STRK after sponsorship rejection, then confirms and upgrades', async () => {
  usePaidDeployment();
  await expect(ensureDeployed(options)).resolves.toMatchObject({ deployed: true });
  expect(options.account.deployAccount).toHaveBeenCalledWith({
    classHash: '0x1', constructorCalldata: ['0x2'], addressSalt: '0x3', contractAddress: '0x123'
  }, { resourceBounds: bounds });
  expect(options.requestPaidDeployment).toHaveBeenCalledTimes(1);
  expect(options.provider.waitForTransaction).toHaveBeenCalledWith('0xpaid', { retryInterval: 5000 });
  expect(options.refreshSession).toHaveBeenCalledTimes(1);
});

test('requires enough STRK and consent before submitting paid deployment', async () => {
  usePaidDeployment();
  options.getStrkBalance.mockResolvedValueOnce(23n);
  await expect(ensureDeployed(options)).rejects.toThrow('Add STRK');
  expect(options.requestPaidDeployment).not.toHaveBeenCalled();
  options.requestPaidDeployment.mockRejectedValueOnce(new Error('Cancelled'));
  await expect(ensureDeployed(options)).rejects.toThrow('Cancelled');
  expect(options.account.deployAccount).not.toHaveBeenCalled();
});

test('an ambiguous native deployment failure cannot submit a second deployment', async () => {
  usePaidDeployment();
  options.account.deployAccount.mockRejectedValue(new Error('Network disconnected'));
  await expect(ensureDeployed(options)).rejects.toThrow('Network disconnected');
  await expect(ensureDeployed(options)).rejects.toThrow('Network disconnected');
  expect(options.account.deployAccount).toHaveBeenCalledTimes(1);
});

test('ineligible accounts deploy with STRK without contacting the sponsorship proxy', async () => {
  usePaidDeployment();
  options.allowSponsorship = false;
  await expect(ensureDeployed(options)).resolves.toMatchObject({ deployed: true });
  expect(options.account.executePaymasterTransaction).not.toHaveBeenCalled();
  expect(options.account.deployAccount).toHaveBeenCalledTimes(1);
});
