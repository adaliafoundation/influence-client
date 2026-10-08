import { appConfig } from '~/appConfig';
import { flushSync } from 'react-dom';
import React, { useContext } from 'react';
import { act, render } from '@testing-library/react';
import ChainTransactionContext, { ChainTransactionProvider } from './ChainTransactionContext';
import useSession from '~/hooks/useSession';
import useStore from '~/hooks/useStore';
import { executePaidTransaction } from '~/lib/transactionFees';
import { isWalletAccountLocked } from '~/lib/walletLock';

jest.mock('@influenceth/sdk', () => ({
  Address: { areEqual: (a, b) => a === b }, Entity: { IDS: {} },
  System: { Systems: { ChangeName: {} }, getRunSystemCall: () => ({ contractAddress: '0x1', entrypoint: 'run_system', calldata: [] }) }
}));
jest.mock('starknet', () => ({ num: { toHex: value => value } }));
jest.mock('@avnu/avnu-sdk', () => ({}));
jest.mock('@tanstack/react-query', () => {
  const client = { invalidateQueries: jest.fn() };
  return { useQueryClient: () => client };
});
jest.mock('~/appConfig', () => ({ appConfig: { get: jest.fn() } }), { virtual: true });
jest.mock('~/components/TransactionFeePrompt', () => () => null, { virtual: true });
jest.mock('~/hooks/useSession', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useStore', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useSimulationEnabled', () => () => false, { virtual: true });
jest.mock('~/hooks/useActivitiesContext', () => {
  const activities = [];
  return () => activities;
}, { virtual: true });
jest.mock('~/hooks/useCrewContext', () => {
  const crew = { crew: {}, recheckAuthorization: jest.fn() };
  return () => crew;
}, { virtual: true });
jest.mock('~/hooks/useSwapQuote', () => ({ useUsdcPerEth: () => ({ data: 1 }) }), { virtual: true });
jest.mock('~/hooks/useWalletPurchasableBalances', () => () => ({ data: {} }), { virtual: true });
jest.mock('~/hooks/useWalletTokenBalance', () => ({ useSwayBalance: () => ({ data: 0n }), useUSDCBalance: () => ({ data: 0n }) }), { virtual: true });
jest.mock('~/lib/api', () => ({}), { virtual: true });
jest.mock('~/lib/transactionFees', () => ({ executePaidTransaction: jest.fn() }), { virtual: true });
jest.mock('~/lib/escrow', () => ({}), { virtual: true });
jest.mock('~/lib/paymaster', () => ({ isPaymasterUnavailable: () => false, isSponsorshipUnavailable: () => false }), { virtual: true });
jest.mock('~/lib/deliveryAuthorization', () => ({}), { virtual: true });
jest.mock('~/lib/missionBindings', () => ({}), { virtual: true });
jest.mock('~/lib/transactionAuthorization', () => ({ recheckTransactionAuthorization: async () => ({ status: 'allowed' }) }), { virtual: true });
jest.mock('~/lib/starterMissions', () => ({ STARTER_MISSION_SYSTEMS: new Set(), STARTER_MISSION_ACTIONS: new Set() }), { virtual: true });
jest.mock('~/lib/utils', () => ({ safeBigInt: BigInt, cleanseTxHash: tx => tx.transaction_hash }), { virtual: true });
jest.mock('~/lib/priceUtils', () => ({ TOKEN: { USDC: '0x1', SWAY: '0x2' } }), { virtual: true });
jest.mock('~/lib/wallets', () => ({ getWalletLabel: () => 'Ready' }), { virtual: true });
jest.mock('~/lib/walletLock', () => ({ isWalletAccountLocked: jest.fn() }), { virtual: true });

let session, state, chain;
const Probe = () => { chain = useContext(ChainTransactionContext); return null; };
const tree = () => <ChainTransactionProvider><Probe /></ChainTransactionProvider>;
const account = { address: '0x123' };
beforeEach(() => {
  jest.clearAllMocks();
  appConfig.get.mockReset();
  session = {
    accountAddress: '0x123', authenticated: true, walletReadyForTransactions: true, walletCapabilities: {}, walletId: 'argentX',
    login: jest.fn().mockResolvedValue(),
    refreshWalletConnection: jest.fn().mockResolvedValue(false),
    getTransactionAccount: jest.fn(async account => account)
  };
  state = { gameplay: {}, pendingTransactions: [], dispatchAlertLogged: jest.fn(), dispatchPendingTransaction: jest.fn(), dispatchFailedTransaction: jest.fn() };
  useSession.mockImplementation(() => session);
  useStore.mockImplementation(selector => selector(state));
  executePaidTransaction.mockResolvedValue({ transaction_hash: '0xabc' });
  isWalletAccountLocked.mockResolvedValue(false);
});

