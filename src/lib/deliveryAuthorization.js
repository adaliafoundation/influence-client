import { Entity } from '@influenceth/sdk';

export const refreshDeliveryAcceptance = async ({ api, deliveryId, expectedPrice }) => {
  const delivery = await api.getEntityById({ label: Entity.IDS.DELIVERY, id: deliveryId });
  if (!delivery?.Delivery || delivery.PrivateSale === undefined) throw new Error('Unable to check the current delivery sale. Refresh and try again.');
  const price = delivery.PrivateSale === null ? 0 : delivery.PrivateSale.amount;
  if (price == null || expectedPrice == null) throw new Error('Unable to check the current delivery price.');
  if (BigInt(price) !== BigInt(expectedPrice)) throw new Error('The delivery price changed. Review the updated proposal before accepting.');
  if (BigInt(price) === 0n) return { delivery, price, recipient: null };
  const origin = await api.getEntityById(delivery.Delivery.origin);
  if (!origin?.Control?.controller) throw new Error('Unable to check the current delivery seller.');
  const seller = await api.getEntityById(origin.Control.controller);
  if (!seller?.Crew?.delegatedTo) throw new Error('Unable to check the current seller wallet.');
  return { delivery, price, recipient: seller.Crew.delegatedTo };
};

export const deliveryPaymentTransfers = ({ caller, delivery, price }) => {
  const amount = BigInt(price);
  return amount === 0n ? [] : [{ amount, recipient: caller, memo: Entity.packEntity(delivery) }];
};
