const { TextDecoder, TextEncoder } = require('util');

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

jest.mock('~/hooks/useStore', () => ({
  __esModule: true,
  default: {
    getState: () => ({ currentSession: {} })
  }
}), { virtual: true });

const { createAuthenticatedPaymasterRpc, isSponsorshipUnavailable } = require('./paymaster');

test('recognizes explicit end-of-sponsorship responses', () => {
  expect(isSponsorshipUnavailable({ status: 402 })).toBe(true);
  expect(isSponsorshipUnavailable({ code: 'SPONSORSHIP_NOT_ELIGIBLE' })).toBe(true);
  expect(isSponsorshipUnavailable({ message: 'Starter pack subsidy has ended' })).toBe(true);
  expect(isSponsorshipUnavailable({ message: 'Transaction is not sponsored' })).toBe(true);
  expect(isSponsorshipUnavailable({
    message: 'Request failed with status code 400',
    response: {
      status: 400,
      data: { message: 'No eligible starter pack purchase for paymaster sponsorship' }
    }
  })).toBe(true);
  expect(isSponsorshipUnavailable({
    response: {
      status: 400,
      data: { message: 'Starter pack paymaster budget exceeded' }
    }
  })).toBe(true);
  expect(isSponsorshipUnavailable({ status: 400, message: 'Invalid paymaster request' })).toBe(false);
  expect(isSponsorshipUnavailable({ status: 500, message: 'Paymaster unavailable' })).toBe(false);
});

test('adds shared Influence auth headers to paymaster requests', async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({
    json: () => Promise.resolve({ result: true })
  });

  const paymaster = createAuthenticatedPaymasterRpc({
    getAuthHeaders: () => ({ Authorization: 'Bearer updated-token' }),
    nodeUrl: 'https://paymaster.example'
  });

  await paymaster.isAvailable();

  expect(global.fetch).toHaveBeenCalledWith('https://paymaster.example', expect.objectContaining({
    headers: expect.objectContaining({
      Authorization: 'Bearer updated-token'
    })
  }));

  global.fetch = originalFetch;
});