test.each(['system', 'direct', 'deployment'])('asks the user to connect before %s actions', async (action) => {
  render(tree());
  await act(async () => {
    if (action === 'system') await chain.execute('ChangeName', {});
    if (action === 'direct') await chain.executeCalls([{ contractAddress: '0x1', entrypoint: 'transfer', calldata: [] }]);
    if (action === 'deployment') await expect(chain.deployAccount()).rejects.toThrow('Please try again after connecting');
  });
  expect(state.dispatchAlertLogged).toHaveBeenCalledWith({
    type: 'WalletConnectionRequired',
    data: { walletName: 'Ready', address: '0x123' },
    level: 'warning',
  });
  expect(session.login).not.toHaveBeenCalled();
  expect(executePaidTransaction).not.toHaveBeenCalled();
  expect(chain.promptingTransaction).toBe(false);
});

test('shows the account message when a connected wallet becomes locked', async () => {
  session.walletAccount = account;
  isWalletAccountLocked.mockResolvedValue(true);
  render(tree());
  await act(async () => { await chain.execute('ChangeName', {}); });
  expect(state.dispatchAlertLogged).toHaveBeenCalledWith(expect.objectContaining({
    data: { walletName: 'Ready', address: '0x123' },
  }));
  expect(session.login).not.toHaveBeenCalled();
  expect(executePaidTransaction).not.toHaveBeenCalled();
  expect(chain.promptingTransaction).toBe(false);
});

test.each([false, true])('returns a wallet connection failure without adding history and allows retry (connected: %s)', async (connected) => {
  session.walletAccount = connected ? account : undefined;
  isWalletAccountLocked.mockResolvedValue(true);
  const { rerender } = render(tree());
  const vars = { name: 'New name' };
  const meta = { asteroidId: 1 };
  let result;
  await act(async () => { result = await chain.execute('ChangeName', vars, meta); });
  expect(result).toEqual({ status: 'failed' });
  expect(state.dispatchFailedTransaction).not.toHaveBeenCalled();
  expect(state.dispatchAlertLogged).toHaveBeenCalledTimes(1);
  expect(state.dispatchPendingTransaction).not.toHaveBeenCalled();
  expect(chain.promptingTransaction).toBe(false);

  session = { ...session, walletAccount: account };
  isWalletAccountLocked.mockResolvedValue(false);
  rerender(tree());
  await act(async () => { result = await chain.execute('ChangeName', vars, meta); });
  expect(result).toEqual({ status: 'submitted', txHash: '0xabc' });
  expect(executePaidTransaction).toHaveBeenCalledTimes(1);
});

test.each(['system', 'direct'])('silently restores the wallet and retries the %s action with fresh state', async (kind) => {
  session.isDeployed = true;
  session.provider = { getNonceForAddress: jest.fn().mockResolvedValue(1) };
  const { rerender } = render(tree());
  session.refreshWalletConnection.mockImplementation(async () => {
    session = { ...session, walletAccount: account };
    flushSync(() => rerender(tree()));
    return true;
  });
  let result;
  await act(async () => {
    result = kind === 'system'
      ? await chain.execute('ChangeName', {})
      : await chain.executeCalls([{ contractAddress: '0x1', entrypoint: 'transfer', calldata: [] }]);
  });
  expect(result).toEqual(kind === 'system'
    ? { status: 'submitted', txHash: '0xabc' }
    : { transaction_hash: '0xabc' });
  expect(session.refreshWalletConnection).toHaveBeenCalledTimes(1);
  expect(session.login).not.toHaveBeenCalled();
  expect(state.dispatchAlertLogged).not.toHaveBeenCalled();
  expect(state.dispatchFailedTransaction).not.toHaveBeenCalled();
  expect(executePaidTransaction).toHaveBeenCalledTimes(1);
});

test('uses the normal unlock check for an already connected wallet', async () => {
  session.walletAccount = account;
  render(tree());
  await act(async () => { await chain.execute('ChangeName', {}); });
  expect(session.login).not.toHaveBeenCalled();
  expect(isWalletAccountLocked).toHaveBeenCalledWith(account);
  expect(executePaidTransaction).toHaveBeenCalledTimes(1);
});

