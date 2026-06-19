import { useCallback, useMemo, useRef } from 'react';
import { quoteToCalls } from '@avnu/avnu-sdk';

import { appConfig } from '~/appConfig';
import useStore from '~/hooks/useStore';
import useWalletPurchasableBalances from '~/hooks/useWalletPurchasableBalances';
import { TOKEN } from '~/lib/priceUtils';
import usePriceHelper from '~/hooks/usePriceHelper';
import api from '~/lib/api';
import useSession from '~/hooks/useSession';

const avnuOptions = { baseUrl: appConfig.get('Api.avnu') };

const useSwapHelper = () => {
  const { accountAddress } = useSession();
  const { data: walletSource } = useWalletPurchasableBalances();
  
  const priceHelper = usePriceHelper();
  const preferredUiCurrency = useStore(s => s.getPreferredUiCurrency());

  // using a ref since execute is often called from a callback from funding (and
  // it may not reliably get re-memoized with updated wallet values within callback)
  const walletRef = useRef();
  walletRef.current = walletSource;

  const buildMultiswapFromSellAmount = useCallback(async (sellAmountUSDC, targetToken, allowableSlippage = 0.1) => {
    const swappableTokens = Object.keys(walletRef.current?.tokenBalances).filter((t) => !!t && t !== targetToken);
    swappableTokens.sort((a) => a === preferredUiCurrency ? -1 : 1);
    
    const calls = [];
    const initialTargetUSDC = (sellAmountUSDC || 0);
    let remainingTargetUSDC = initialTargetUSDC;
    for (let i = 0; i < swappableTokens.length; i++) {
      const token = swappableTokens[i];
      const sellAmount = Math.min(
        priceHelper.from(remainingTargetUSDC, TOKEN.USDC).to(token),
        parseInt(walletRef.current.tokenBalances[token])
      );
      // (if remainingTarget < 0.1% of original, assume rounding error and no need to add additional swaps)
      if (sellAmount > 0 && remainingTargetUSDC > initialTargetUSDC * 0.001) {
        const quotes = await api.getSwapQuote({
          sellToken: token,
          buyToken: targetToken,
          amount: sellAmount,
          account: accountAddress
        });
        if (quotes?.[0]) {
          remainingTargetUSDC -= priceHelper.from(sellAmount, token).to(TOKEN.USDC);

          const swapTx = await quoteToCalls({
            quoteId: quotes?.[0].quoteId,
            takerAddress: accountAddress,
            slippage: allowableSlippage,
            executeApprove: true,
          }, avnuOptions);
          calls.push(...swapTx.calls);
        }
      }
    }

    if (remainingTargetUSDC > initialTargetUSDC * allowableSlippage) {
      return false;
    }
    return calls;
  }, [accountAddress, priceHelper]);

  return useMemo(
    () => ({ buildMultiswapFromSellAmount }),
    [buildMultiswapFromSellAmount]
  );
};

export default useSwapHelper;
