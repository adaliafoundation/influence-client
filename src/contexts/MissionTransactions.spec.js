const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
import { appConfig } from '~/appConfig';
import React, { useContext } from 'react';
import { act, render } from '@testing-library/react';
const { default: ChainTransactionContext, ChainTransactionProvider } = require('./ChainTransactionContext');
import useSession from '~/hooks/useSession';
import useStore from '~/hooks/useStore';
import useWalletCrews from '~/hooks/useWalletCrews';
import { executePaidTransaction } from '~/lib/transactionFees';
import { isWalletAccountLocked } from '~/lib/walletLock';

jest.mock('@avnu/avnu-sdk', () => ({}));
jest.mock('@tanstack/react-query', () => {
  const client = { invalidateQueries: jest.fn(), setQueryData: jest.fn() };
  return { useQueryClient: () => client };
});
jest.mock('~/appConfig', () => ({ appConfig: { get: jest.fn() } }), { virtual: true });
jest.mock('~/components/TransactionFeePrompt', () => jest.fn(() => null), { virtual: true });
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
jest.mock('~/hooks/useWalletCrews', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useWalletPurchasableBalances', () => () => ({ data: {} }), { virtual: true });
jest.mock('~/hooks/useWalletTokenBalance', () => ({ useSwayBalance: () => ({ data: 0n }), useUSDCBalance: () => ({ data: 0n }) }), { virtual: true });
jest.mock('~/lib/api', () => ({ getMissionObservationCandidates: jest.fn(), getStarterMissions: jest.fn() }), { virtual: true });
jest.mock('~/lib/transactionFees', () => ({ executePaidTransaction: jest.fn() }), { virtual: true });
jest.mock('~/lib/escrow', () => ({}), { virtual: true });
jest.mock('~/lib/paymaster', () => ({ isPaymasterUnavailable: () => false, isSponsorshipUnavailable: error => error?.code === 'SPONSORSHIP_NOT_ELIGIBLE' }), { virtual: true });
jest.mock('~/lib/deliveryAuthorization', () => ({}), { virtual: true });
jest.mock('~/lib/missionObservation', () => jest.requireActual('../lib/missionObservation'), { virtual: true });
jest.mock('~/lib/colonizationMissions', () => ({}), { virtual: true });
jest.mock('~/lib/transactionAuthorization', () => ({ recheckTransactionAuthorization: async () => ({ status: 'allowed' }) }), { virtual: true });
jest.mock('~/lib/starterMissions', () => ({ MISSION_SYSTEMS: new Set() }), { virtual: true });
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
  useWalletCrews.mockReturnValue({ data: [] });
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
  useStore.getState = () => state;
  state.dispatchPaidFeesAcknowledged = jest.fn(address => {
    state.paidFeeAcknowledgements = { ...state.paidFeeAcknowledgements, [address]: true };
  });
  executePaidTransaction.mockResolvedValue({ transaction_hash: '0xabc' });
  isWalletAccountLocked.mockResolvedValue(false);
});

const api = require('~/lib/api');
const { Entity, System, MissionObservation } = require('@influenceth/sdk');
const { hash } = require('starknet');
const colony = { campaign: '777', subject: { label: Entity.IDS.ASTEROID, id: '999' }, mission: 3 };
const entity = id => ({ label: Entity.IDS.BUILDING, id });
const crew = id => ({ label: Entity.IDS.CREW, id });
const sell = { caller_crew: crew(50), seller_crew: crew(60), exchange: entity(70), product: 1, amount: 5, price: 10,
  storage: entity(71), storage_slot: 2, destination: entity(72), destination_slot: 2,
  seller_account: '0x555', exchange_owner_account: '0x666', payments: { toPlayer: 49, toExchange: 1 } };
