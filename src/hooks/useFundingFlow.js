import { useCallback, useEffect, useRef, useState } from 'react';

import useSession from '~/hooks/useSession';
import useWalletPurchasableBalances from '~/hooks/useWalletPurchasableBalances';
import FundingFlow from '~/game/launcher/store/FundingFlow';
import { TOKEN } from '~/lib/priceUtils';

const useFundWrapper = () => {
  const { accountAddress, login } = useSession();
  const { data: wallet } = useWalletPurchasableBalances();

  const onFunded = useRef();
  const [isFunding, setIsFunding] = useState();
  const [isFunded, setIsFunded] = useState();

  const onVerifyFunds = useCallback((totalPrice, purchaseFn) => {
    if (!accountAddress) return login();
    if (true || totalPrice.usdcValue > wallet?.combinedBalance?.to(TOKEN.USDC)) {
      onFunded.current = purchaseFn;
      setIsFunding({
        totalPrice,
        onClose: () => {
          setIsFunding();
        },
        onFunded: () => {
          setIsFunded(true);
        }
      });
    } else {
      purchaseFn();
    }
  }, [accountAddress, login, wallet?.combinedBalance]);

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