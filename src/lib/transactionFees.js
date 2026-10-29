import { stark } from 'starknet';
import { isPaymasterUnavailable } from './paymaster';

import { isUserCancellation as isUserRejection } from './errorReporting';
const isInsufficientFee = (error) => /insufficient.*(?:balance|funds)|(?:balance|funds).*too low/i.test(error?.message || '');

const cancelFeePayment = () => {
  const error = new Error('Fee payment permission was not granted.');
  error.suppressTransactionFailure = true;
  throw error;
};

const processPaidTransaction = async ({
  account, calls, assertCurrent, resourceBounds, deploymentData, validateAccount = false, getStrkBalance, usePaymaster, feeTokens, requestFeePermission, enableFeeToken, openTopUp, prepareOnly = false
}) => {
  const strkBalance = await getStrkBalance();
  if (strkBalance > 0n) {
    // Raw-signing accounts need validation included; browser wallets sign only when submitting.
    const estimate = resourceBounds ? { resourceBounds } : await account.estimateInvokeFee(calls, { skipValidate: !validateAccount });
    const maxFee = stark.resourceBoundsToEstimateFeeResponse(estimate.resourceBounds).overall_fee;
    if (strkBalance >= maxFee) {
      if (prepareOnly) return { mode: 'native', name: 'STRK', decimals: 18, maxFee, resourceBounds: estimate.resourceBounds };
      // Once submitted, never retry through another payment method on an ambiguous failure.
      assertCurrent?.();
      return account.execute(calls, { resourceBounds: estimate.resourceBounds });
    }
  }

  let paymasterAvailable = usePaymaster;
  // Try already-authorized tokens before asking permission to use another balance.
  const tokens = [...feeTokens.filter((token) => token.enabled), ...feeTokens.filter((token) => !token.enabled)];
  for (const token of tokens) {
    if (!paymasterAvailable) break;
    if (!token.supported || token.balance <= 0n) continue;

    const details = { feeMode: { mode: 'default', gasToken: token.address }, ...(deploymentData ? { deploymentData } : {}) };
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

    if (prepareOnly) return { mode: 'default', address: token.address, name: token.name, decimals: 6,
      maxFee: BigInt(fees.suggested_max_fee_in_gas_token), details };

    try {
      assertCurrent?.();
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

export const preparePaidTransactionFee = (options) => processPaidTransaction({ ...options, prepareOnly: true });
export const executePaidTransaction = (options) => processPaidTransaction(options);

// A reviewed transaction never switches fee tokens or retries another payment method.
export const executeReviewedTransaction = async ({ account, calls, fee, assertCurrent, getStrkBalance, feeTokens, usePaymaster }) => {
  if (fee.mode === 'native') {
    if (await getStrkBalance() < fee.maxFee) throw new Error('Insufficient STRK. Review the swap again.');
    assertCurrent?.();
    return account.execute(calls, { resourceBounds: fee.resourceBounds });
  }
  if (!usePaymaster) throw new Error('Paymaster unavailable. Review the swap again.');
  if (fee.mode === 'default') {
    const token = feeTokens.find(token => token.address === fee.address);
    if (!token?.enabled || !token.supported) throw new Error('Fee preferences changed. Review the swap again.');
    if (token.balance < fee.maxFee) throw new Error('Insufficient balance for swap and fees. Review the swap again.');
  }
  assertCurrent?.();
  return account.executePaymasterTransaction(calls, fee.details, fee.maxFee);
};
