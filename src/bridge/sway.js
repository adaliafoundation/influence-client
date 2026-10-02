import { parseUnits } from 'viem';
import { isActiveBridgeTransfer, sameBridgeAddress } from './transfers';

export const getSwayCrossingBaseKey = (item) => (
  item.id || item.txHash || `${item.amount}:${item.fromAddress}:${item.toAddress || item.recipient}`
);

export const getSwayCrossingKey = (item) => {
  const baseKey = getSwayCrossingBaseKey(item);
  if (item.readyIndex != null) return `${baseKey}:ready:${item.readyIndex}`;
  if (item.pendingIndex != null) return `${baseKey}:pending:${item.pendingIndex}`;
  return baseKey;
};

export const isSwayDepositComplete = (messages) => messages?.length > 0 && messages.every((message) => (
  message.execution_status === 'SUCCEEDED'
  && ['ACCEPTED_ON_L1', 'ACCEPTED_ON_L2'].includes(message.finality_status)
));

// Keep incoming and outgoing separate so simultaneous transfers never cancel the feedback out.
export const getPendingSwayAmounts = (crossings, ethereumAddress, starknetAddress, finalizedIds = []) => {
  const totals = { ethereum: { incoming: 0n, outgoing: 0n }, starknet: { incoming: 0n, outgoing: 0n } };
  for (const crossing of crossings) {
    if (!isActiveBridgeTransfer(crossing)) continue;
    let amount;
    let toStarknet;
    if (crossing.txHash) {
      if (!['l1_to_l2', 'l2_to_l1'].includes(crossing.direction)) continue;
      // Locally submitted amounts are SWAY units; the API returns token base units.
      amount = parseUnits(String(crossing.amount), 6);
      toStarknet = crossing.direction === 'l1_to_l2';
    } else {
      const readyCount = Number(crossing.readyCount || 0);
      const finalizedCount = Array.from({ length: readyCount }, (_, readyIndex) => (
        getSwayCrossingKey({ ...crossing, readyIndex })
      )).filter((key) => finalizedIds.includes(key)).length;
      const count = Number(crossing.pendingCount || 0) + readyCount - finalizedCount;
      amount = BigInt(crossing.amount || 0) * BigInt(count);
      toStarknet = false;
    }
    if (amount <= 0n) continue;
    const source = toStarknet ? 'ethereum' : 'starknet';
    const destination = toStarknet ? 'starknet' : 'ethereum';
    const addresses = { ethereum: ethereumAddress, starknet: starknetAddress };
    if (sameBridgeAddress(crossing.fromAddress, addresses[source])) totals[source].outgoing += amount;
    if (sameBridgeAddress(crossing.toAddress || crossing.recipient, addresses[destination])) totals[destination].incoming += amount;
  }
  return totals;
};
