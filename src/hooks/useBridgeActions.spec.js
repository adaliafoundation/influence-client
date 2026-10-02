import { renderHook, act } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import { getConfig } from '~/bridge/assets';
import { useAccount, usePublicClient } from 'wagmi';
import { parseUnits } from 'viem';
import { readContract, writeContract } from 'wagmi/actions';
import useBridgeActions from './useBridgeActions';
import { reportFailure } from '../lib/errorReporting';
import useSession from '~/hooks/useSession';
import useStore from '~/hooks/useStore';

jest.mock('@tanstack/react-query', () => ({ useQueryClient: jest.fn() }));
jest.mock('starknet', () => ({ num: { toHex: (value) => value } }));
jest.mock('viem', () => ({ formatUnits: jest.fn(), parseUnits: jest.fn() }));
jest.mock('wagmi', () => ({
  useAccount: jest.fn(), useChainId: () => 1, useConfig: () => ({}),
  usePublicClient: jest.fn(), useSwitchChain: () => ({})
}));
jest.mock('wagmi/actions', () => ({ readContract: jest.fn(), writeContract: jest.fn() }));
jest.mock('@influenceth/sdk', () => ({ ethereumContracts: {} }));
jest.mock('~/contexts/WagmiContext', () => ({ configuredChain: { id: 1 } }), { virtual: true });
jest.mock('~/bridge/assets', () => ({
  bridgeNetwork: '1:SN_MAIN',
  isBridgeAssetConfigured: () => true,
  getConfig: jest.fn(),
  getBridgeAssetConfig: () => ({
    ethereumBridgeAddress: '0x3',
    starknetAssetContract: [{ name: 'bridge_from_l1', inputs: [{ name: 'from_address' }, { name: 'token_ids' }] }]
  })
}), { virtual: true });
jest.mock('~/bridge/limits', () => jest.requireActual('../bridge/limits'), { virtual: true });
jest.mock('~/hooks/useSession', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useStore', () => jest.fn(), { virtual: true });
jest.mock('../lib/errorReporting', () => ({ reportFailure: jest.fn() }));

const alert = jest.fn();
const waitForReceipt = jest.fn();
const estimateContractGas = jest.fn();
const invalidateQueries = jest.fn();
const logTransfer = jest.fn();
const estimateMessageFee = jest.fn();
const execute = jest.fn();
const login = jest.fn();
const assets = (count) => Array.from({ length: count }, (_, id) => ({ id: id + 1 }));

beforeEach(() => {
  jest.clearAllMocks();
  getConfig.mockReturnValue('');
  waitForReceipt.mockResolvedValue({ status: 'success' });
  estimateContractGas.mockResolvedValue(174772n);
  reportFailure.mockImplementation((notify) => notify({ data: { content: 'Action failed', report: 'details' } }));
  usePublicClient.mockReturnValue({ waitForTransactionReceipt: waitForReceipt, estimateContractGas });
  useQueryClient.mockReturnValue({ invalidateQueries });
  useAccount.mockReturnValue({ address: '0x1', isConnected: true });
  useSession.mockReturnValue({
    accountAddress: '0x2', login, provider: { estimateMessageFee }, walletAccount: { execute }
  });
  useStore.mockImplementation((selector) => selector({ dispatchAlertLogged: alert, dispatchBridgeTransferLogged: logTransfer, dispatchBridgeTransferUpdated: jest.fn() }));
});

test.each(['bridgeAssetsToStarknet', 'bridgeAssetsToEthereum'])(
  '%s rejects empty and oversized batches before wallet or RPC work', async (action) => {
    const { result } = renderHook(() => useBridgeActions());
    for (const count of [0, 6, 10]) {
      await act(async () => {
        expect(await result.current[action]({ assetType: 'crewmates', assets: assets(count) })).toBeNull();
      });
    }
    expect(alert).toHaveBeenCalledTimes(3);
    expect(alert.mock.calls[2][0].data.content).toContain('at most 5');
    expect(estimateMessageFee).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    expect(writeContract).not.toHaveBeenCalled();
    expect(login).not.toHaveBeenCalled();
  }
);

test('five assets reach fee estimation, and a failed estimate prevents submission', async () => {
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  estimateMessageFee.mockRejectedValueOnce(new Error('Insufficient max L1Gas'));
  const { result } = renderHook(() => useBridgeActions());
  await act(async () => {
    expect(await result.current.bridgeAssetsToStarknet({ assetType: 'crewmates', assets: assets(5) })).toBeNull();
  });
  expect(estimateMessageFee).toHaveBeenCalledTimes(1);
  expect(writeContract).not.toHaveBeenCalled();
  expect(result.current.busyKey).toBeUndefined();
  warning.mockRestore();
});

test('finalizes an existing ten-asset withdrawal as one intact message', async () => {
  const assetIds = assets(10).map((asset) => asset.id);
  writeContract.mockResolvedValueOnce('0xabc');
  const { result } = renderHook(() => useBridgeActions());
  await act(async () => {
    expect(await result.current.receiveAssetsOnEthereum({
      assetType: 'crewmates', assetIds, fromAddress: '0x4'
    })).toBe('0xabc');
  });
  expect(logTransfer).toHaveBeenCalledWith(expect.objectContaining({ network: '1:SN_MAIN', fromAddress: '0x4', toAddress: '0x1' }));
  expect(writeContract).toHaveBeenCalledTimes(1);
  expect(writeContract).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    functionName: 'bridgeFromStarknet', args: [assetIds.map(BigInt), 4n]
  }));
  expect(alert).toHaveBeenLastCalledWith(expect.objectContaining({
    data: { content: 'Assets received on Ethereum.' }
  }));
});

