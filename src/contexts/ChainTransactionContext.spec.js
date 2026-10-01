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
jest.mock('~/appConfig', () => ({ appConfig: { get: () => undefined } }), { virtual: true });
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
jest.mock('~/lib/paymaster', () => ({}), { virtual: true });
jest.mock('~/lib/deliveryAuthorization', () => ({}), { virtual: true });
jest.mock('~/lib/missionBindings', () => ({}), { virtual: true });
jest.mock('~/lib/transactionAuthorization', () => ({ recheckTransactionAuthorization: async () => ({ status: 'allowed' }) }), { virtual: true });
jest.mock('~/lib/starterMissions', () => ({ STARTER_MISSION_SYSTEMS: new Set(), STARTER_MISSION_ACTIONS: new Set() }), { virtual: true });
jest.mock('~/lib/utils', () => ({ safeBigInt: BigInt, cleanseTxHash: tx => tx.transaction_hash }), { virtual: true });
jest.mock('~/lib/priceUtils', () => ({ TOKEN: { USDC: '0x1', SWAY: '0x2' } }), { virtual: true });
jest.mock('~/lib/walletLock', () => ({ isWalletAccountLocked: jest.fn() }), { virtual: true });

let session, state, chain;
const Probe = () => { chain = useContext(ChainTransactionContext); return null; };
const tree = () => <ChainTransactionProvider><Probe /></ChainTransactionProvider>;
const account = { address: '0x123' };
beforeEach(() => {
  jest.clearAllMocks();
  session = {
    authenticated: true, walletReadyForTransactions: true, walletCapabilities: {}, walletId: 'argentX',
    login: jest.fn().mockResolvedValue(),
    getTransactionAccount: jest.fn(async account => account)
  };
  state = { gameplay: {}, pendingTransactions: [], dispatchAlertLogged: jest.fn(), dispatchPendingTransaction: jest.fn(), dispatchFailedTransaction: jest.fn() };
  useSession.mockImplementation(() => session);
  useStore.mockImplementation(selector => selector(state));
  executePaidTransaction.mockResolvedValue({ transaction_hash: '0xabc' });
  isWalletAccountLocked.mockResolvedValue(false);
});

test('continues the original action after reconnect without another unlock request', async () => {
  const { rerender } = render(tree());
  let submitted;
  await act(async () => { submitted = chain.execute('ChangeName', { name: 'New name' }); });
  expect(session.login).toHaveBeenCalledTimes(1);
  expect(chain.promptingTransaction).toBe(true);
  // Only the account changes; the memo must rebuild the available handlers.
  session = { ...session, walletAccount: account };
  rerender(tree());
  await act(async () => { await submitted; });
  await expect(submitted).resolves.toEqual({ status: 'submitted', txHash: '0xabc' });
  expect(executePaidTransaction).toHaveBeenCalledTimes(1);
  expect(executePaidTransaction).toHaveBeenCalledWith(expect.objectContaining({ account }));
  expect(isWalletAccountLocked).not.toHaveBeenCalled();
  expect(state.dispatchPendingTransaction).toHaveBeenCalledWith(expect.objectContaining({ txHash: '0xabc' }));
  expect(chain.promptingTransaction).toBe(false);
});

test('stops immediately when reconnect is rejected', async () => {
  session.login.mockResolvedValue({ error: new Error('User rejected request') });
  render(tree());
  await act(async () => { await chain.execute('ChangeName', {}); });
  expect(executePaidTransaction).not.toHaveBeenCalled();
  expect(chain.promptingTransaction).toBe(false);
});

test('uses the normal unlock check for an already connected wallet', async () => {
  session.walletAccount = account;
  render(tree());
  await act(async () => { await chain.execute('ChangeName', {}); });
  expect(session.login).not.toHaveBeenCalled();
  expect(isWalletAccountLocked).toHaveBeenCalledWith(account);
  expect(executePaidTransaction).toHaveBeenCalledTimes(1);
});

test('resumes direct wallet calls after reconnect without requesting unlock twice', async () => {
  session.isDeployed = true;
  const { rerender } = render(tree());
  const calls = [{ contractAddress: '0x1', entrypoint: 'transfer', calldata: [] }];
  let submitted;
  await act(async () => { submitted = chain.executeCalls(calls); });
  session = { ...session, walletAccount: account };
  rerender(tree());
  await act(async () => { await submitted; });
  await expect(submitted).resolves.toEqual({ transaction_hash: '0xabc' });
  expect(isWalletAccountLocked).not.toHaveBeenCalled();
  expect(executePaidTransaction).toHaveBeenCalledWith(expect.objectContaining({ account, calls }));
  expect(chain.promptingTransaction).toBe(false);
});


test('does not submit while the connected wallet is still authenticating', async () => {
  session.walletReadyForTransactions = false;
  const { rerender } = render(tree());
  let submitted;
  await act(async () => { submitted = chain.execute('ChangeName', {}); });
  session = { ...session, walletAccount: account };
  rerender(tree());
  expect(executePaidTransaction).not.toHaveBeenCalled();
  expect(chain.promptingTransaction).toBe(true);

  session = { ...session, walletReadyForTransactions: true };
  rerender(tree());
  await act(async () => { await submitted; });
  await expect(submitted).resolves.toEqual({ status: 'submitted', txHash: '0xabc' });
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
  session.provider = { waitForTransaction: jest.fn().mockResolvedValue({ execution_status: 'SUCCEEDED' }) };
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
