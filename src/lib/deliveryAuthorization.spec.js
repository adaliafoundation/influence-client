const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const { Entity } = require('@influenceth/sdk');
const { refreshDeliveryAcceptance, deliveryPaymentTransfers } = require('./deliveryAuthorization');

test('acceptance uses the current origin controller delegate, price and delivery', async () => {
  const delivery = { id: 1, label: Entity.IDS.DELIVERY, Delivery: { origin: { id: 2, label: Entity.IDS.BUILDING } }, PrivateSale: { amount: 100 } };
  const api = { getEntityById: jest.fn().mockResolvedValueOnce(delivery).mockResolvedValueOnce({ Control: { controller: { id: 3, label: Entity.IDS.CREW } } }).mockResolvedValueOnce({ Crew: { delegatedTo: '0x456' } }) };
  expect(await refreshDeliveryAcceptance({ api, deliveryId: 1, expectedPrice: 100 })).toEqual({ delivery, price: 100, recipient: '0x456' });
});

test('a changed price requires review instead of silently increasing payment', async () => {
  const api = { getEntityById: jest.fn(async () => ({ Delivery: {}, PrivateSale: { amount: 200 } })) };
  await expect(refreshDeliveryAcceptance({ api, deliveryId: 1, expectedPrice: 100 })).rejects.toThrow('price changed');
  expect(api.getEntityById).toHaveBeenCalledTimes(1);
});

test('confirmed absence of a sale is a free delivery, not missing permission data', async () => {
  const delivery = { Delivery: { origin: { id: 2, label: Entity.IDS.BUILDING } }, PrivateSale: null };
  const api = { getEntityById: jest.fn().mockResolvedValueOnce(delivery).mockResolvedValueOnce({ Control: { controller: { id: 3, label: Entity.IDS.CREW } } }).mockResolvedValueOnce({ Crew: { delegatedTo: '0x456' } }) };
  expect((await refreshDeliveryAcceptance({ api, deliveryId: 1, expectedPrice: 0 })).price).toBe(0);
});

test('zero-price acceptance emits no SWAY transfer or receipt', () => {
  expect(deliveryPaymentTransfers({ delivery: { id: 1, label: Entity.IDS.DELIVERY }, price: 0 })).toEqual([]);
});
test('paid acceptance uses the current payee and the delivery memo', () => {
  const delivery = { id: 1, label: Entity.IDS.DELIVERY };
  expect(deliveryPaymentTransfers({ caller: '0x456', delivery, price: 100 })).toEqual([{ amount: 100n, recipient: '0x456', memo: Entity.packEntity(delivery) }]);
});