test('minting waits for confirmation, refreshes the assets, and does not create a bridge placeholder', async () => {
  getConfig.mockReturnValue('0x3');
  writeContract.mockResolvedValueOnce('0xabc');
  let confirm;
  waitForReceipt.mockImplementationOnce(() => new Promise((resolve) => { confirm = resolve; }));
  const { result } = renderHook(() => useBridgeActions());
  let pending;
  await act(async () => { pending = result.current.mintCrewFromAsteroid(141); });
  expect(result.current.busyKey).toBe('mint-141');
  expect(estimateContractGas).toHaveBeenCalledWith(expect.objectContaining({ account: '0x1', address: '0x3', args: [141n] }));
  expect(writeContract).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    functionName: 'mintCrewWithAsteroid', args: [141n], account: '0x1', gas: 209727n
  }));
  expect(invalidateQueries).not.toHaveBeenCalled();
  await act(async () => { confirm({ status: 'success' }); expect(await pending).toBe('0xabc'); });
  expect(result.current.busyKey).toBeUndefined();
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['bridgeAssets'] });
  expect(logTransfer).not.toHaveBeenCalled();
});

test('a reverted mint remains retryable and is not reported as successful', async () => {
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  getConfig.mockReturnValue('0x3');
  writeContract.mockResolvedValueOnce('0xabc');
  waitForReceipt.mockResolvedValueOnce({ status: 'reverted' });
  const { result } = renderHook(() => useBridgeActions());
  await act(async () => { expect(await result.current.mintCrewFromAsteroid(141)).toBeNull(); });
  expect(result.current.busyKey).toBeUndefined();
  expect(invalidateQueries).not.toHaveBeenCalled();
  expect(alert).not.toHaveBeenCalledWith(expect.objectContaining({ data: { content: 'Crewmate minted.' } }));
  warning.mockRestore();
});

test('an already-claimed reward stops before the wallet, reports the reason, and hides the stale mint action', async () => {
  getConfig.mockReturnValue('0x3');
  const reason = 'ArvadCrewSale: asteroid has already been used to mint crew';
  const revert = { name: 'ContractFunctionRevertedError', reason };
  estimateContractGas.mockRejectedValueOnce({ walk: (predicate) => predicate(revert) ? revert : undefined });
  const { result } = renderHook(() => useBridgeActions());
  await act(async () => { expect(await result.current.mintCrewFromAsteroid(11034)).toBeNull(); });
  expect(writeContract).not.toHaveBeenCalled();
  expect(waitForReceipt).not.toHaveBeenCalled();
  expect(result.current.claimedAsteroidIds).toEqual([11034]);
  expect(alert).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ content: reason, report: 'details' }) }));
  expect(result.current.busyKey).toBeUndefined();
});

test('RPC estimation failures do not submit a fallback transaction or hide a claimable reward', async () => {
  getConfig.mockReturnValue('0x3');
  estimateContractGas.mockRejectedValueOnce(new Error('RPC unavailable'));
  const { result } = renderHook(() => useBridgeActions());
  await act(async () => { expect(await result.current.mintCrewFromAsteroid(141)).toBeNull(); });
  expect(writeContract).not.toHaveBeenCalled();
  expect(result.current.claimedAsteroidIds).toEqual([]);
  expect(result.current.busyKey).toBeUndefined();
});

