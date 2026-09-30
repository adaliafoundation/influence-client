import { useCallback, useContext, useMemo } from 'react';

import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useCrewContext from '~/hooks/useCrewContext';

const useDepositSaleManager = (deposit) => {
  const { crew } = useCrewContext();
  const { execute, getStatus } = useContext(ChainTransactionContext);

  const payload = useMemo(() => ({
    deposit: { id: deposit?.id, label: deposit?.label },
    caller_crew: { id: crew?.id, label: crew?.label },
  }), [crew, deposit]);

  const meta = useMemo(() => ({
    deposit
  }), [deposit]);

  const purchaseListing = useCallback(() => {
    return execute(
      'PurchaseDeposit',
      payload,
      meta
    )
  }, [execute, meta, payload]);

  const updateListing = useCallback(
    (price) => {
      if (price > 0) {
        return execute(
          'ListDepositForSale',
          { ...payload, price: price * 1e6 },
          meta
        )
      } else {
        return execute(
          'UnlistDepositForSale',
          payload,
          meta
        )
      }
    },
    [execute, meta, payload]
  );

  const isPendingPurchase = useMemo(() => getStatus('PurchaseDeposit', payload) === 'pending', [getStatus, payload]);
  const isPendingUpdate = useMemo(() => (
    getStatus('ListDepositForSale', payload) === 'pending'
    || getStatus('UnlistDepositForSale', payload) === 'pending'
  ), [getStatus, payload]);

  return {
    isPendingPurchase,
    isPendingUpdate,
    purchaseListing,
    updateListing,
  };
};

export default useDepositSaleManager;
