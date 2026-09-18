const { TextDecoder, TextEncoder } = require('util');
global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;
Object.defineProperty(global, 'crypto', { value: require('crypto').webcrypto, configurable: true });

jest.mock('~/appConfig', () => ({ appConfig: { get: (key) => ({
  'Starknet.Address.dispatcher': '0x123',
  'Starknet.Address.swayToken': '0x456',
  'Starknet.Address.escrow': '0x789'
})[key] } }), { virtual: true });

const { RpcProvider, hash, outsideExecution, shortString } = require('starknet');
const { createWalletSession, isReadySessionValid, supportsReadySessions } = require('./walletSessions');
const { allowedMethods, areSessionCallsAllowed, buildGameplaySessionPolicies } = require('./walletPolicies');
const { WALLET_IDS } = require('./walletIds');
const chainId = '0x534e5f5345504f4c4941';
const calls = [{ contractAddress: '0x123', entrypoint: 'run_system', calldata: ['0x1'] }];
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

function setup({ walletId = WALLET_IDS.ARGENT_X, storedSession, enabled = true } = {}) {
  const provider = new RpcProvider({ nodeUrl: 'https://rpc.example', chainId });
  provider.callContract = jest.fn(async ({ entrypoint }) => entrypoint === 'getVersion'
    ? [shortString.encodeShortString('0.5.0')] : ['0x1234']);
  const account = { address: '0xabc', provider, signMessage: jest.fn(async () => ['0x55']), execute: jest.fn() };
  const wallet = { request: jest.fn(async () => ['0x1', '0x2']),
    updateSession: jest.fn(async () => true), openExecute: jest.fn(async () => ({ status: true, transactionHash: '0xfee' })) };
  let useSessions = enabled;
  let active = true;
  const onChange = jest.fn();
  const session = createWalletSession({ walletId, wallet, account, provider, chainId, storedSession,
    serviceUrl: 'https://sessions.example/v1', strkToken: '0x999', onChange,
    isEnabled: () => active && useSessions !== false, isActive: () => active, approvedOnConnect: enabled !== false });
  return { session, wallet, account, provider, onChange,
    disconnect: () => { active = false; }, setEnabled: (value) => { useSessions = value; } };
}

function mockCosigner() {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ signature: { publicKey: '0x1234', r: '1', s: '2' } }) }));
}

test('Cartridge and Ready policies have exactly the same four methods', () => {
  const cartridge = buildGameplaySessionPolicies();
  expect(Object.entries(cartridge.contracts).flatMap(([address, { methods }]) => methods.map(({ entrypoint }) => ({
    'Contract Address': address, selector: entrypoint
  })))).toEqual(allowedMethods);
  expect(allowedMethods.map(({ selector }) => selector)).toEqual(['run_system', 'transfer_with_confirmation', 'withdraw', 'deposit']);
  expect(areSessionCallsAllowed([...calls, { contractAddress: '0x456', entrypoint: 'transfer' }])).toBe(false);
  expect(areSessionCallsAllowed([{ ...calls[0], contractAddress: '0x0123', entrypoint: hash.getSelectorFromName('run_system') }])).toBe(true);
  expect(areSessionCallsAllowed([])).toBe(false);
});

test('requires a supported deployed Ready account with a guardian', async () => {
  const { provider } = setup();
  expect(await supportsReadySessions(provider, '0xabc')).toBe(true);
  provider.callContract.mockImplementation(async ({ entrypoint }) => entrypoint === 'getVersion' ? [shortString.encodeShortString('0.3.0')] : ['0x1']);
  expect(await supportsReadySessions(provider, '0xabc')).toBe(false);
  provider.callContract.mockImplementation(async ({ entrypoint }) => entrypoint === 'getVersion' ? [shortString.encodeShortString('0.5.0')] : ['0x0']);
  expect(await supportsReadySessions(provider, '0xabc')).toBe(false);
  provider.callContract.mockRejectedValue(new Error('Contract not found'));
  expect(await supportsReadySessions(provider, '0xabc')).toBe(false);
  provider.callContract.mockRejectedValue(new Error('RPC unavailable'));
  await expect(supportsReadySessions(provider, '0xabc')).rejects.toThrow('RPC unavailable');
});