beforeEach(() => {
  session.walletAccount = account;
  appConfig.get.mockImplementation(key => ({ 'Starknet.Address.dispatcher': '0x1', 'Starknet.Address.escrow': '0x3', 'Starknet.Address.swayToken': '0x2' }[key]));
  api.getMissionObservationCandidates.mockResolvedValue({ candidates: [colony, { ...colony, mission: 4 }] });
});
const submittedCalls = () => executePaidTransaction.mock.calls[0][0].calls;

test('real transaction pipeline preserves sell payments and registers another player’s colony candidates on every batched fill', async () => {
  render(tree());
  const vars = [sell, { ...sell, amount: 2, exchange: entity(80) }];
  await act(async () => { await chain.execute('BulkFillSellOrder', vars, { lotId: 100 }); });
  expect(executePaidTransaction).toHaveBeenCalledTimes(1);
  const calls = submittedCalls();
  expect(calls.map(c => c.entrypoint)).toEqual([
    'transfer_with_confirmation', 'transfer_with_confirmation', 'transfer_with_confirmation', 'transfer_with_confirmation',
    'begin_observation', 'run_system', 'end_observation', 'begin_observation', 'run_system', 'end_observation'
  ]);
  expect(calls[5].calldata.map(BigInt)).toEqual(System.getRunSystemCall('FillSellOrder', sell, '0x1').calldata.map(BigInt));
  expect(calls[4].calldata.slice(5).map(BigInt)).toEqual(MissionObservation.encodeMissionTargets([colony, { ...colony, mission: 4 }]).map(BigInt));
  expect(api.getMissionObservationCandidates.mock.calls.map(([r]) => r.targetUuid)).toEqual([70, 80].map(id => String(Entity.packEntity(entity(id)))));
  expect(api.getStarterMissions).not.toHaveBeenCalled();
  expect(state.dispatchPendingTransaction).toHaveBeenCalledWith(expect.objectContaining({
    key: 'BulkFillSellOrder', vars, meta: { lotId: 100, missionCandidates: [colony, { ...colony, mission: 4 }, colony, { ...colony, mission: 4 }] }
  }));
});

test('real Escrow pipeline hashes the stored hook, fill data and payments rather than the withdraw entrypoint calldata', async () => {
  render(tree());
  const vars = { buyer_crew: crew(60), caller_crew: crew(50), exchange: entity(70), product: 1, amount: 5, price: 10,
    storage: entity(71), storage_slot: 2, origin: entity(72), origin_slot: 2,
    makerFee: 0, depositCaller: '0x555', seller_account: '0x123', exchange_owner_account: '0x666', payments: { toPlayer: 49, toExchange: 1 } };
  await act(async () => { await chain.execute('EscrowWithdrawalAndFillBuyOrders', [vars]); });
  expect(executePaidTransaction).toHaveBeenCalledTimes(1);
  const calls = submittedCalls();
  expect(calls.map(c => c.entrypoint)).toEqual(['begin_observation', 'withdraw', 'end_observation']);
  const native = System.formatSystemCalldata('FillBuyOrder', vars,
    ['buyer_crew', 'exchange', 'product', 'price', 'storage', 'storage_slot', 'amount', 'origin', 'origin_slot', 'caller_crew']);
  const expected = hash.computePoseidonHashOnElements([...native, account.address, 2, '0x2', 2, '0x123', 49, 0, '0x666', 1, 0]);
  expect(BigInt(calls[0].calldata[2])).toBe(BigInt(expected));
  expect(BigInt(calls[0].calldata[3])).toBe(3n);
  expect(state.dispatchPendingTransaction).toHaveBeenCalledWith(expect.objectContaining({ key: 'EscrowWithdrawalAndFillBuyOrders', vars: [vars] }));
});

test('candidate failure never opens the wallet or retries a fill without mission evidence', async () => {
  api.getMissionObservationCandidates.mockRejectedValue(new Error('Candidates unavailable'));
  render(tree());
  await act(async () => { await chain.execute('BulkFillSellOrder', [sell]); });
  expect(executePaidTransaction).not.toHaveBeenCalled();
  expect(state.dispatchPendingTransaction).not.toHaveBeenCalled();
});