test('requires a fresh action after the wallet finishes connecting', async () => {
  session.walletAccount = account;
  session.walletReadyForTransactions = false;
  const { rerender } = render(tree());
  await act(async () => { await chain.execute('ChangeName', {}); });
  expect(executePaidTransaction).not.toHaveBeenCalled();
  expect(chain.promptingTransaction).toBe(false);

  session = { ...session, walletReadyForTransactions: true };
  rerender(tree());
  expect(executePaidTransaction).not.toHaveBeenCalled();
  await act(async () => { await chain.execute('ChangeName', {}); });
  expect(executePaidTransaction).toHaveBeenCalledTimes(1);
});

test('does not open a wallet for an empty direct call', async () => {
  render(tree());
  await act(async () => { await chain.executeCalls([]); });
  expect(session.login).not.toHaveBeenCalled();
  expect(chain.promptingTransaction).toBe(false);
});

test('rejects a wallet response without a transaction hash', async () => {
  session.walletAccount = account;
  executePaidTransaction.mockResolvedValue({});
  render(tree());
  await act(async () => { await chain.execute('ChangeName', {}); });
  expect(state.dispatchPendingTransaction).not.toHaveBeenCalled();
  expect(state.dispatchFailedTransaction).toHaveBeenCalled();
  expect(chain.promptingTransaction).toBe(false);
});

test('clears prompting when unlocking unexpectedly throws', async () => {
  session.walletAccount = account;
  isWalletAccountLocked.mockRejectedValue(new Error('Wallet disconnected'));
  render(tree());
  await act(async () => { await chain.execute('ChangeName', {}); });
  expect(chain.promptingTransaction).toBe(false);
  expect(executePaidTransaction).not.toHaveBeenCalled();
});

test('does not restart a successful receipt waiter while waiting for indexing', async () => {
  session.walletAccount = account;
  session.isDeployed = true;
  session.provider = { getNonceForAddress: jest.fn().mockResolvedValue(0), waitForTransaction: jest.fn().mockResolvedValue({ execution_status: 'SUCCEEDED' }) };
  state.pendingTransactions = [{ key: 'ChangeName', vars: {}, txHash: '0xabc', timestamp: Date.now() }];
  const { rerender } = render(tree());
  await act(async () => {});
  session = { ...session, walletAccount: { ...account } };
  rerender(tree());
  await act(async () => {});
  expect(session.provider.waitForTransaction).toHaveBeenCalledTimes(1);
});

test('limits receipt recovery across fast blocks and does not overlap slow RPC calls', async () => {
  let finish;
  session.walletAccount = account;
  session.isDeployed = true;
  session.blockNumber = 1;
  session.provider = {
    getNonceForAddress: jest.fn().mockResolvedValue(0),
    waitForTransaction: jest.fn(() => new Promise(() => {})),
    getTransactionReceipt: jest.fn(() => new Promise(resolve => { finish = resolve; }))
  };
  state.pendingTransactions = [{ key: 'ChangeName', vars: {}, txHash: '0xabc', timestamp: Date.now() - 60000 }];
  const { rerender } = render(tree());
  expect(session.provider.getTransactionReceipt).toHaveBeenCalledTimes(1);
  session = { ...session, blockNumber: 2 };
  rerender(tree());
  expect(session.provider.getTransactionReceipt).toHaveBeenCalledTimes(1);
  await act(async () => { finish({ execution_status: 'SUCCEEDED' }); });
  session = { ...session, blockNumber: 3 };
  rerender(tree());
  expect(session.provider.getTransactionReceipt).toHaveBeenCalledTimes(1);
});

test('reports a wallet acknowledgement timeout as unknown without recording a failed transaction or retrying', async () => {
  session.walletAccount = account;
  const error = new Error('An error occurred (UNKNOWN_ERROR)');
  error.name = 'WalletRPCError';
  error.cause = new Error('Timeout');
  executePaidTransaction.mockRejectedValue(error);
  render(tree());
  let result;
  await act(async () => { result = await chain.execute('ChangeName', {}); });
  expect(result).toEqual({ status: 'unknown' });
  expect(state.dispatchFailedTransaction).not.toHaveBeenCalled();
  expect(state.dispatchPendingTransaction).not.toHaveBeenCalled();
  expect(executePaidTransaction).toHaveBeenCalledTimes(1);
  expect(state.dispatchAlertLogged).toHaveBeenCalledWith(expect.objectContaining({
    duration: 0,
    data: expect.objectContaining({ content: expect.stringContaining('Open your wallet to check it') }),
  }));
  expect(chain.promptingTransaction).toBe(false);
});


