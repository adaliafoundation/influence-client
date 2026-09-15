import { useCallback, useEffect, useRef, useState } from 'react';

import useSession from '~/hooks/useSession';
import useWalletPurchasableBalances from '~/hooks/useWalletPurchasableBalances';
import usePriceHelper from '~/hooks/usePriceHelper';
import FundingFlow from '~/game/launcher/store/FundingFlow';
import { TOKEN } from '~/lib/priceUtils';
import { getTokenSwapRequirements, getUsdcValue } from '~/lib/funding';

const useFundWrapper = () => {
  const { accountAddress, login } = useSession();
  const { data: wallet } = useWalletPurchasableBalances();
  const priceHelper = usePriceHelper();

  const onFunded = useRef();
  const [isFunding, setIsFunding] = useState();
  const [isFunded, setIsFunded] = useState();

  const onVerifyFunds = useCallback((totalPrice, purchaseFn, options = {}) => {
    if (!accountAddress) return login();

    if (!wallet) return;

    const targetUsdcValue = getUsdcValue(totalPrice);
    if (targetUsdcValue > wallet?.combinedBalance?.to(TOKEN.USDC)) {
      onFunded.current = purchaseFn;
      setIsFunding({
        primaryAction: options.primaryAction,
        totalPrice,
        onClose: () => {
          setIsFunding();
        },
        onFunded: () => {
          setIsFunded(true);
        }
      });
    } else if (targetUsdcValue > Number(wallet?.tokenBalances?.[TOKEN.USDC] || 0n)) {
      setIsFunding({
        mode: 'swap',
        onClose: () => {
          setIsFunding();
        },
        onFunded: purchaseFn,
        swapRequirements: getTokenSwapRequirements({
          priceHelper,
          targetUsdcValue,
          tokenBalances: wallet?.tokenBalances
        }),
        totalPrice
      });
    } else {
      purchaseFn();
    }
  }, [accountAddress, login, priceHelper, wallet?.combinedBalance, wallet?.tokenBalances]);

  useEffect(() => {
    if (isFunded && onFunded.current) {
      setTimeout(() => {
        onFunded.current();

        // cleanup
        onFunded.current = null;
        setIsFunded();
      }, 100);
    }
  }, [isFunded]);

  return {
    isFunding: !!isFunding,
    onVerifyFunds,
    fundingPrompt: isFunding ? <FundingFlow {...isFunding} /> : null
  }
}

export default useFundWrapper;
