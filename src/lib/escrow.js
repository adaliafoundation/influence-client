import { hash, uint256 } from 'starknet';

export const getEscrowOrderId = (depositCaller, tokenAddress, withdrawHook) => hash.computePoseidonHashOnElements([
  depositCaller,
  tokenAddress,
  withdrawHook.contractAddress,
  withdrawHook.entrypoint,
  withdrawHook.calldata.length,
  ...withdrawHook.calldata
]);

export const getCancellationRefund = async ({
  provider, escrowAddress, tokenAddress, depositCaller, withdrawHook, minimumRefund
}) => {
  if (!depositCaller) throw new Error('Original order depositor is missing. Refresh the order and try again.');
  let balance;
  try {
    const orderId = getEscrowOrderId(depositCaller, tokenAddress, withdrawHook);
    const result = await provider.callContract({
      contractAddress: escrowAddress,
      entrypoint: 'balance_of',
      calldata: [orderId]
    });
    balance = uint256.uint256ToBN({ low: result[0], high: result[1] });
  } catch (error) {
    console.warn('Unable to read cancellation escrow balance; using the minimum refund.', error);
    return BigInt(minimumRefund);
  }

  // A successful read below the minimum indicates stale order data or the wrong escrow.
  if (balance < BigInt(minimumRefund)) {
    throw new Error('Escrow balance is below the cancellation refund. Refresh the order and try again.');
  }
  return balance;
};
