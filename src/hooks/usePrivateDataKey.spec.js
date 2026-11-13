import { act, renderHook } from '@testing-library/react';
import usePrivateDataKey from './usePrivateDataKey';
import api from '../lib/api';
import { recoverInboxKey } from '../lib/inboxKeys';

let mockSession, mockUser, mockState;
jest.mock('./useSession', () => () => mockSession);
jest.mock('./useUser', () => () => ({ data: mockUser }));
jest.mock('./useStore', () => (selector) => selector(mockState));
jest.mock('../lib/api', () => ({ getInboxSeed: jest.fn(async () => 'recovery-seed') }));
jest.mock('../lib/utils', () => ({ resolveChainId: (chain) => chain }));
jest.mock('@influenceth/sdk', () => ({ Address: { toStandard: (address) => address } }));
jest.mock('../lib/inboxKeys', () => ({
  recoverInboxKey: jest.fn(async () => 'KEY'),
  assertInboxKey: (key, publicKey) => { if (key !== 'KEY' || publicKey !== 'PUBLIC') throw new Error('wrong key'); }
}));

beforeEach(() => {
  api.getInboxSeed.mockResolvedValue('recovery-seed');
  mockSession = { accountAddress: '0x1', chainId: '0x1', walletAccount: {} };
  mockUser = { publicKey: 'PUBLIC' };
  mockState = { privateDataKey: null, dispatchPrivateDataKey: jest.fn((value) => { mockState.privateDataKey = value; }) };
  recoverInboxKey.mockReset().mockResolvedValue('KEY');
});

it('unlocks one shared memory key and never reuses it for another account or chain', async () => {
  const { result, rerender } = renderHook(() => usePrivateDataKey());
  let pending;
  act(() => { pending = result.current.unlock(); });
  await act(async () => { await pending; });
  expect(mockState.privateDataKey).toEqual({ owner: '0x1', chainId: '0x1', privateKey: 'KEY' });
  rerender();
  expect(result.current.privateKey).toBe('KEY');
  mockSession = { ...mockSession, accountAddress: '0x2' };
  rerender();
  expect(result.current.privateKey).toBeNull();
  mockSession = { ...mockSession, accountAddress: '0x1', chainId: '0x2' };
  rerender();
  expect(result.current.privateKey).toBeNull();
});

it('does not cache a wallet recovery that completes after switching accounts', async () => {
  let resolveKey;
  recoverInboxKey.mockImplementationOnce(() => new Promise((resolve) => { resolveKey = resolve; }));
  const { result, rerender } = renderHook(() => usePrivateDataKey());
  let pending;
  await act(async () => { pending = result.current.unlock(); await Promise.resolve(); });
  mockSession = { ...mockSession, accountAddress: '0x2' };
  rerender();
  let error;
  await act(async () => {
    resolveKey('KEY');
    try { await pending; } catch (e) { error = e; }
  });
  expect(error.message).toContain('Account changed');
  expect(mockState.dispatchPrivateDataKey).not.toHaveBeenCalled();
});

it('restores a cached login wallet before requesting the recovery signature', async () => {
  mockSession = { ...mockSession, chainId: null, walletAccount: null,
    refreshWalletConnection: jest.fn(async () => true) };
  const { result, rerender } = renderHook(() => usePrivateDataKey());
  let pending;
  act(() => { pending = result.current.unlock(); });
  expect(result.current.phase).toBe('connecting');
  expect(mockSession.refreshWalletConnection).toHaveBeenCalledTimes(1);
  expect(recoverInboxKey).not.toHaveBeenCalled();
  mockSession = { ...mockSession, chainId: '0x1', walletAccount: {} };
  rerender();
  await act(async () => { await pending; });
  expect(recoverInboxKey).toHaveBeenCalledTimes(1);
  expect(mockState.privateDataKey.privateKey).toBe('KEY');
});

it('reports a failed reconnect instead of claiming encryption setup is missing', async () => {
  mockSession = { ...mockSession, chainId: null, walletAccount: null,
    refreshWalletConnection: jest.fn(async () => false) };
  const { result } = renderHook(() => usePrivateDataKey());
  let pending;
  act(() => { pending = result.current.unlock(); });
  await act(async () => { await expect(pending).rejects.toThrow('reconnect your wallet'); });
  expect(result.current.error).toContain('reconnect your wallet');
  expect(result.current.unlocking).toBe(false);
});

it('can derive a first-time setup key without requiring a published identity', async () => {
  mockUser = {};
  const { result } = renderHook(() => usePrivateDataKey());
  let pending;
  act(() => { pending = result.current.deriveKey('new-seed'); });
  await act(async () => { expect(await pending).toBe('KEY'); });
  expect(recoverInboxKey).toHaveBeenCalledWith(mockSession.walletAccount, '0x1', 'new-seed');
  expect(api.getInboxSeed).not.toHaveBeenCalled();
  expect(mockState.dispatchPrivateDataKey).not.toHaveBeenCalled();
});
