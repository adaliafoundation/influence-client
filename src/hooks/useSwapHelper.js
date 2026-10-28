import { useCallback } from 'react';
import useSession from '~/hooks/useSession';
import { prepareSwaySwap } from '~/lib/swaySwap';

const useSwapHelper = () => {
  const { accountAddress, chainId } = useSession();
  return useCallback((amount, slippageBps) => (
    prepareSwaySwap({ accountAddress, chainId, amount, slippageBps })
  ), [accountAddress, chainId]);
};

export default useSwapHelper;
