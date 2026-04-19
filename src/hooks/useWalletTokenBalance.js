import { useQuery } from 'react-query';
import { uint256 } from 'starknet';

import api from '~/lib/api';
import useSession from '~/hooks/useSession';
import { isHybrid } from '~/lib/gameMode';
import { TOKEN } from '~/lib/priceUtils';

// ETH / STRK / USDC aren't modelled server-side in hybrid — keep a fixed mock
// so checkout flows that gate on a non-zero balance don't block. SWAY is the
// one token with real bookkeeping (see server User.swayBalance).
const HYBRID_MOCK_BALANCES = {
  eth: BigInt('50000000000000000000'),
  strk: BigInt('50000000000000000000000'),
  usdc: BigInt('50000000000'),
};

const useWalletTokenBalance = (tokenLabel, tokenAddress, overrideAccount) => {
  const { accountAddress: defaultAccount, provider } = useSession();

  const accountAddress = overrideAccount || defaultAccount;
  const hybrid = isHybrid();

  return useQuery(
    [ 'walletBalance', tokenLabel, accountAddress ],
    async () => {
      if (hybrid) {
        // SWAY: real per-wallet balance from the server (User.swayBalance
        // stored as a wei-string). Everything else is a mocked large number.
        if (tokenLabel === 'sway') {
          try {
            const user = await api.getUser();
            return BigInt(user?.swayBalance || '0');
          } catch (e) {
            console.error('Failed to read SWAY balance', e);
            return 0n;
          }
        }
        return HYBRID_MOCK_BALANCES[tokenLabel] || BigInt('50000000000000000000000');
      }
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
      // In hybrid, poll for SWAY every 30s so the HUD reflects purchases
      // without needing a full page reload. Cheaper than waiting for a socket
      // event given SWAY changes don't currently emit one.
      refetchInterval: hybrid ? (tokenLabel === 'sway' ? 30e3 : false) : 300e3,
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
