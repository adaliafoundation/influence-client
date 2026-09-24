import { isPaymasterUnavailable } from './paymaster';

const isUserRejection = (error) => /USER_REFUSED_OP|User abort|User rejected/i.test(error?.message || '');
const isInsufficientFee = (error) => /insufficient.*(?:balance|funds|fee)|(?:balance|funds).*too low/i.test(error?.message || '');

const cancelFeePayment = () => {
  const error = new Error('Fee payment permission was not granted.');
  error.suppressTransactionFailure = true;
  throw error;
};

export const executePaidTransaction = async ({
  account, calls, usePaymaster, feeTokens, requestFeePermission, enableFeeToken, openTopUp
}) => {
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

  try {
    // Let the account estimate native fees using current balances and resource bounds.
    return await account.execute(calls, {});
  } catch (error) {
    if (isUserRejection(error)) throw error;
    const openWallet = await requestFeePermission(paymasterAvailable ? 'TOP_UP' : 'TOP_UP_STRK');
    if (openWallet && paymasterAvailable) openTopUp();
    error.suppressTransactionFailure = true;
    throw error;
  }
};
