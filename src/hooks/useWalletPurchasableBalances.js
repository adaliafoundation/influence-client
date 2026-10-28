import { useMemo } from 'react';
import { useUSDCBalance } from '~/hooks/useWalletTokenBalance';
import { TOKEN } from '~/lib/priceUtils';

const useWalletPurchasableBalances = (overrideAccount) => {
  const { data: balance, isLoading, refetch } = useUSDCBalance(overrideAccount);
  return useMemo(() => ({
    data: balance === undefined ? null : { tokenBalances: { [TOKEN.USDC]: balance } },
    isLoading,
    refetch
  }), [balance, isLoading, refetch]);
};

export default useWalletPurchasableBalances;
