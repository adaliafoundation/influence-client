import { useContext, useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import useSession from '~/hooks/useSession';
import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import api from '~/lib/api';
import { CREWMATE_PURCHASE_STATUSES, isCrewmatePurchaseCheckoutActive, isCrewmatePurchaseCustomizable } from '~/lib/crewmatePurchases';

const useCrewmatePurchaseCheckout = (checkoutSessionId, checkoutCustomization) => {
  const { accountAddress, authenticated, walletCapabilities } = useSession();
  const { deployAccount } = useContext(ChainTransactionContext);
  const queryClient = useQueryClient();
  const identity = useRef();
  identity.current = { accountAddress, authenticated, checkoutSessionId };
  const submitting = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const automaticSubmissionAttempt = useRef();
  const [automaticSubmissionError, setAutomaticSubmissionError] = useState(null);
  const queryKey = ['crewmatePurchaseCheckout', accountAddress, checkoutSessionId];
  const query = useQuery({
    queryKey,
    queryFn: () => api.getCrewmatePurchaseCheckout(checkoutSessionId),
    enabled: !!authenticated && !!accountAddress && !!checkoutSessionId,
    refetchInterval: (result) => isCrewmatePurchaseCheckoutActive(result.state.data?.purchase?.status) ? 5000 : false
  });
  const submitCustomization = useCallback(async (grantRequest) => {
    const purchase = queryClient.getQueryData(['crewmatePurchaseCheckout', accountAddress, checkoutSessionId])?.purchase;
    if (submitting.current || !authenticated || !isCrewmatePurchaseCustomizable(purchase)) return;
    submitting.current = true;
    setIsSubmitting(true);
    try {
      if (walletCapabilities?.requiresSponsoredTransactions) await deployAccount();
      // Deployment may require user interaction; recheck identity before granting.
      const current = identity.current;
      if (!current.authenticated || current.accountAddress !== accountAddress || current.checkoutSessionId !== checkoutSessionId) {
        throw new Error('Account or purchase changed. Please retry recruitment.');
      }
      const response = await api.submitCrewmatePurchaseCustomization({ purchaseId: purchase.id, grantRequest });
      queryClient.setQueryData(['crewmatePurchaseCheckout', accountAddress, checkoutSessionId], (current = {}) => ({
        ...current,
        purchase: response.purchase
      }));
      queryClient.invalidateQueries({ queryKey: ['pendingCrewmatePurchases', accountAddress] });
      return response;
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  }, [accountAddress, authenticated, checkoutSessionId, deployAccount, queryClient, walletCapabilities?.requiresSponsoredTransactions]);

  // Only a checkout started on this mounted page carries the already-confirmed customization.
  // A restored session has no such snapshot and must be reviewed before submission.
  useEffect(() => {
    if (!authenticated || !checkoutCustomization || automaticSubmissionAttempt.current === checkoutCustomization) return;
    if (checkoutCustomization.accountAddress !== accountAddress || checkoutCustomization.checkoutSessionId !== checkoutSessionId) return;
    if (query.data?.purchase?.status !== CREWMATE_PURCHASE_STATUSES.PAID_PENDING_CUSTOMIZATION) return;

    automaticSubmissionAttempt.current = checkoutCustomization;
    setAutomaticSubmissionError(null);
    submitCustomization(checkoutCustomization.grantRequest).catch(setAutomaticSubmissionError);
  }, [accountAddress, authenticated, checkoutCustomization, checkoutSessionId, query.data?.purchase?.status, submitCustomization]);

  return { ...query, automaticSubmissionError, isSubmitting, submitCustomization };
};

export default useCrewmatePurchaseCheckout;
