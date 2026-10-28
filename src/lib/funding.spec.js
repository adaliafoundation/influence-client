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
  getUsdcValue,
  normalizeBanxaOrder,
  normalizeBanxaOrderStatus,
  parseBanxaReturnUrl
} = require('./funding');
const { TOKEN } = require('./priceUtils');

const createPrice = (usdcValue) => ({
  to: (token) => {
    if (token !== TOKEN.USDC) throw new Error(`Unexpected token ${token}`);
    return usdcValue;
  }
});

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

});