describe('automatic sponsored account deployment', () => {
  const calls = [{ contractAddress: '0x1', entrypoint: 'transfer', calldata: [] }];
  beforeEach(() => {
    appConfig.get.mockImplementation(key => key === 'Starknet.paymasterProxy' ? 'https://paymaster.example' : undefined);
    session.chainId = 'chain-1';
    session.isDeployed = false;
    session.walletCapabilities = { requiresSponsoredTransactions: true };
    session.accountDeploymentData = { address: '0x123' };
    session.walletAccount = { ...account, executePaymasterTransaction: jest.fn()
      .mockResolvedValueOnce({ transaction_hash: '0xdeploy' })
      .mockResolvedValue({ transaction_hash: '0xinvoke' }) };
    session.provider = {
      getClassAt: jest.fn().mockRejectedValue(new Error('Contract not found')),
      waitForTransaction: jest.fn().mockResolvedValue({ execution_status: 'SUCCEEDED' })
    };
    session.upgradeInsecureSession = jest.fn().mockResolvedValue(true);
  });

  test('deploys and upgrades before gameplay without a checkout or provisioning dependency', async () => {
    render(tree());
    await act(async () => { await chain.executeCalls(calls); });
    const execute = session.walletAccount.executePaymasterTransaction;
    expect(execute.mock.calls).toEqual([
      [[], { feeMode: { mode: 'sponsored' }, deploymentData: session.accountDeploymentData }],
      [calls, { feeMode: { mode: 'sponsored' } }]
    ]);
    expect(session.upgradeInsecureSession.mock.invocationCallOrder[0]).toBeLessThan(execute.mock.invocationCallOrder[1]);
    expect(executePaidTransaction).not.toHaveBeenCalled();
  });

  test('checkout and gameplay share an in-flight deployment', async () => {
    let confirm, notifyWaiting;
    const waiting = new Promise(resolve => { notifyWaiting = resolve; });
    session.provider.waitForTransaction.mockImplementationOnce(() => new Promise(resolve => {
      confirm = resolve;
      notifyWaiting();
    }));
    render(tree());
    await act(async () => {
      const checkout = chain.deployAccount();
      const gameplay = chain.executeCalls(calls);
      await waiting;
      confirm({ execution_status: 'SUCCEEDED' });
      await Promise.all([checkout, gameplay]);
    });
    expect(session.walletAccount.executePaymasterTransaction.mock.calls.filter(([submitted]) => submitted.length === 0)).toHaveLength(1);
  });

  test('deployment failure stops gameplay and permits retry', async () => {
    session.walletAccount.executePaymasterTransaction.mockReset()
      .mockRejectedValueOnce(new Error('Sponsorship unavailable'))
      .mockResolvedValue({ transaction_hash: '0xretry' });
    render(tree());
    await act(async () => { await expect(chain.executeCalls(calls)).rejects.toThrow('Sponsorship unavailable'); });
    expect(executePaidTransaction).not.toHaveBeenCalled();
    await act(async () => { await chain.executeCalls(calls); });
    expect(session.walletAccount.executePaymasterTransaction.mock.calls.map(([submitted]) => submitted)).toEqual([[], [], calls]);
  });

  test('does not continue gameplay when the session upgrade fails', async () => {
    session.upgradeInsecureSession.mockResolvedValue(false);
    render(tree());
    await act(async () => { await expect(chain.executeCalls(calls)).rejects.toThrow('Unable to upgrade account session'); });
    expect(session.walletAccount.executePaymasterTransaction).toHaveBeenCalledTimes(1);
    expect(executePaidTransaction).not.toHaveBeenCalled();
  });

  test('respects an explicit paymaster opt-out', async () => {
    render(tree());
    await act(async () => { await chain.executeCalls(calls, { usePaymaster: false }); });
    expect(session.walletAccount.executePaymasterTransaction).not.toHaveBeenCalled();
    expect(executePaidTransaction).toHaveBeenCalledWith(expect.objectContaining({ usePaymaster: false }));
  });

  test('an already deployed account goes straight to sponsored gameplay', async () => {
    session.isDeployed = true;
    session.provider.getNonceForAddress = jest.fn().mockResolvedValue(1);
    render(tree());
    await act(async () => { await chain.executeCalls(calls); });
    expect(session.walletAccount.executePaymasterTransaction).toHaveBeenCalledWith(calls, { feeMode: { mode: 'sponsored' } });
    expect(session.provider.getClassAt).not.toHaveBeenCalled();
  });
});
