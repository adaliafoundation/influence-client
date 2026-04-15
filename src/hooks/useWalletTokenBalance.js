import { useQuery } from 'react-query';
import { uint256 } from 'starknet';

import useSession from '~/hooks/useSession';
import { isHybrid } from '~/lib/gameMode';
import { TOKEN } from '~/lib/priceUtils';

// In hybrid mode, return a large mock balance since there are no on-chain
// tokens. Keyed by token label to respect each token's decimal places.
const HYBRID_MOCK_BALANCES = {
  eth: BigInt('50000000000000000000'),     // 50 ETH (18 decimals)
  strk: BigInt('50000000000000000000000'), // 50,000 STRK (18 decimals)
  sway: BigInt('50000000000000000000000'), // 50,000 SWAY (18 decimals)
  usdc: BigInt('50000000000'),             // 50,000 USDC (6 decimals)
};

const useWalletTokenBalance = (tokenLabel, tokenAddress, overrideAccount) => {
  const { accountAddress: defaultAccount, provider } = useSession();

  const accountAddress = overrideAccount || defaultAccount;
  const hybrid = isHybrid();

  return useQuery(
    [ 'walletBalance', tokenLabel, accountAddress ],
    async () => {
      if (hybrid) return HYBRID_MOCK_BALANCES[tokenLabel] || BigInt('50000000000000000000000');
      if (!accountAddress) return undefined; // shouldn't happen (but seemingly does)
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
      }
    },
    {
      enabled: hybrid ? !!accountAddress : (!!provider && !!accountAddress),
      refetchInterval: hybrid ? false : 300e3,
    }
  );
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