test('finalizing SWAY submits the separate Ethereum withdrawal transaction', async () => {
  getConfig.mockReturnValue('0x3');
  writeContract.mockResolvedValueOnce('0xabc');
  const { result } = renderHook(() => useBridgeActions());
  await act(async () => {
    expect(await result.current.receiveSwayOnEthereum({ amount: '0x989680' })).toBe('0xabc');
  });
  expect(writeContract).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
    address: '0x3', functionName: 'withdraw', args: [10000000n, '0x1']
  }));
  expect(waitForReceipt).toHaveBeenCalledWith({ hash: '0xabc' });
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['bridgeSwayCrossings'] });
});

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

test('SWAY provides continuous feedback between approval and the bridge wallet request', async () => {
  getConfig.mockReturnValue('0x3');
  parseUnits.mockReturnValue(10000000n);
  readContract.mockResolvedValueOnce(0n);
  const approval = deferred();
  const receipt = deferred();
  const fee = deferred();
  const deposit = deferred();
  writeContract.mockReturnValueOnce(approval.promise).mockReturnValueOnce(deposit.promise);
  waitForReceipt.mockReturnValueOnce(receipt.promise);
  estimateMessageFee.mockReturnValueOnce(fee.promise);
  const { result } = renderHook(() => useBridgeActions());
  let pending;
  await act(async () => { pending = result.current.bridgeSwayToStarknet('10'); });
  expect(result.current.swayDepositStatus).toBe('Approve SWAY spending in your Ethereum wallet.');
  await act(async () => approval.resolve('0xapproval'));
  expect(result.current.swayDepositStatus).toBe('Waiting for approval confirmation…');
  await act(async () => receipt.resolve({ status: 'success' }));
  expect(result.current.swayDepositStatus).toBe('Approval confirmed. Preparing the bridge transaction…');
  expect(result.current.busyKey).toBe('sway-l1');
  expect(writeContract).toHaveBeenCalledTimes(1);
  await act(async () => fee.resolve({ overall_fee: 1n }));
  expect(result.current.swayDepositStatus).toBe('Confirm the bridge transaction in your Ethereum wallet.');
  await act(async () => { deposit.resolve('0xdeposit'); expect(await pending).toBe('0xdeposit'); });
  expect(result.current.swayDepositStatus).toBeUndefined();
  expect(result.current.busyKey).toBeUndefined();
});

test('SWAY skips approval feedback when already approved and clears feedback on failure', async () => {
  getConfig.mockReturnValue('0x3');
  parseUnits.mockReturnValue(10000000n);
  readContract.mockResolvedValueOnce(10000000n);
  const fee = deferred();
  estimateMessageFee.mockReturnValueOnce(fee.promise);
  writeContract.mockRejectedValueOnce(new Error('User rejected'));
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const { result } = renderHook(() => useBridgeActions());
  let pending;
  await act(async () => { pending = result.current.bridgeSwayToStarknet('10'); });
  expect(result.current.swayDepositStatus).toBe('SWAY is approved. Preparing the bridge transaction…');
  expect(writeContract).not.toHaveBeenCalled();
  await act(async () => { fee.resolve({ overall_fee: 1n }); expect(await pending).toBeNull(); });
  expect(result.current.swayDepositStatus).toBeUndefined();
  expect(result.current.busyKey).toBeUndefined();
  warning.mockRestore();
});

test('a reverted SWAY approval stops before preparing or submitting the deposit', async () => {
  getConfig.mockReturnValue('0x3');
  parseUnits.mockReturnValue(10000000n);
  readContract.mockResolvedValueOnce(0n);
  writeContract.mockResolvedValueOnce('0xapproval');
  waitForReceipt.mockResolvedValueOnce({ status: 'reverted' });
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const { result } = renderHook(() => useBridgeActions());
  await act(async () => { expect(await result.current.bridgeSwayToStarknet('10')).toBeNull(); });
  expect(estimateMessageFee).not.toHaveBeenCalled();
  expect(writeContract).toHaveBeenCalledTimes(1);
  expect(result.current.swayDepositStatus).toBeUndefined();
  expect(result.current.busyKey).toBeUndefined();
  warning.mockRestore();
});
