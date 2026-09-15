import { PaymasterRpc } from 'starknet';

import { getApiAuthHeaders } from './apiAuth';

export const isSponsorshipUnavailable = (error) => {
  const code = `${error?.code || error?.response?.data?.code || ''}`.toUpperCase();
  const message = `${error?.response?.data?.message || error?.message || ''}`;
  const status = Number(error?.status || error?.response?.status || 0);

  return status === 402
    || code === 'SPONSORSHIP_UNAVAILABLE'
    || code === 'SPONSORSHIP_NOT_ELIGIBLE'
    || /no eligible starter pack purchase for paymaster sponsorship/i.test(message)
    || /starter pack paymaster budget exceeded/i.test(message)
    || /(?:not sponsored|(?:sponsor|subsid).*(?:ended|expired|ineligible|not eligible|unavailable))/i.test(message);
};

export const createAuthenticatedPaymasterRpc = ({ getAuthHeaders = getApiAuthHeaders, nodeUrl }) => new PaymasterRpc({
  nodeUrl,
  baseFetch: (url, options = {}) => {
    const headers = {
      ...(options.headers || {}),
      ...getAuthHeaders()
    };

    return fetch(url, {
      ...options,
      headers
    });
  }
});
