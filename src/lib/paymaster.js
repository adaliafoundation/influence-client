import { LibraryError, PaymasterRpc } from 'starknet';

import { getApiAuthHeaders } from './apiAuth';

export const isSponsorshipUnavailable = (error) => {
  const code = `${error?.code || error?.response?.data?.code || ''}`.toUpperCase();
  const message = `${error?.response?.data?.message || error?.message || ''}`;
  const status = Number(error?.status || error?.response?.status || 0);

  return status === 402
    || code === 'SPONSORSHIP_UNAVAILABLE'
    || code === 'SPONSORSHIP_NOT_ELIGIBLE'
    || /SPONSORSHIP_(?:UNAVAILABLE|NOT_ELIGIBLE)/i.test(message)
    || /no eligible starter pack purchase for paymaster sponsorship/i.test(message)
    || /starter pack paymaster budget exceeded/i.test(message)
    || /(?:not sponsored|(?:sponsor|subsid).*(?:ended|expired|ineligible|not eligible|unavailable))/i.test(message);
};

export const isPaymasterUnavailable = (error) => {
  const status = Number(error?.status || error?.response?.status || 0);
  // An execution request may have landed despite a lost response. Do not resubmit it.
  if (error?.paymasterMethod === 'paymaster_executeTransaction' && status !== 404 && status !== 429) return false;
  return status === 404 || status === 429 || status >= 500
    || /paymaster.*(?:unavailable|not available)|fetch failed|failed to fetch|network error/i.test(error?.message || '');
};

export const createPaymasterRpc = ({ getAuthHeaders = () => ({}), nodeUrl }) => new PaymasterRpc({
  nodeUrl,
  baseFetch: async (url, options = {}) => {
    const headers = {
      ...(options.headers || {}),
      ...getAuthHeaders()
    };

    const paymasterMethod = JSON.parse(options.body).method;
    let response;
    try {
      response = await fetch(url, { ...options, headers });
    } catch (cause) {
      const error = new LibraryError(`Paymaster network error: ${cause.message}`);
      error.paymasterMethod = paymasterMethod;
      throw error;
    }

    // Preserve HTTP failures before Starknet attempts to parse an RPC response.
    if (response.ok === false) {
      const body = await response.text();
      const error = new LibraryError(`Paymaster request failed (${response.status}): ${body}`);
      error.status = response.status;
      error.paymasterMethod = paymasterMethod;
      throw error;
    }
    return response;
  }
});

export const createAuthenticatedPaymasterRpc = (options) => createPaymasterRpc({
  getAuthHeaders: getApiAuthHeaders,
  ...options
});
