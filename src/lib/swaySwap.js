import { calculateMinReceivedAmount, quoteToCalls } from '@avnu/avnu-sdk';
import { Address } from '@influenceth/sdk';
import { appConfig } from '~/appConfig';
import api from '~/lib/api';
import { TOKEN } from '~/lib/priceUtils';
import { areChainsEqual } from '~/lib/utils';

export const SWAP_REVIEW_LIFETIME_MS = 60000;

export const parseUsdcAmount = (value) => {
  if (!/^\d+(\.\d{1,6})?$/.test(String(value))) return null;
  const [whole, fraction = ''] = String(value).split('.');
  const amount = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
  return amount > 0n ? amount : null;
};

export const parseSlippageBps = (value) => {
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) return null;
  const bps = Math.round(Number(value) * 100);
  return bps >= 1 && bps <= 500 ? bps : null;
};

export const formatSwapAmount = (amount, decimals = 6) => {
  const scale = 10n ** BigInt(decimals);
  const fraction = (amount % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${amount / scale}${fraction ? `.${fraction}` : ''}`;
};

export const assertSwapCurrent = (swap, { accountAddress, chainId }, now = Date.now()) => {
  if (swap.accountAddress !== accountAddress || swap.chainId !== chainId) {
    throw new Error('Wallet or network changed. Please review a new quote.');
  }
  if (now >= swap.expiresAt) throw new Error('Quote expired. Please review a new quote.');
};

export const prepareSwaySwap = async ({ accountAddress, chainId, amount, slippageBps }) => {
  if (!amount || amount <= 0n) throw new Error('Enter a positive USDC amount with up to six decimal places.');
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 500) {
    throw new Error('Choose slippage between 0.01% and 5%.');
  }
  const requestedAt = Date.now();
  const quotes = await api.getSwapQuote({ sellToken: TOKEN.USDC, buyToken: TOKEN.SWAY, amount, account: accountAddress });
  const quote = quotes?.[0];
  if (!quote) throw new Error('No swap liquidity is available for this amount.');
  if (!Address.areEqual(quote.sellTokenAddress, TOKEN.USDC)
    || !Address.areEqual(quote.buyTokenAddress, TOKEN.SWAY)
    || BigInt(quote.sellAmount) !== amount
    || BigInt(quote.buyAmount) <= 0n
    || !areChainsEqual(quote.chainId, chainId)) {
    throw new Error('The quote does not match this USDC to SWAY swap.');
  }
  const slippage = slippageBps / 10000;
  const { calls } = await quoteToCalls({
    quoteId: quote.quoteId, takerAddress: accountAddress, slippage, executeApprove: true
  }, { baseUrl: appConfig.get('Api.avnu') });
  if (!calls?.length) throw new Error('No swap transaction was returned.');
  const swap = {
    accountAddress, chainId, amount, slippageBps, quote,
    calls: calls.map(call => ({ ...call, calldata: [...call.calldata] })),
    minimumReceived: calculateMinReceivedAmount(BigInt(quote.buyAmount), slippage),
    expiresAt: Math.min(requestedAt + SWAP_REVIEW_LIFETIME_MS, quote.expiry ? quote.expiry * 1000 : Infinity)
  };
  assertSwapCurrent(swap, { accountAddress, chainId });
  return swap;
};
