import { useEffect, useMemo } from 'react';

import useStore from '~/hooks/useStore';
import useWalletPurchasableBalances from '~/hooks/useWalletPurchasableBalances';
import api from '~/lib/api';
import { normalizeBanxaOrder } from '~/lib/funding';
import { TOKEN, TOKEN_FORMAT, TOKEN_FORMATTER } from '~/lib/priceUtils';
import { safeBigInt } from '~/lib/utils';

const toBigInt = (value) => {
  if (typeof value === 'bigint') return value;
  if (value === undefined || value === null) return 0n;
  try {
    return BigInt(value);
  } catch (e) {
    return 0n;
  }
};

const useFundingIntentMonitor = (intent, { enabled = true, notifyOnComplete = true, onComplete } = {}) => {
  const createAlert = useStore(s => s.dispatchAlertLogged);
  const dispatchFundingIntentCleared = useStore(s => s.dispatchFundingIntentCleared);
  const dispatchFundingIntentUpdated = useStore(s => s.dispatchFundingIntentUpdated);
  const { data: wallet, refetch: refetchBalances } = useWalletPurchasableBalances();
  const hasCompletedProviderOrder = intent?.provider !== 'banxa' || intent?.status === 'completed';

  const fundingStatus = useMemo(() => {
    if (!intent || !wallet) return {};

    const startingUsdc = toBigInt(intent.startingTokenBalances?.[TOKEN.USDC]);
    const currentUsdc = toBigInt(wallet.tokenBalances?.[TOKEN.USDC]);
    const targetUsdcValue = Number(intent.targetUsdcValue || 0);
    const hasBalanceIncrease = currentUsdc > startingUsdc;
    const hasTargetBalance = !targetUsdcValue || wallet.combinedBalance?.usdcValue >= targetUsdcValue;

    return {
      currentUsdc,
      hasBalanceIncrease,
      hasTargetBalance,
      startingUsdc
    };
  }, [intent, wallet]);

  useEffect(() => {
    if (!enabled || !intent) return;
    if (intent.provider === 'banxa' && !hasCompletedProviderOrder) return;

    const i = setInterval(() => {
      refetchBalances();
    }, 10e3);
    return () => {
      if (i) clearInterval(i);
    };
  }, [enabled, hasCompletedProviderOrder, intent, refetchBalances]);

  useEffect(() => {
    if (
      !enabled
      || intent?.provider !== 'banxa'
      || !intent.orderId
      || ['completed', 'failed', 'cancelled'].includes(intent.status)
    ) return;
    let cancelled = false;

    const pollOrder = async () => {
      try {
        const order = normalizeBanxaOrder(await api.getBanxaOrder(intent.orderId));
        if (cancelled) return;

        dispatchFundingIntentUpdated(intent.id, {
          providerStatus: order,
          status: order.status,
          statusUrl: order.statusUrl || intent.statusUrl
        });

        if (order.status === 'completed') {
          refetchBalances();
        } else if (['failed', 'cancelled'].includes(order.status)) {
          createAlert({
            type: 'GenericAlert',
            data: { content: order.status === 'cancelled' ? 'Banxa order cancelled.' : 'Banxa order failed.' },
            level: 'warning',
            duration: 5e3
          });
        }
      } catch (e) {
        console.error('Error checking Banxa order:', e);
      }
    };

    pollOrder();
    const i = setInterval(pollOrder, 60e3);
    return () => {
      cancelled = true;
      if (i) clearInterval(i);
    };
  }, [
    createAlert,
    dispatchFundingIntentCleared,
    dispatchFundingIntentUpdated,
    enabled,
    intent?.id,
    intent?.orderId,
    intent?.provider,
    intent?.status,
    intent?.statusUrl,
    refetchBalances
  ]);

  useEffect(() => {
    if (!enabled || !intent || !hasCompletedProviderOrder || !fundingStatus.hasBalanceIncrease || !fundingStatus.hasTargetBalance) return;

    const increaseAmount = fundingStatus.currentUsdc - fundingStatus.startingUsdc;
    dispatchFundingIntentCleared(intent.id);
    if (notifyOnComplete) {
      createAlert({
        type: 'GenericAlert',
        data: { content: <>{TOKEN_FORMATTER[TOKEN.USDC](safeBigInt(increaseAmount), TOKEN_FORMAT.VERBOSE)} received. You can continue your purchase.</> },
        duration: 5e3
      });
    }
    if (onComplete) onComplete(wallet);
  }, [
    createAlert,
    dispatchFundingIntentCleared,
    enabled,
    fundingStatus.currentUsdc,
    fundingStatus.hasBalanceIncrease,
    fundingStatus.hasTargetBalance,
    fundingStatus.startingUsdc,
    hasCompletedProviderOrder,
    intent,
    notifyOnComplete,
    onComplete,
    wallet
  ]);

  return {
    ...fundingStatus,
    wallet
  };
};

export default useFundingIntentMonitor;