test('creates, serializes and restores a Ready session without another prompt', async () => {
  const first = setup();
  expect(first.session.ready).toBe(false);
  await Promise.all([first.session.prepare(), first.session.prepare()]);
  expect(first.wallet.request).toHaveBeenCalledTimes(1);
  expect(first.wallet.request.mock.calls[0][0].params.message['Allowed Methods']).toEqual(allowedMethods);
  const saved = JSON.parse(JSON.stringify(first.onChange.mock.calls[0][0]));
  const restored = setup({ storedSession: saved });
  expect(restored.session.ready).toBe(true);
  await restored.session.prepare();
  expect(restored.wallet.request).not.toHaveBeenCalled();
  expect(isReadySessionValid(saved, '0xdef', chainId)).toBe(false);
  expect(isReadySessionValid(saved, '0xabc', '0x534e5f4d41494e')).toBe(false);
  expect(isReadySessionValid({ ...saved, expiresAt: 1 }, '0xabc', chainId)).toBe(false);
  expect(isReadySessionValid({ ...saved, allowedMethods: [...allowedMethods, { 'Contract Address': '0x456', selector: 'transfer' }] }, '0xabc', chainId)).toBe(false);
});

test('Never, explicit signatures and mixed multicalls use normal wallet authorization', async () => {
  const { session, account, wallet, setEnabled } = setup({ enabled: false });
  expect(await session.getAccount(calls)).toBe(account);
  setEnabled(true);
  expect(await session.getAccount(calls, { requireExplicitSignature: true })).toBe(account);
  expect(await session.getAccount([...calls, { contractAddress: '0x456', entrypoint: 'transfer' }])).toBe(account);
  expect(wallet.request).not.toHaveBeenCalled();
});

test('cancellation does not persist a session and can be retried deliberately', async () => {
  const { session, wallet, onChange } = setup();
  wallet.request.mockRejectedValueOnce(new Error('User rejected request'));
  await expect(session.prepare()).rejects.toThrow('User rejected');
  expect(onChange).not.toHaveBeenCalled();
  expect(session.ready).toBe(false);
  await session.prepare();
  expect(session.ready).toBe(true);
});

test('renewal preserves the gameplay policy and rechecks settings after approval', async () => {
  const { session, wallet, account, setEnabled } = setup();
  await session.prepare();
  session.session.expiresAt = 1;
  wallet.request.mockImplementation(async () => { setEnabled(false); return ['0x1', '0x2']; });
  expect(await session.getAccount(calls)).toBe(account);
  expect(wallet.request).toHaveBeenCalledTimes(2);
});

test('the real SDK signs a Starknet 10 V3 transaction using the cosigner', async () => {
  mockCosigner();
  const { session, setEnabled } = setup();
  const account = await session.getAccount(calls);
  const bounds = { max_amount: 1n, max_price_per_unit: 1n };
  const details = { walletAddress: '0xabc', chainId, cairoVersion: '1', nonce: 0,
    version: '0x3', resourceBounds: { l1_gas: bounds, l1_data_gas: bounds, l2_gas: bounds },
    tip: 0n, paymasterData: [], accountDeploymentData: [], nonceDataAvailabilityMode: 'L1', feeDataAvailabilityMode: 'L1' };
  const signature = await account.signer.signTransaction(calls, details);
  expect(signature[0]).toBe(shortString.encodeShortString('session-token'));
  expect(global.fetch.mock.calls[0][0]).toBe('https://sessions.example/v1/cosigner/signSession');
  const hashedCalls = calls.map((call) => ({ ...call, entrypoint: hash.getSelectorFromName(call.entrypoint) }));
  expect(await account.signer.signTransaction(hashedCalls, details)).toEqual(signature);
  setEnabled(false);
  await expect(account.signer.signTransaction(calls, details)).rejects.toThrow('not authorized');
});

