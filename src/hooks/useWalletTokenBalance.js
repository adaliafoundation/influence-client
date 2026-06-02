import { useQuery } from '@tanstack/react-query';
import { uint256 } from 'starknet';

import useSession from '~/hooks/useSession';
import { TOKEN } from '~/lib/priceUtils';

const useWalletTokenBalance = (tokenLabel, tokenAddress, overrideAccount) => {
  const { accountAddress: defaultAccount, provider } = useSession();

  const accountAddress = overrideAccount || defaultAccount;
  return useQuery({
    queryKey: [ 'walletBalance', tokenLabel, accountAddress ],
    queryFn: async () => {
      if (!accountAddress || !provider) return 0n;
      try {
        const balance = await provider.callContract({
          contractAddress: tokenAddress,
          entrypoint: 'balanceOf',
          calldata: [accountAddress]
        });
        const standardized = Array.isArray(balance) ? balance : balance?.result;
        return standardized ? uint256.uint256ToBN({ low: standardized[0], high: standardized[1] }) : 0n;
      } catch (e) {
        console.error(e);
        return 0n;
      }
    },
    enabled: !!provider && !!accountAddress,
    // Balance updates are already driven by transaction/activity invalidations.
    // Avoid background polling because each balanceOf is a starknet_call.
    refetchInterval: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });
};

export const useEthBalance = (overrideAccount) => {
  return useWalletTokenBalance('eth', TOKEN.ETH, overrideAccount);
};

export const useStrkBalance = (overrideAccount) => {
  return useWalletTokenBalance('strk', TOKEN.STRK, overrideAccount);
};

export const useSwayBalance = (overrideAccount) => {
  return useWalletTokenBalance('sway', TOKEN.SWAY, overrideAccount);
};

export const useUSDCBalance = (overrideAccount) => {
  return useWalletTokenBalance('usdc', TOKEN.USDC, overrideAccount);
};

export default useWalletTokenBalance;
