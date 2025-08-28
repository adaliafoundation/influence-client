import { useQuery } from 'react-query';

import api from '~/lib/api';
import { TOKEN, TOKEN_SCALE } from '~/lib/priceUtils';

const useSwapQuote = (sellToken, buyToken, amount, accountAddress = false) => {
  return useQuery(
    [ 'swapQuote', sellToken, buyToken, amount, accountAddress ],
    async () => {
      const quotes = await api.getSwapQuote({
        sellToken,
        buyToken,
        amount,
        account: accountAddress || undefined
      });
      return quotes?.[0] ? (parseInt(quotes[0].buyAmount) / parseInt(quotes[0].sellAmount)) : 0;
    },
    {
      enabled: !!(sellToken && buyToken),
      refetchInterval: 60e3,
    }
  );
};

export const useSwayPerUsdc = (accountAddress, amount) => {
  return useSwapQuote(
    TOKEN.USDC,
    TOKEN.SWAY,
    amount || (10 * TOKEN_SCALE[TOKEN.USDC]), // approx $10 worth
    accountAddress
  )
};

export const useStrkPerUsdc = (accountAddress, amount) => {
  return useSwapQuote(
    TOKEN.USDC,
    TOKEN.STRK,
    amount || (10 * TOKEN_SCALE[TOKEN.USDC]), // approx $10 worth
    accountAddress
  )
};

export const useUsdcPerEth = (accountAddress, amount) => {
  return useSwapQuote(
    TOKEN.ETH,
    TOKEN.USDC,
    amount || (0.003 * TOKEN_SCALE[TOKEN.ETH]), // approx $10 worth
    accountAddress
  )
};

export default useSwapQuote;
