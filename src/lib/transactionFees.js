import { stark } from 'starknet';
import { isPaymasterUnavailable } from './paymaster';

import { isUserCancellation as isUserRejection } from './errorReporting';
const isInsufficientFee = (error) => /insufficient.*(?:balance|funds)|(?:balance|funds).*too low/i.test(error?.message || '');

const cancelFeePayment = () => {
  const error = new Error('Fee payment permission was not granted.');
  error.suppressTransactionFailure = true;
  throw error;
};

export const executePaidTransaction = async ({
  account, calls, getStrkBalance, usePaymaster, feeTokens, requestFeePermission, enableFeeToken, openTopUp
}) => {
  const strkBalance = await getStrkBalance();
  if (strkBalance > 0n) {
    const estimate = await account.estimateInvokeFee(calls, { skipValidate: true });
    const maxFee = stark.resourceBoundsToEstimateFeeResponse(estimate.resourceBounds).overall_fee;
    if (strkBalance >= maxFee) {
      // Once submitted, never retry through another payment method on an ambiguous failure.
      return account.execute(calls, { resourceBounds: estimate.resourceBounds });
    }
  }

  let paymasterAvailable = usePaymaster;
  // Try already-authorized tokens before asking permission to use another balance.
  const tokens = [...feeTokens.filter((token) => token.enabled), ...feeTokens.filter((token) => !token.enabled)];
  for (const token of tokens) {
    if (!paymasterAvailable) break;
    if (!token.supported || token.balance <= 0n) continue;

    const details = { feeMode: { mode: 'default', gasToken: token.address } };
    let fees;
    try {
      fees = await account.estimatePaymasterTransactionFee(calls, details);
    } catch (error) {
      if (isUserRejection(error)) throw error;
      if (isPaymasterUnavailable(error)) paymasterAvailable = false;
      continue;
    }
    if (token.balance < fees.suggested_max_fee_in_gas_token) continue;

    if (!token.enabled) {
      if (!(await requestFeePermission(token.name))) cancelFeePayment();
      enableFeeToken(token.address);
    }

    try {
      return await account.executePaymasterTransaction(calls, details);
    } catch (error) {
      if (isUserRejection(error)) throw error;
      // Only retry definitive payment failures, not an ambiguous submission failure.
      if (isPaymasterUnavailable(error)) paymasterAvailable = false;
      else if (!isInsufficientFee(error)) throw error;
    }
  }

  const openWallet = await requestFeePermission(paymasterAvailable ? 'TOP_UP' : 'TOP_UP_STRK');
  if (openWallet) openTopUp();
  const error = new Error('Insufficient balance for network fees.');
  error.suppressTransactionFailure = true;
  throw error;
};
