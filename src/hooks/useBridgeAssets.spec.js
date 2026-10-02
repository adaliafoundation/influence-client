import { act, renderHook } from '@testing-library/react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import useSession from '~/hooks/useSession';
import useStore from '~/hooks/useStore';
import api from '~/lib/api';
import useBridgeAssets, { useBridgeSway } from './useBridgeAssets';
import { pruneBridgeTransfers } from '../bridge/transfers';

jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn(), useQueries: jest.fn(), useQueryClient: jest.fn() }));
jest.mock('wagmi', () => ({ useAccount: jest.fn(), useBalance: () => ({ refetch: jest.fn() }) }));
jest.mock('~/hooks/useSession', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useStore', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useWalletTokenBalance', () => ({ useSwayBalance: () => 0 }), { virtual: true });
jest.mock('~/appConfig', () => ({ appConfig: { get: () => '0x1' } }), { virtual: true });
jest.mock('~/lib/api', () => ({ getBridgeCrossings: jest.fn(), getSwayCrossings: jest.fn() }), { virtual: true });
jest.mock('~/bridge/sway', () => jest.requireActual('../bridge/sway'), { virtual: true });
jest.mock('~/bridge/transfers', () => jest.requireActual('../bridge/transfers'), { virtual: true });
jest.mock('~/bridge/assets', () => {
  const config = { assetType: 'asteroids', starknetName: 'Asteroid', entityLabel: 1 };
  return { bridgeNetwork: '1:SN_MAIN', bridgeAssetConfigs: { asteroids: config }, getBridgeAssetConfig: () => config };
}, { virtual: true });

let state;
let responses;
const prune = jest.fn();
const local = (extra = {}) => ({
  id: '0x123', txHash: '0x123', createdAt: Date.now(), network: '1:SN_MAIN',
  assetType: 'asteroids', assetIds: [141], direction: 'l1_to_l2',
  fromAddress: '0xa', toAddress: '0xb', status: 'waiting_l2', ...extra
});
const crossing = (extra = {}) => ({
  _id: 'message', assetType: 'Asteroid', assetIds: [141],
  origin: 'ETHEREUM', destination: 'STARKNET', toAddress: '0xb',
  status: 'PROCESSING', event: { timestamp: Math.floor(Date.now() / 1000) }, ...extra
});

beforeEach(() => {
  jest.clearAllMocks();
  useQueries.mockReturnValue([]);
  useQueryClient.mockReturnValue({ invalidateQueries: jest.fn() });
  prune.mockImplementation((ids = []) => {
    state.bridgeTransfers = pruneBridgeTransfers(state.bridgeTransfers);
    ids.forEach((id) => delete state.bridgeTransfers[id]);
  });
  state = { bridgeTransfers: {}, dispatchBridgeTransfersPruned: prune };
  responses = { ethereum: [], starknet: [], l1ToL2: [], l2ToL1: [], sway: [] };
  useAccount.mockReturnValue({ address: '0xa' });
  useSession.mockReturnValue({ accountAddress: '0xb' });
  useStore.mockImplementation((selector) => selector(state));
  useQuery.mockImplementation(({ queryKey }) => ({ data: responses[queryKey[2] || 'sway'] || [], isSuccess: true, dataUpdatedAt: Date.now() + 1000 }));
});

test('migrated local clutter disappears while API withdrawals retain the full batch and remain finalizable', () => {
  state.bridgeTransfers = { old: local({ network: undefined }), other: local({ fromAddress: '0xc' }) };
  const assetIds = Array.from({ length: 10 }, (_, i) => i + 1);
  responses.l2ToL1 = [crossing({ assetIds, origin: 'STARKNET', destination: 'ETHEREUM', fromAddress: '0xd', toAddress: '0xa' })];
  const { result } = renderHook(() => useBridgeAssets('asteroids'));
  expect(state.bridgeTransfers.old).toBeUndefined();
  expect(state.bridgeTransfers.other).toBeDefined();
  expect(result.current.progressItems).toHaveLength(1);
  expect(result.current.progressItems[0]).toMatchObject({ canConfirm: true, assetIds, fromAddress: '0xd' });
});

test('switching either wallet hides unrelated local transfers immediately', () => {
  state.bridgeTransfers = { '0x123': local() };
  const { result, rerender } = renderHook(() => useBridgeAssets('asteroids'));
  expect(result.current.progressItems).toHaveLength(1);
  useAccount.mockReturnValue({ address: '0xc' });
  rerender();
  expect(result.current.progressItems).toHaveLength(0);
  useAccount.mockReturnValue({ address: '0xa' });
  useSession.mockReturnValue({ accountAddress: '0xc' });
  rerender();
  expect(result.current.progressItems).toHaveLength(0);
});

test('completed API evidence permanently removes a local transfer, so it cannot reappear after assets move away', () => {
  state.bridgeTransfers = { '0x123': local() };
  responses.starknet = [{ id: 141, Nft: { bridge: { status: 'COMPLETE', destination: 'STARKNET' }, owners: { starknet: '0xb' } } }];
  const { result, rerender } = renderHook(() => useBridgeAssets('asteroids'));
  expect(result.current.progressItems).toHaveLength(0);
  expect(state.bridgeTransfers).toEqual({});
  responses.starknet = [];
  rerender();
  expect(result.current.progressItems).toHaveLength(0);
});

