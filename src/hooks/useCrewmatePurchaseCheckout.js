import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import useSession from '~/hooks/useSession';
import api from '~/lib/api';
import { CREWMATE_PURCHASE_STATUSES, isCrewmatePurchaseCheckoutActive, isCrewmatePurchaseCustomizable } from '~/lib/crewmatePurchases';

const useCrewmatePurchaseCheckout = (checkoutSessionId, checkoutCustomization) => {
  const { accountAddress, authenticated } = useSession();
  const queryClient = useQueryClient();
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
  }, [accountAddress, authenticated, checkoutSessionId, queryClient]);

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