test('signs allowed outside executions but asks the wallet for paymaster fee transfers', async () => {
  mockCosigner();
  const { session, account: walletAccount } = setup();
  const account = await session.getAccount(calls);
  const message = outsideExecution.getTypedData(chainId, { caller: '0x777', execute_after: 1, execute_before: 2000000000 }, '0x1', calls, '2');
  const signature = await account.signMessage(message);
  expect(signature[0]).toBe(shortString.encodeShortString('session-token'));
  expect(global.fetch.mock.calls[0][0]).toBe('https://sessions.example/v1/cosigner/signSessionEFO');
  const paid = outsideExecution.getTypedData(chainId, { caller: '0x777', execute_after: 1, execute_before: 2000000000 }, '0x1', [...calls,
    { contractAddress: '0x999', entrypoint: 'transfer', calldata: ['0x777', '0xa', '0x0'] }], '2');
  await account.signMessage(paid);
  expect(walletAccount.signMessage).toHaveBeenCalledWith(paid);
});

test('Cartridge respects Never even with an existing session and forces explicit purchases', async () => {
  const { session, wallet, account, setEnabled } = setup({ walletId: WALLET_IDS.CONTROLLER });
  const active = await session.getAccount(calls);
  await active.execute(calls);
  expect(account.execute).toHaveBeenCalledTimes(1);
  setEnabled(false);
  expect(await active.execute(calls)).toEqual({ transaction_hash: '0xfee' });
  expect(wallet.openExecute).toHaveBeenCalledWith(calls);
  expect(wallet.updateSession).not.toHaveBeenCalled();
  setEnabled(true);
  const explicit = await session.getAccount(calls, { requireExplicitSignature: true });
  await explicit.execute(calls);
  expect(wallet.openExecute).toHaveBeenCalledTimes(2);
});

test.each([null, undefined, true])('enables available Ready sessions for setting %s', async (setting) => {
  const { session, wallet, account, setEnabled } = setup();
  setEnabled(setting);
  expect(await session.getAccount(calls)).not.toBe(account);
  expect(wallet.request).toHaveBeenCalledTimes(1);
});

test('does not request or use Ready sessions without the configured cosigner', async () => {
  const { session, wallet, account } = setup();
  session.serviceUrl = '';
  expect(await session.supported()).toBe(false);
  expect(await session.getAccount(calls)).toBe(account);
  expect(wallet.request).not.toHaveBeenCalled();
});

test('does not retain an approval completed after the wallet disconnects', async () => {
  const { session, wallet, onChange, disconnect } = setup();
  wallet.request.mockImplementation(async () => { disconnect(); return ['0x1', '0x2']; });
  expect(await session.prepare()).toBe(false);
  expect(session.ready).toBe(false);
  expect(onChange).not.toHaveBeenCalled();
});

test('discards a revoked session without resubmitting the transaction', async () => {
  const { session, onChange, wallet } = setup();
  const account = await session.getAccount(calls);
  account.prepareInvoke = jest.fn().mockRejectedValue(new Error('session/revoked'));
  await expect(account.execute(calls)).rejects.toThrow('session/revoked');
  expect(account.prepareInvoke).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenLastCalledWith(null);
  expect(session.ready).toBe(false);
  await session.getAccount(calls);
  expect(wallet.request).toHaveBeenCalledTimes(2);
});

test('never prompts or signs through an old account after switching wallets', async () => {
  const { session, disconnect, account: walletAccount } = setup();
  const account = await session.getAccount(calls);
  disconnect();
  await expect(account.execute(calls)).rejects.toThrow('disconnected');
  await expect(account.signMessage({ primaryType: 'Login' })).rejects.toThrow('disconnected');
  expect(walletAccount.signMessage).not.toHaveBeenCalled();
});

test('rejects a signature returned after sessions are disabled', async () => {
  const { session, setEnabled } = setup();
  const account = await session.getAccount(calls);
  global.fetch = jest.fn(async () => {
    setEnabled(false);
    return { ok: true, json: async () => ({ signature: { publicKey: '0x1234', r: '1', s: '2' } }) };
  });
  const message = outsideExecution.getTypedData(chainId, { caller: '0x777', execute_after: 1, execute_before: 2000000000 }, '0x1', calls, '2');
  await expect(account.signMessage(message)).rejects.toThrow('not authorized');
});

test('discards malformed or duplicate persisted policies', async () => {
  const { session } = setup();
  await session.prepare();
  expect(isReadySessionValid({ ...session.session, address: 'bad address' }, '0xabc', chainId)).toBe(false);
  expect(isReadySessionValid({ ...session.session, allowedMethods: allowedMethods.map(() => allowedMethods[0]) }, '0xabc', chainId)).toBe(false);
});
