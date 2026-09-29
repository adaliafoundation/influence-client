const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const { Entity, Lot, Permission } = require('@influenceth/sdk');
const { recheckTransactionAuthorization } = require('./transactionAuthorization');
const crew = { label: 1, id: 1 };
const origin = { label: 5, id: 2 };
const dest = { label: 5, id: 3 };
test('delivery send rechecks both removal and addition', async () => {
  const recheck = jest.fn(async () => ({ status: 'allowed' }));
  await recheckTransactionAuthorization('SendDelivery', { caller_crew: crew, origin, dest }, recheck);
  expect(recheck).toHaveBeenNthCalledWith(1, 'can', [crew, origin, Permission.IDS.REMOVE_PRODUCTS], [crew, origin]);
  expect(recheck).toHaveBeenNthCalledWith(2, 'can', [crew, dest, Permission.IDS.ADD_PRODUCTS], [crew, dest]);
});
test.each(['denied', 'unresolved'])('a %s submission check stops the transaction preflight', async (status) => {
  const recheck = jest.fn(async () => ({ status }));
  expect((await recheckTransactionAuthorization('SendDelivery', { caller_crew: crew, origin, dest }, recheck)).status).toBe(status);
  expect(recheck).toHaveBeenCalledTimes(1);
});

test.each(['StartPrepaidAgreementAuction', 'CancelPrepaidAgreementAuction'])('%s checks asteroid controls instead of exact controller identity', async (key) => {
  const lot = { label: Entity.IDS.LOT, id: Lot.toId(1, 1), UseLot: crew };
  const recheck = jest.fn(async () => ({ status: 'denied', entities: [lot] }))
    .mockResolvedValueOnce({ status: 'allowed', entities: [lot] });
  const asteroid = { label: Entity.IDS.ASTEROID, id: 1 };
  expect((await recheckTransactionAuthorization(key, { caller_crew: crew, lot }, recheck)).status).toBe('allowed');
  expect(recheck).toHaveBeenNthCalledWith(1, 'controls', [crew, asteroid], [crew, asteroid, lot]);
});
test.each(['allowed', 'unresolved'])('a tenant with %s access prevents starting a lot auction despite an expired lease', async (status) => {
  const lot = { label: Entity.IDS.LOT, id: Lot.toId(1, 1), UseLot: crew };
  const recheck = jest.fn().mockResolvedValueOnce({ status: 'allowed', entities: [lot] })
    .mockResolvedValueOnce({ status, entities: [lot] });
  expect((await recheckTransactionAuthorization('StartPrepaidAgreementAuction', { caller_crew: crew, lot }, recheck)).status)
    .toBe(status === 'allowed' ? 'denied' : 'unresolved');
});

test('escrow buy-order creation applies the underlying inventory permission checks', async () => {
  const recheck = jest.fn(async () => ({ status: 'allowed' }));
  await recheckTransactionAuthorization('EscrowDepositAndCreateBuyOrder', { caller_crew: crew, exchange: origin, storage: dest }, recheck);
  expect(recheck).toHaveBeenNthCalledWith(1, 'can', [crew, origin, Permission.IDS.LIMIT_BUY], [crew, origin]);
  expect(recheck).toHaveBeenNthCalledWith(2, 'can', [crew, dest, Permission.IDS.ADD_PRODUCTS], [crew, dest]);
});
test('bulk purchases stop when a later destination permission is unresolved', async () => {
  const recheck = jest.fn().mockResolvedValue({ status: 'allowed' })
    .mockResolvedValueOnce({ status: 'allowed' }).mockResolvedValueOnce({ status: 'allowed' })
    .mockResolvedValueOnce({ status: 'allowed' }).mockResolvedValueOnce({ status: 'unresolved' });
  const orders = [1, 2, 3].map((id) => ({ caller_crew: crew, exchange: origin, destination: { ...dest, id } }));
  expect((await recheckTransactionAuthorization('BulkFillSellOrder', orders, recheck)).status).toBe('unresolved');
  expect(recheck).toHaveBeenCalledTimes(4);
});

test.each(['RecruitAdalian', 'InitializeArvadian'])('%s checks an existing crew without inventing permission for a new crew', async (key) => {
  const recheck = jest.fn(async () => ({ status: 'denied' }));
  expect((await recheckTransactionAuthorization(key, { caller_crew: crew, station: dest }, recheck)).status).toBe('denied');
  expect(recheck).toHaveBeenCalledWith('can', [crew, dest, Permission.IDS.RECRUIT_CREWMATE], [crew, dest]);
  recheck.mockClear();
  await recheckTransactionAuthorization(key, { caller_crew: { ...crew, id: 0 }, station: dest }, recheck);
  expect(recheck).not.toHaveBeenCalled();
});
