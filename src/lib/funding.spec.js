const { TextDecoder, TextEncoder } = require('util');

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

jest.mock('~/appConfig', () => ({
  appConfig: {
    get: (key) => ({
      'Starknet.Address.ethToken': '0x1',
      'Starknet.Address.strkToken': '0x2',
      'Starknet.Address.swayToken': '0x3',
      'Starknet.Address.usdcToken': '0x4'
    })[key]
  }
}), { virtual: true });

jest.mock('~/components/Icons', () => ({
  EthIcon: () => null,
  SwayIcon: () => null
}), { virtual: true });

const {
  BANXA_DEFAULTS,
  buildBanxaStatusUrl,
  getFundingAmountUsdc,
  getTokenSwapRequirements,
  getUsdcValue,
  normalizeBanxaOrder,
  normalizeBanxaOrderStatus,
  parseBanxaReturnUrl
} = require('./funding');
const { TOKEN, TOKEN_SCALE } = require('./priceUtils');

const createPrice = (usdcValue) => ({
  to: (token) => {
    if (token !== TOKEN.USDC) throw new Error(`Unexpected token ${token}`);
    return usdcValue;
  }
});

const priceHelper = {
  from: (amount, token) => ({
    to: (targetToken) => {
      if (token === TOKEN.USDC && targetToken === TOKEN.ETH) return Number(amount) * 10;
      if (token === TOKEN.USDC && targetToken === TOKEN.STRK) return Number(amount) * 2;
      if (token === TOKEN.ETH && targetToken === TOKEN.USDC) return Number(amount) / 10;
      if (token === TOKEN.STRK && targetToken === TOKEN.USDC) return Number(amount) / 2;
      if (token === targetToken) return Number(amount);
      throw new Error(`Unexpected conversion ${token} -> ${targetToken}`);
    }
  })
};

describe('funding utils', () => {
  it('returns unscaled USDC funding amounts', () => {
    expect(getUsdcValue(createPrice(12.5e6))).toBe(12.5e6);
    expect(getFundingAmountUsdc(createPrice(12.5e6))).toBe(13);
  });

  it('keeps Banxa order defaults scoped to USDC on Starknet', () => {
    expect(BANXA_DEFAULTS).toEqual({
      blockchain: 'STARK',
      crypto: 'USDC',
      fiat: 'USD'
    });
  });

  it('normalizes Banxa order statuses from server responses', () => {
    expect(normalizeBanxaOrderStatus('completed')).toBe('completed');
    expect(normalizeBanxaOrderStatus('complete')).toBe('completed');
    expect(normalizeBanxaOrderStatus('checkout_created')).toBe('pending');
    expect(normalizeBanxaOrderStatus('cancelled')).toBe('cancelled');
    expect(normalizeBanxaOrderStatus('declined')).toBe('failed');
    expect(normalizeBanxaOrderStatus('inProgress')).toBe('pending');
  });

  it('normalizes Banxa order response shape for checkout and polling', () => {
    expect(normalizeBanxaOrder({
      order: {
        checkoutUrl: 'https://checkout.banxa.com/order',
        id: 'order_123',
        status: 'completed',
        statusUrl: 'https://checkout.banxa.com/status/order_123'
      }
    })).toEqual(expect.objectContaining({
      checkoutUrl: 'https://checkout.banxa.com/order',
      id: 'order_123',
      rawStatus: 'completed',
      status: 'completed',
      statusUrl: 'https://checkout.banxa.com/status/order_123'
    }));
  });

  it('builds a Banxa status URL from the returned order reference', () => {
    expect(buildBanxaStatusUrl({
      baseUrl: 'https://influence.banxa-sandbox.com/',
      orderRef: 'order_123'
    })).toBe('https://influence.banxa-sandbox.com/status/order_123');
  });

  it('parses Banxa callback status fields', () => {
    expect(parseBanxaReturnUrl({
      baseUrl: 'https://influence.banxa-sandbox.com/',
      href: 'https://game.example/?orderId=42&orderRef=order_123&orderStatus=inProgress&paymentStatus=paymentReceived&fulfillmentStatus=pending&identityStatus=approved'
    })).toEqual({
      orderId: '42',
      orderRef: 'order_123',
      providerStatus: {
        fulfillmentStatus: 'pending',
        identityStatus: 'approved',
        orderStatus: 'inProgress',
        paymentStatus: 'paymentReceived'
      },
      statusUrl: 'https://influence.banxa-sandbox.com/status/order_123'
    });
  });

  it('describes the token swaps needed above the USDC balance', () => {
    const swaps = getTokenSwapRequirements({
      priceHelper,
      targetUsdcValue: 25 * TOKEN_SCALE[TOKEN.USDC],
      tokenBalances: {
        [TOKEN.USDC]: 5n * BigInt(TOKEN_SCALE[TOKEN.USDC]),
        [TOKEN.ETH]: 80n * BigInt(TOKEN_SCALE[TOKEN.USDC]),
        [TOKEN.STRK]: 40n * BigInt(TOKEN_SCALE[TOKEN.USDC])
      }
    });

    expect(swaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ token: TOKEN.ETH, amount: 80 * TOKEN_SCALE[TOKEN.USDC] }),
      expect.objectContaining({ token: TOKEN.STRK, amount: 24 * TOKEN_SCALE[TOKEN.USDC] })
    ]));
  });
});
