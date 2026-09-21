/** @jest-environment node */
import { Order, System } from '@influenceth/sdk';
import { hash, uint256 } from 'starknet';
import { getCancellationRefund, getEscrowOrderId } from './escrow';

const withdrawHook = {
  contractAddress: '0x123',
  entrypoint: hash.getSelectorFromName('run_system'),
  calldata: ['0x456', '25', '1', '2', '3']
};
const params = {
  escrowAddress: '0xabc',
  tokenAddress: '0xdef',
  depositCaller: '0x789',
  withdrawHook,
  minimumRefund: 305n
};
const balanceResult = (value) => {
  const { low, high } = uint256.bnToUint256(value);
  return [low, high];
};

test('hashes the same serialized depositor, token and hook used by SDK withdrawals', () => {
  const call = System.getEscrowWithdrawCall([], params.depositCaller, withdrawHook, [], params.escrowAddress, params.tokenAddress);
  const serializedIdentity = call.calldata.slice(0, 5 + withdrawHook.calldata.length);
  expect(getEscrowOrderId(params.depositCaller, params.tokenAddress, withdrawHook))
    .toBe(hash.computePoseidonHashOnElements(serializedIdentity));
  expect(getEscrowOrderId('0x999', params.tokenAddress, withdrawHook))
    .not.toBe(getEscrowOrderId(params.depositCaller, params.tokenAddress, withdrawHook));
});

test.each([305n, 307n, (1n << 128n) + 307n])('refunds the entire escrow balance %s without losing precision', async (balance) => {
  const provider = { callContract: jest.fn().mockResolvedValue(balanceResult(balance)) };
  await expect(getCancellationRefund({ ...params, provider })).resolves.toBe(balance);
  expect(provider.callContract).toHaveBeenCalledWith({
    contractAddress: params.escrowAddress,
    entrypoint: 'balance_of',
    calldata: [getEscrowOrderId(params.depositCaller, params.tokenAddress, withdrawHook)]
  });
});

test.each([
  ['fractional fees', 3, 101, 67, 305],
  ['exact division', 100, 100, 67, 10067],
  ['zero fees', 3, 101, 0, 303],
  ['partial fills', 334, 1234, 67, 414917]
])('falls back to the SDK rounded-down refund for %s when RPC fails', async (_, amount, price, fee, expected) => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const minimumRefund = Order.getBuyOrderCancellationRefund(amount, price, fee);
    expect(minimumRefund).toBe(expected);
    const provider = { callContract: jest.fn().mockRejectedValue(new Error('RPC unavailable')) };
    await expect(getCancellationRefund({ ...params, provider, minimumRefund })).resolves.toBe(BigInt(expected));
  } finally {
    warn.mockRestore();
  }
});

test('rejects a known insufficient balance instead of attempting an unfunded fallback', async () => {
  const provider = { callContract: jest.fn().mockResolvedValue(balanceResult(304n)) };
  await expect(getCancellationRefund({ ...params, provider })).rejects.toThrow('Refresh the order');
});

test('requires the original depositor instead of guessing the withdrawing account', async () => {
  const provider = { callContract: jest.fn() };
  await expect(getCancellationRefund({ ...params, provider, depositCaller: undefined })).rejects.toThrow('Original order depositor');
  expect(provider.callContract).not.toHaveBeenCalled();
});
