import { TOKEN, TOKEN_FORMATTER, TOKEN_SCALE } from './priceUtils';

export const BANXA_DEFAULTS = {
  blockchain: 'STARK',
  crypto: 'USDC',
  fiat: 'USD'
};

const BANXA_COMPLETED_STATUSES = ['complete', 'completed'];
const BANXA_CANCELLED_STATUSES = ['cancelled', 'canceled'];
const BANXA_FAILED_STATUSES = ['declined', 'expired', 'failed', 'rejected'];

export const getUsdcValue = (price) => (
  price ? Number(price.to(TOKEN.USDC)) : 0
);

export const getFundingAmountUsdc = (price) => (
  Math.max(0, Math.ceil(getUsdcValue(price) / TOKEN_SCALE[TOKEN.USDC]))
);

export const getTokenSwapRequirements = ({ priceHelper, targetUsdcValue, tokenBalances = {} }) => {
  let remaining = Math.max(0, targetUsdcValue - Number(tokenBalances[TOKEN.USDC] || 0n));
  const swaps = [];

  [TOKEN.ETH, TOKEN.STRK].forEach((token) => {
    if (remaining <= 0) return;

    const balance = Number(tokenBalances[token] || 0n);
    if (balance <= 0) return;

    const required = priceHelper.from(remaining, TOKEN.USDC).to(token);
    const amount = Math.min(Number(required), balance);
    if (amount <= 0) return;

    swaps.push({
      amount,
      label: TOKEN_FORMATTER[token](BigInt(Math.ceil(amount))),
      token
    });
    remaining -= Number(priceHelper.from(amount, token).to(TOKEN.USDC));
  });

  return swaps;
};

export const buildBanxaStatusUrl = ({ baseUrl, orderRef }) => {
  if (!baseUrl || !orderRef) return null;

  const url = new URL(baseUrl);
  return `${url.origin}/status/${orderRef}`;
};

export const normalizeBanxaOrderStatus = (status) => {
  if (!status) return 'pending';
  const normalized = String(status).toLowerCase();
  if (BANXA_COMPLETED_STATUSES.includes(normalized)) return 'completed';
  if (BANXA_CANCELLED_STATUSES.includes(normalized)) return 'cancelled';
  if (BANXA_FAILED_STATUSES.includes(normalized)) return 'failed';
  return 'pending';
};

export const normalizeBanxaOrder = (payload) => {
  const order = payload?.order || payload || {};

  return {
    ...order,
    checkoutUrl: order.checkoutUrl || payload?.checkoutUrl,
    id: order.id || order.orderId || payload?.orderId,
    rawStatus: order.status || payload?.status,
    status: normalizeBanxaOrderStatus(order.status || payload?.status),
    statusUrl: order.statusUrl || payload?.statusUrl
  };
};

export const parseBanxaReturnUrl = ({ baseUrl, href }) => {
  if (!href) return null;

  const pageOrigin = typeof window !== 'undefined' ? window.location.origin : undefined;
  const url = new URL(href, pageOrigin);
  const orderId = url.searchParams.get('orderId');
  const orderRef = url.searchParams.get('orderRef');
  if (!orderId && !orderRef) return null;

  return {
    orderId,
    orderRef,
    providerStatus: {
      fulfillmentStatus: url.searchParams.get('fulfillmentStatus'),
      identityStatus: url.searchParams.get('identityStatus'),
      orderStatus: url.searchParams.get('orderStatus'),
      paymentStatus: url.searchParams.get('paymentStatus')
    },
    statusUrl: buildBanxaStatusUrl({ baseUrl, orderRef })
  };
};

export const createClientFundingIntent = ({
  accountAddress,
  amountUsdc,
  checkoutUrl,
  orderId,
  provider = 'banxa',
  providerStatus,
  startingTokenBalances,
  status = 'pending',
  statusUrl,
  targetUsdcValue
}) => ({
  id: `${provider}_${accountAddress}_${Date.now()}`,
  accountAddress,
  amountUsdc,
  checkoutUrl,
  createdAt: Date.now(),
  orderId,
  provider,
  providerStatus,
  startingTokenBalances,
  status,
  statusUrl,
  targetUsdcValue,
  updatedAt: Date.now()
});
