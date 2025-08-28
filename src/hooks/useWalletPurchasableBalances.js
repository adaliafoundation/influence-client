import { useMemo } from 'react';

import usePriceConstants from '~/hooks/usePriceConstants';
import usePriceHelper from '~/hooks/usePriceHelper';
import useSession from '~/hooks/useSession';
import useStore from '~/hooks/useStore';
import { useEthBalance, useStrkBalance, useSwayBalance, useUSDCBalance } from '~/hooks/useWalletTokenBalance';
import { TOKEN, TOKEN_SCALE } from '~/lib/priceUtils';
import { safeBigInt } from '~/lib/utils';

// try to keep a reserve for gas equiv to $2 USD
export const GAS_BUFFER_VALUE_USDC = 2 * TOKEN_SCALE[TOKEN.USDC];

const useWalletPurchasableBalances = (overrideAccount) => {
  const { gasTokens } = useSession();
  const { data: priceConstants } = usePriceConstants();
  const { data: ethBalance, isLoading: isLoading1, refetch: refetch1 } = useEthBalance(overrideAccount);
  const { data: usdcBalance, isLoading: isLoading2, refetch: refetch2 } = useUSDCBalance(overrideAccount);
  const { data: strkBalance, isLoading: isLoading3, refetch: refetch3 } = useStrkBalance(overrideAccount);
  const { data: swayBalance, isLoading: isLoading4, refetch: refetch4 } = useSwayBalance(overrideAccount);
  const priceHelper = usePriceHelper();

  const autoswap = useStore(s => s.gameplay.autoswap);

  // for sanity, just assuming this is the same as ASTEROID_PURCHASE_TOKEN *and*
  // is represented in allTokens list...
  const baseToken = priceConstants?.ADALIAN_PURCHASE_TOKEN;

  const maintainGasReserve = useMemo(() => {
    // if can pay fees in sway and have >=10% of target reserve amount available in sway, don't need a reserve
    if (gasTokens?.includes(TOKEN.SWAY)) {
      if (swayBalance >= priceHelper.from(GAS_BUFFER_VALUE_USDC * 0.1, TOKEN.USDC).to(TOKEN.SWAY)) {
        return false;
      }
    }
    // if can pay fees in strk and have >=10% of target reserve amount available in strk, don't need a reserve
    if (gasTokens?.includes(TOKEN.STRK)) {
      if (strkBalance >= priceHelper.from(GAS_BUFFER_VALUE_USDC * 0.1, TOKEN.USDC).to(TOKEN.STRK)) {
        return false;
      }
    }
    // else, need a reserve
    return true;
  }, [gasTokens, priceHelper, strkBalance, swayBalance]);

  const [usdcGasReserveBalance, ethGasReserveBalance] = useMemo(() => {
    let usdcReserve = priceHelper.from(0n, TOKEN.USDC);
    let ethReserve = priceHelper.from(0n, TOKEN.ETH);
    if (maintainGasReserve) {
      if (gasTokens?.includes(TOKEN.USDC)) {
        usdcReserve = priceHelper.from((usdcBalance < GAS_BUFFER_VALUE_USDC ? usdcBalance : GAS_BUFFER_VALUE_USDC), TOKEN.USDC);
      }
      if (gasTokens?.includes(TOKEN.ETH) && !(usdcReserve?.usdcValue > 0)) {
        const ethValueInUSDC = Math.floor(priceHelper.from(ethBalance, TOKEN.ETH)?.usdcValue);
        ethReserve = priceHelper.from((ethValueInUSDC < GAS_BUFFER_VALUE_USDC ? ethValueInUSDC : GAS_BUFFER_VALUE_USDC), TOKEN.USDC);
      }
    }
    return [usdcReserve, ethReserve];
  }, [maintainGasReserve, gasTokens, ethBalance, usdcBalance, priceHelper]);

  // NOTE: do not add SWAY here unless want SWAY to be auto-swappable for
  //  purchases (i.e. crewmates, starter packs, etc)
  const swappableTokenBalances = useMemo(() => {
    const allTokens = {
      [TOKEN.ETH]: ethBalance ? (ethBalance - safeBigInt(Math.floor(ethGasReserveBalance.to(TOKEN.ETH)))) : 0n,
      [TOKEN.USDC]: usdcBalance ? (usdcBalance - safeBigInt(Math.floor(usdcGasReserveBalance.to(TOKEN.USDC)))) : 0n,
    };

    // if autoswap, return allTokens... else, return just the specified purchase token
    return autoswap ? allTokens : { [baseToken]: allTokens[baseToken] };
  }, [autoswap, baseToken, ethBalance, ethGasReserveBalance, usdcBalance]);

  const isLoading = isLoading1 || isLoading2 || isLoading3 || isLoading4;
  return useMemo(() => {
    if (isLoading) return { data: null, refetch: () => {}, isLoading: true };

    const combinedBalance = priceHelper.from(0n);
    Object.keys(swappableTokenBalances).forEach((tokenAddress) => {
      combinedBalance.usdcValue += priceHelper.from(swappableTokenBalances[tokenAddress], tokenAddress)?.usdcValue;
    });

    return {
      data: {
        combinedBalance,
        shouldMaintainGasReserve: maintainGasReserve,
        ethGasReserveBalance,
        usdcGasReserveBalance,
        tokenBalances: swappableTokenBalances
      },
      refetch: () => {
        refetch1();
        refetch2();
        refetch3();
        refetch4();
      },
      isLoading
    };
  }, [ethGasReserveBalance, usdcGasReserveBalance, isLoading, maintainGasReserve, priceHelper, refetch1, refetch2, refetch3, refetch4, swappableTokenBalances]);
}

export default useWalletPurchasableBalances;