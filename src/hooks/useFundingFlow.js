import { useCallback, useState } from 'react';

import useSession from '~/hooks/useSession';
import useWalletPurchasableBalances from '~/hooks/useWalletPurchasableBalances';
import FundingFlow from '~/game/launcher/store/FundingFlow';
import { TOKEN } from '~/lib/priceUtils';
import { getUsdcValue } from '~/lib/funding';

const useFundingFlow = () => {
  const { accountAddress, login } = useSession();
  const { data: wallet } = useWalletPurchasableBalances();
  const [funding, setFunding] = useState();
  const close = useCallback(() => setFunding(undefined), []);

  const onVerifyFunds = useCallback((totalPrice, purchaseFn) => {
    if (!accountAddress) return login();
    if (!wallet) return;

    if (BigInt(Math.ceil(getUsdcValue(totalPrice))) > wallet.tokenBalances[TOKEN.USDC]) {
      setFunding({ accountAddress, totalPrice });
      return;
    }
    return purchaseFn();
  }, [accountAddress, login, wallet]);

  const isFunding = !!funding && funding.accountAddress === accountAddress;
  return {
    isFunding,
    onVerifyFunds,
    fundingPrompt: isFunding ? (
      <FundingFlow totalPrice={funding.totalPrice} onClose={close} onFunded={close} />
    ) : null
  };
};

export default useFundingFlow;