test.each(['PROCESSING', 'COMPLETE'])('indexed %s crossing retires its local placeholder', (status) => {
  state.bridgeTransfers = { '0x123': local() };
  responses.l1ToL2 = [crossing({ status })];
  const { result } = renderHook(() => useBridgeAssets('asteroids'));
  expect(state.bridgeTransfers).toEqual({});
  expect(result.current.progressItems).toHaveLength(status === 'COMPLETE' ? 0 : 1);
});

test('API errors or empty responses do not remove a recent local transfer', () => {
  state.bridgeTransfers = { '0x123': local() };
  useQuery.mockReturnValue({ data: undefined, isError: true });
  const { result } = renderHook(() => useBridgeAssets('asteroids'));
  expect(result.current.progressItems).toHaveLength(1);
  expect(state.bridgeTransfers['0x123']).toBeDefined();
});

test('polling continues without local records and withdrawals are queried by Ethereum recipient', async () => {
  renderHook(() => useBridgeAssets('asteroids'));
  const options = useQuery.mock.calls.map(([option]) => option);
  expect(options.every((option) => option.refetchInterval === 30000)).toBe(true);
  expect(options.every((option) => option.queryKey.includes('1:SN_MAIN'))).toBe(true);
  await options.find((option) => option.queryKey[2] === 'l2ToL1').queryFn();
  expect(api.getBridgeCrossings).toHaveBeenCalledWith(expect.objectContaining({ toAddress: '0xa', fromAddress: undefined }));
});

test('SWAY retires indexed local events even when the aggregated crossing is already complete', () => {
  state.bridgeTransfers = { '0x123': local({ assetType: 'sway', amount: '10' }) };
  useQuery.mockReturnValue({ data: [{ amount: '10', readyCount: 0, pendingCount: 0, events: [{ transactionHash: '0x123' }] }] });
  const { result } = renderHook(() => useBridgeSway());
  expect(state.bridgeTransfers).toEqual({});
  expect(result.current.swayCrossings).toHaveLength(1);
  expect(result.current.swayCrossings[0].txHash).toBeUndefined();
});

test('expired placeholders are pruned while the bridge stays open', () => {
  jest.useFakeTimers();
  state.bridgeTransfers = { '0x123': local({ createdAt: Date.now() - 24 * 60 * 60 * 1000 + 1000 }) };
  const { unmount } = renderHook(() => useBridgeAssets('asteroids'));
  act(() => jest.advanceTimersByTime(30000));
  expect(state.bridgeTransfers).toEqual({});
  unmount();
  jest.useRealTimers();
});

test('an ownership snapshot cached before submission cannot retire a new bridge', () => {
  state.bridgeTransfers = { '0x123': local() };
  const completed = { id: 141, Nft: { bridge: { status: 'COMPLETE', destination: 'STARKNET' }, owners: { starknet: '0xb' } } };
  useQuery.mockImplementation(({ queryKey }) => ({
    data: queryKey[2] === 'starknet' ? [completed] : [], dataUpdatedAt: Date.now() - 60000
  }));
  renderHook(() => useBridgeAssets('asteroids'));
  expect(state.bridgeTransfers['0x123']).toBeDefined();
});

test('delivered SWAY deposits disappear and refresh balances, while unconfirmed deposits stay visible', () => {
  state.bridgeTransfers = { '0x123': local({ assetType: 'sway', amount: '10' }) };
  useQuery.mockReturnValue({ data: [] });
  useQueries.mockReturnValue([{ data: [] }]);
  const { result, rerender } = renderHook(() => useBridgeSway());
  expect(result.current.swayCrossings).toHaveLength(1);
  expect(state.bridgeTransfers['0x123']).toBeDefined();
  useQueries.mockReturnValue([{ data: [{ execution_status: 'SUCCEEDED', finality_status: 'ACCEPTED_ON_L2' }] }]);
  rerender();
  expect(result.current.swayCrossings).toHaveLength(0);
  expect(state.bridgeTransfers).toEqual({});
  expect(useQueryClient().invalidateQueries).toHaveBeenCalledWith({ queryKey: ['walletBalance', 'sway', '0xb'] });
});

jest.mock('viem', () => {
  global.TextEncoder = require('util').TextEncoder;
  global.TextDecoder = require('util').TextDecoder;
  return jest.requireActual('viem');
});

test('ready SWAY withdrawals stay finalizable with their original amount and recipient', () => {
  useQuery.mockReturnValue({ data: [{
    _id: 'ready', amount: '0x989680', fromAddress: '0xb', toAddress: '0xa', readyCount: 1, pendingCount: 0
  }] });
  const { result } = renderHook(() => useBridgeSway());
  expect(result.current.swayCrossings[0]).toMatchObject({
    canConfirm: true, amount: '0x989680', recipient: '0xa', readyCount: 1, displayChain: 'ethereum'
  });
});
