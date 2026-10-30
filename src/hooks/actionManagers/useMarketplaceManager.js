import { useCallback, useContext, useMemo } from 'react';
import { Entity, Order } from '@influenceth/sdk';

import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useCrewContext from '~/hooks/useCrewContext';
import useFailureReporter from '~/hooks/useFailureReporter';
import { getOrderCancellationAuthorization } from '~/lib/orderCancellation';
import useEntity from '../useEntity';
import useHydratedCrew from '../useHydratedCrew';
import api from '~/lib/api';
import { TOKEN, TOKEN_SCALE } from '~/lib/priceUtils';

// TODO: product could probably be incorporated into props + payload
const useMarketplaceManager = (buildingId) => {
  const { execute } = useContext(ChainTransactionContext);
  const { crew, pendingTransactions, authorize, recheckAuthorization, recheckActingCrew } = useCrewContext();
  const reportBlocked = useFailureReporter();
  const { data: exchange } = useEntity({ id: buildingId, label: Entity.IDS.BUILDING });
  const { data: exchangeController } = useHydratedCrew(exchange?.Control?.controller?.id);

  const payload = useMemo(() => ({
    exchange: { id: buildingId, label: Entity.IDS.BUILDING },
    caller_crew: { id: crew?.id, label: Entity.IDS.CREW }
  }), [crew?.id, buildingId]);

  const getPendingOrder = useCallback((mode, type, details) => {
    const keys = [];
    let locTest = () => true;
    if (mode === 'buy' && type === 'limit') {
      keys.push('EscrowDepositAndCreateBuyOrder', 'EscrowWithdrawalAndFillBuyOrders');
      // locTest = (vars) => vars.storage.id === details.destination.id && vars.storage_slot === details.destinationSlot;
    }
    if (mode === 'buy' && type === 'market') {
      keys.push('BulkFillSellOrder');
      // locTest = (vars) => vars.origin.id === details.origin.id && vars.origin_slot === details.originSlot;
    }
    if (mode === 'sell' && type === 'limit') {
      keys.push('CreateSellOrder', 'CancelSellOrder');
      // locTest = (vars) => vars.storage.id === details.origin.id && vars.storage_slot === details.originSlot;
    }
    if (mode === 'sell' && type === 'market') {
      keys.push('EscrowWithdrawalAndFillBuyOrders');
      // locTest = (vars) => vars.destination.id === details.destination.id && vars.destination_slot === details.destinationSlot;
    }
    return pendingTransactions.find((tx) => (
      keys.includes(tx.key)
        && (tx.vars[0] || tx.vars).product === details.product
        && (tx.vars[0] || tx.vars).exchange.id === details.exchange.id
        && locTest(tx.vars[0] || tx.vars)
    ));
  }, [pendingTransactions]);

  const createBuyOrder = useCallback(
    ({ product, amount, price, destination, destinationSlot, feeTotal }) => execute(
      'EscrowDepositAndCreateBuyOrder',
      {
        buyer_crew: { id: crew?.id, label: crew?.label },
        product,
        amount,
        price: Math.round(price * TOKEN_SCALE[TOKEN.SWAY]),
        storage: { id: destination?.id, label: destination?.label },
        storage_slot: destinationSlot,
        feeTotal: Math.round(feeTotal * TOKEN_SCALE[TOKEN.SWAY]),
        ...payload
      },
      {
        lotId: exchange?.Location?.location?.id
      },
    ),
    [crew, execute, payload]
  );
  const createSellOrder = useCallback(
    ({ product, amount, price, origin, originSlot }) => execute(
      'CreateSellOrder',
      {
        product,
        amount,
        price: Math.round(price * TOKEN_SCALE[TOKEN.SWAY]),
        storage: { id: origin?.id, label: origin?.label },
        storage_slot: originSlot,
        ...payload
      },
      {
        lotId: exchange?.Location?.location?.id
      },
    ),
    [exchange, execute, payload]
  );

  const fillBuyOrders = useCallback(
    ({ isCancellation, origin, originSlot, fillOrders }) => {
      if (!fillOrders?.length) return;

      return execute(
        'EscrowWithdrawalAndFillBuyOrders',
        fillOrders.map((order) => ({
          isCancellation: !!isCancellation,
          depositCaller: isCancellation ? order.initialCaller : (order.initialCaller || crew?.Crew?.delegatedTo),
          seller_account: isCancellation ? order.refundRecipient : crew?.Crew?.delegatedTo,
          exchange_owner_account: exchangeController?.Crew?.delegatedTo,
          makerFee: order.makerFee / Order.FEE_SCALE,
          payments: {
            toExchange: order.paymentsUnscaled.toExchange,
            toPlayer: order.paymentsUnscaled.toPlayer
          },

          origin: { id: origin?.id, label: origin?.label },
          origin_slot: originSlot,
          product: order.product,
          amount: isCancellation ? 0 : order.fillAmount,
          buyer_crew: { id: order.crew?.id, label: order.crew?.label },
          price: Math.round(order.price * TOKEN_SCALE[TOKEN.SWAY]),
          storage: { id: order.storage?.id, label: order.storage?.label },
          storage_slot: order.storageSlot,

          ...payload
        })),
        {
          lotId: exchange?.Location?.location?.id,
          isCancellation,
          ...(isCancellation ? { amount: fillOrders[0].fillAmount } : {}),
        },
      );
    },
    [crew?.Crew?.delegatedTo, exchange?.Location?.location?.id, exchangeController, execute, payload]
  );

  const fillSellOrders = useCallback(
    async ({ destination, destinationSlot, fillOrders }) => {
      if (!fillOrders?.length) return;
      const sellerCrewIds = [...new Set(fillOrders.map((order) => order.crew?.id))];
      const sellerCrews = await api.getEntities({ ids: sellerCrewIds, label: Entity.IDS.CREW, components: ['Crew'] })
      return execute(
        'BulkFillSellOrder',
        fillOrders.map((order) => ({
          seller_account: sellerCrews.find((c) => c.id === order.crew?.id)?.Crew?.delegatedTo,
          exchange_owner_account: exchangeController?.Crew?.delegatedTo,
          takerFee: exchange?.Exchange?.takerFee,
          payments: {
            toExchange: order.paymentsUnscaled.toExchange,
            toPlayer: order.paymentsUnscaled.toPlayer
          },

          seller_crew: { id: order.crew?.id, label: order.crew?.label },
          amount: order.fillAmount,
          price: Math.round(order.price * TOKEN_SCALE[TOKEN.SWAY]),
          storage: { id: order.storage?.id, label: order.storage?.label },
          storage_slot: order.storageSlot,

          product: order.product,
          destination: { id: destination?.id, label: destination?.label },
          destination_slot: destinationSlot,
          ...payload
        })),
        {
          exchangeLotId: exchange?.Location?.location?.id,
        },
      );
    },
    [exchangeController, execute, payload]
  );

  const cancellationAuthorization = useCallback((orderCrew, storage) => getOrderCancellationAuthorization(
    crew, orderCrew,
    authorize('controls', [crew, storage], [crew, storage]),
    authorize('controls', [crew, exchange], [crew, exchange])
  ), [authorize, crew, exchange]);

  const recheckCancellation = useCallback(async (orderCrew, storage) => {
    const prerequisites = await recheckActingCrew({ requireReady: false });
    if (prerequisites.status !== 'allowed') return prerequisites;
    const [storageControl, exchangeControl] = await Promise.all([
      recheckAuthorization('controls', [crew, storage], [crew, storage]),
      recheckAuthorization('controls', [crew, exchange], [crew, exchange])
    ]);
    return getOrderCancellationAuthorization(crew, orderCrew, storageControl, exchangeControl);
  }, [crew, exchange, recheckActingCrew, recheckAuthorization]);

  const cancelBuyOrder = useCallback(
    async ({ amount, buyer, price, product, destination, destinationSlot, initialCaller, makerFee }) => {
      const decision = await recheckCancellation(buyer, destination);
      if (decision.status !== 'allowed') return reportBlocked(decision);
      const [buyerCrew] = await api.getEntities({ ids: [buyer.id], label: Entity.IDS.CREW, components: ['Crew'] });
      const refundRecipient = buyerCrew?.Crew?.delegatedTo;
      if (!refundRecipient) throw new Error('Unable to resolve the buyer refund account');
      return fillBuyOrders({
        isCancellation: true,
        origin: destination,
        originSlot: destinationSlot,
        fillOrders: [
          {
            initialCaller,
            refundRecipient,
            makerFee,
            paymentsUnscaled: {
              toExchange: 0,
              toPlayer: Order.getBuyOrderCancellationRefund(amount, Math.round(price * TOKEN_SCALE[TOKEN.SWAY]), makerFee)
            },
            fillAmount: amount,
            crew: buyer,
            price: price,
            storage: destination,
            storageSlot: destinationSlot,
            product,
          }
        ]
      });
    },
    [fillBuyOrders, recheckCancellation, reportBlocked]
  );
  const cancelSellOrder = useCallback(
    async ({ amount, seller, product, price, origin, originSlot }) => {
      const decision = await recheckCancellation(seller, origin);
      if (decision.status !== 'allowed') return reportBlocked(decision);
      return execute(
        'CancelSellOrder',
        {
          seller_crew: { id: seller?.id, label: seller?.label },
          product,
          price: Math.round(price * TOKEN_SCALE[TOKEN.SWAY]),
          storage: { id: origin?.id, label: origin?.label },
          storage_slot: originSlot,
          ...payload
        },
        {
          amount,
          lotId: exchange?.Location?.location?.id,
        },
      );
    },
    [execute, payload, exchange?.Location?.location?.id, recheckCancellation, reportBlocked]
  );

  return {
    createBuyOrder,
    createSellOrder,
    cancellationAuthorization,
    cancelBuyOrder,
    cancelSellOrder,
    fillBuyOrders,
    fillSellOrders,

    // TODO: pending actions (by type?)
    getPendingOrder
  };
};

export default useMarketplaceManager;
