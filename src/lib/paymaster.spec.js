const { TextDecoder, TextEncoder } = require('util');

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

jest.mock('~/hooks/useStore', () => ({
  __esModule: true,
  default: {
    getState: () => ({ currentSession: {} })
  }
}), { virtual: true });

const { createAuthenticatedPaymasterRpc, createPaymasterRpc, isPaymasterUnavailable, isSponsorshipUnavailable } = require('./paymaster');

test.each(['network', '503'])('only retries %s failures before submission', async (failure) => {
  const originalFetch = global.fetch;
  global.fetch = failure === 'network'
    ? jest.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    : jest.fn().mockResolvedValue({ ok: false, status: 503, text: async () => 'Unavailable' });
  try {
    const paymaster = createPaymasterRpc({ nodeUrl: 'https://paymaster.example' });
    const buildError = await paymaster.fetchEndpoint('paymaster_buildTransaction', {}).catch((error) => error);
    expect(isPaymasterUnavailable(buildError)).toBe(true);
    const submissionError = await paymaster.fetchEndpoint('paymaster_executeTransaction', {}).catch((error) => error);
    expect(submissionError.paymasterMethod).toBe('paymaster_executeTransaction');
    expect(isPaymasterUnavailable(submissionError)).toBe(false);
  } finally {
    global.fetch = originalFetch;
  }
});

test.each([404, 429, 503])('preserves HTTP %s even when the paymaster returns HTML', async (status) => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status, text: async () => '<html>Unavailable</html>' });
  try {
    const paymaster = createPaymasterRpc({ nodeUrl: 'https://paymaster.example' });
    const error = await paymaster.isAvailable().catch((error) => error);
    expect(error.status).toBe(status);
    expect(isPaymasterUnavailable(error)).toBe(true);
    expect(isSponsorshipUnavailable(error)).toBe(false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('recognizes an exhausted sponsorship returned over HTTP', async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({
    ok: false, status: 400,
    text: async () => JSON.stringify({ message: 'Starter pack paymaster budget exceeded' })
  });
  try {
    const paymaster = createAuthenticatedPaymasterRpc({ nodeUrl: 'https://paymaster.example' });
    const error = await paymaster.isAvailable().catch((error) => error);
    expect(isSponsorshipUnavailable(error)).toBe(true);
    expect(isPaymasterUnavailable(error)).toBe(false);
  } finally {
    global.fetch = originalFetch;
  }
});

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
