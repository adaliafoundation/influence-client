const { TextDecoder, TextEncoder } = require('util');

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

jest.mock('~/hooks/useStore', () => ({
  __esModule: true,
  default: { getState: () => ({ currentSession: {} }) }
}), { virtual: true });

const { RpcProvider, WalletAccount, hash, outsideExecution, typedData } = require('starknet');
const { createAuthenticatedPaymasterRpc } = require('./paymaster');
const { createPrivyReadyAccount } = require('./privyWallet');

const chainId = '0x534e5f5345504f4c4941';
const calls = [{ contractAddress: '0x123', entrypoint: 'transfer', calldata: ['0x456', '0x7', '0x0'] }];
const rawSignature = `0x${'1'.padStart(64, '0')}${'2'.padStart(64, '0')}`;

function setupPaymaster({ deploy = false, paid = false, alterTypedData } = {}) {
  const provider = new RpcProvider({
    nodeUrl: 'https://rpc.example',
    chainId,
    baseFetch: jest.fn().mockResolvedValue({ json: async () => ({ result: ['0x1'] }) })
  });
  let token = 'initial-token';
  const paymaster = createAuthenticatedPaymasterRpc({
    nodeUrl: 'https://paymaster.example',
    getAuthHeaders: () => ({ Authorization: `Bearer ${token}` })
  });
  const signRawHash = jest.fn(async () => {
    token = 'refreshed-token';
    return rawSignature;
  });
  const details = createPrivyReadyAccount({
    provider, paymaster, signRawHash,
    wallet: { address: '0xabc', chainType: 'starknet', publicKey: '0x123' }
  });
  const gasToken = '0x789';
  const signedCalls = paid
    ? [...calls, { contractAddress: gasToken, entrypoint: 'transfer', calldata: ['0x999', '0xa', '0x0'] }]
    : calls;
  const message = outsideExecution.getTypedData(chainId, {
    caller: '0x999', execute_after: 1, execute_before: 2000000000
  }, '0x1', signedCalls, '2');
  if (alterTypedData) alterTypedData(message);
  const parameters = { version: '0x1', fee_mode: paid ? { mode: 'default', gas_token: gasToken } : { mode: 'sponsored' } };
  const prepared = {
    type: deploy ? 'deploy_and_invoke' : 'invoke',
    ...(deploy ? { deployment: details.deploymentData } : {}),
    typed_data: message,
    parameters,
    fee: { gas_token_price_in_strk: '1', estimated_fee_in_strk: '8',
      suggested_max_fee_in_strk: '10', estimated_fee_in_gas_token: '8', suggested_max_fee_in_gas_token: '10' }
  };
  global.fetch = jest.fn(async (_url, options) => {
    const request = JSON.parse(options.body);
    if (request.method === 'paymaster_buildTransaction') return { json: async () => ({ result: prepared }) };
    if (request.method === 'paymaster_executeTransaction') return { json: async () => ({ result: { transaction_hash: '0xabc' } }) };
    throw new Error(`Unexpected paymaster request: ${request.method}`);
  });
  return { ...details, signRawHash, message, parameters, paymasterDetails: {
    feeMode: paid ? { mode: 'default', gasToken } : { mode: 'sponsored' },
    ...(deploy ? { deploymentData: details.deploymentData } : {})
  } };
}

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

test.each([false, true])('signs and submits sponsored Privy transactions (deployment: %s)', async (deploy) => {
  const { account, signRawHash, message, parameters, deploymentData, paymasterDetails } = setupPaymaster({ deploy });

  await expect(account.executePaymasterTransaction(calls, paymasterDetails)).resolves.toEqual({ transaction_hash: '0xabc' });
  expect(signRawHash).toHaveBeenCalledWith(typedData.getMessageHash(message, account.address));
  const requests = global.fetch.mock.calls.map(([, options]) => JSON.parse(options.body));
  expect(requests[0].params.transaction.invoke.calls).toEqual([
    { to: '0x123', selector: hash.getSelectorFromName('transfer'), calldata: ['0x456', '0x7', '0x0'] }
  ]);
  expect(requests[1].params).toEqual({
    transaction: {
      type: deploy ? 'deploy_and_invoke' : 'invoke',
      ...(deploy ? { deployment: deploymentData } : {}),
      invoke: { user_address: account.address, typed_data: message, signature: ['0x1', '0x2'] }
    }, parameters
  });
  expect(global.fetch.mock.calls.map(([, options]) => options.headers.Authorization))
    .toEqual(['Bearer initial-token', 'Bearer refreshed-token']);
});

test('estimates and submits a gas-token payment within the approved fee cap', async () => {
  const { account, paymasterDetails } = setupPaymaster({ paid: true });
  const fee = await account.estimatePaymasterTransactionFee(calls, paymasterDetails);
  expect(fee.suggested_max_fee_in_gas_token).toBe(10n);
  await expect(account.executePaymasterTransaction(calls, paymasterDetails, 10n))
    .resolves.toEqual({ transaction_hash: '0xabc' });
});

test.each([
  ['wrong chain', (message) => { message.domain.chainId = '0x534e5f4d41494e'; }, /chainId/],
  ['altered call', (message) => { message.message.Calls[0].Calldata = ['0x999', '0x7', '0x0']; }, /Calldata value mismatch/]
])('rejects a paymaster response with %s before signing', async (_name, alterTypedData, error) => {
  const { account, paymasterDetails, signRawHash } = setupPaymaster({ alterTypedData });
  await expect(account.executePaymasterTransaction(calls, paymasterDetails)).rejects.toThrow(error);
  expect(signRawHash).not.toHaveBeenCalled();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('rejects a gas-token fee above the approved cap before signing', async () => {
  const { account, paymasterDetails, signRawHash } = setupPaymaster({ paid: true });
  await expect(account.executePaymasterTransaction(calls, paymasterDetails, 9n)).rejects.toThrow('Gas token price is too high');
  expect(signRawHash).not.toHaveBeenCalled();
});

test('connects an injected wallet and preserves its execute request', async () => {
  const provider = new RpcProvider({ nodeUrl: 'https://rpc.example', chainId });
  const wallet = { on: jest.fn(), request: jest.fn(async ({ type }) => {
    if (type === 'wallet_requestAccounts') return ['0xabc'];
    if (type === 'wallet_addInvokeTransaction') return { transaction_hash: '0xdef' };
    throw new Error(`Unexpected wallet request: ${type}`);
  }) };
  const account = await WalletAccount.connect(provider, wallet);
  expect(account.provider).toBe(provider);
  await expect(account.execute(calls)).resolves.toEqual({ transaction_hash: '0xdef' });
  expect(wallet.request).toHaveBeenLastCalledWith({ type: 'wallet_addInvokeTransaction', params: {
    calls: [{ contract_address: '0x123', entry_point: 'transfer', calldata: ['0x456', '0x7', '0x0'] }]
  } });
});
