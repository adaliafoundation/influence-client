const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const { QueryClient } = require('@tanstack/react-query');
const { createMarketSubscriptions, isMarketEvent } = require('./marketSubscriptions');

let client, socket, api, subscriptions;
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
beforeEach(() => {
  jest.useFakeTimers();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  jest.spyOn(client, 'invalidateQueries').mockResolvedValue();
  socket = { registerMessageHandler: jest.fn(() => 1), unregisterMessageHandler: jest.fn(),
    registerConnectionHandler: jest.fn(() => 2), unregisterConnectionHandler: jest.fn() };
  api = { getNextMarketOrderActivation: jest.fn().mockResolvedValue(null) };
  subscriptions = createMarketSubscriptions({ client, socket, api });
});
afterEach(() => { client.clear(); jest.useRealTimers(); });
const event = (product = 7, type = 'SellOrderCancelled', validTime) => ({ type, body: { event: { returnValues: {
  exchange: { label: 5, id: 31 }, storage: { label: 5, id: 99 }, product, validTime
} } } });

test('all six order events are supported, but unrelated events are ignored', () => {
  for (const side of ['Buy', 'Sell']) for (const action of ['Created', 'Filled', 'Cancelled']) {
    expect(isMarketEvent(`${side}Order${action}`)).toBe(true);
  }
  expect(isMarketEvent('ConstructionStarted')).toBe(false);
});

test('shares asteroid subscriptions, batches events and only refreshes matching queries', async () => {
  const releaseA = subscriptions.acquire(['orderList', 31, 7], { asteroidId: 1, exchangeId: 31, products: [7] });
  const releaseB = subscriptions.acquire(['orderList', 31, 8], { asteroidId: 1, exchangeId: 31, products: [8] });
  const releaseC = subscriptions.acquire(['orderList', 32, 7], { asteroidId: 1, exchangeId: 32, products: [7] });
  expect(socket.registerMessageHandler).toHaveBeenCalledTimes(1);
  expect(socket.registerMessageHandler.mock.calls[0][1]).toBe('Asteroid::1');
  const handle = socket.registerMessageHandler.mock.calls[0][0];
  handle(event()); handle(event()); handle({ type: 'CURRENT_STARKNET_BLOCK_NUMBER' });
  await flush();
  jest.advanceTimersByTime(2500);
  expect(client.invalidateQueries).toHaveBeenCalledTimes(1);
  expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['orderList', 31, 7], exact: true }, { cancelRefetch: false });
  jest.advanceTimersByTime(60000);
  expect(client.invalidateQueries).toHaveBeenCalledTimes(1);
  releaseA(); releaseB();
  expect(socket.unregisterMessageHandler).not.toHaveBeenCalled();
  releaseC();
  expect(socket.unregisterMessageHandler).toHaveBeenCalledWith(1);
  expect(socket.unregisterConnectionHandler).toHaveBeenCalledWith(2);
});

test('discovers a pre-existing future order and refreshes at activation without block polling', async () => {
  const at = Math.floor(Date.now() / 1000) + 10;
  api.getNextMarketOrderActivation.mockResolvedValueOnce(at).mockResolvedValue(null);
  const release = subscriptions.acquire(['exchangeOrderSummary', 1, 7], { asteroidId: 1, products: [7] });
  await flush();
  jest.advanceTimersByTime(9000);
  expect(client.invalidateQueries).not.toHaveBeenCalled();
  jest.advanceTimersByTime(2000);
  await flush();
  expect(client.invalidateQueries).toHaveBeenCalledTimes(1);
  expect(api.getNextMarketOrderActivation).toHaveBeenCalledTimes(2);
  jest.advanceTimersByTime(60000);
  expect(client.invalidateQueries).toHaveBeenCalledTimes(1);
  release();
});

test('reconnect refreshes current scopes and release cancels pending work', async () => {
  const release = subscriptions.acquire(['inventoryOrders', 5, 99], { asteroidId: 1, storage: { label: 5, id: 99 } });
  await flush();
  socket.registerConnectionHandler.mock.calls[0][0](true);
  await flush();
  expect(client.invalidateQueries).toHaveBeenCalledTimes(1);
  expect(api.getNextMarketOrderActivation).toHaveBeenCalledTimes(2);
  socket.registerMessageHandler.mock.calls[0][0](event(7, 'BuyOrderCreated', Date.now() / 1000 + 20));
  release();
  jest.advanceTimersByTime(60000);
  expect(client.invalidateQueries).toHaveBeenCalledTimes(1);
});

test('newly created future orders schedule activation and inventory events match exact storage', async () => {
  const release = subscriptions.acquire(['inventoryOrders', 5, 99], { asteroidId: 1, storage: { label: 5, id: 99 } });
  await flush();
  const handle = socket.registerMessageHandler.mock.calls[0][0];
  const unrelated = event();
  unrelated.body.event.returnValues.storage.id = 100;
  handle(unrelated);
  jest.advanceTimersByTime(2500);
  expect(client.invalidateQueries).not.toHaveBeenCalled();
  handle(event(7, 'SellOrderCreated', Math.floor(Date.now() / 1000) + 10));
  jest.advanceTimersByTime(2500);
  await flush();
  expect(client.invalidateQueries).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(8500);
  await flush();
  expect(client.invalidateQueries).toHaveBeenCalledTimes(2);
  release();
});

test('reopening refreshes cached orders once, and confirmation waits for pending market refreshes', async () => {
  const key = ['orderList', 31, 7];
  client.setQueryData(key, []);
  const release = subscriptions.acquire(key, { asteroidId: 1, exchangeId: 31, products: [7] });
  const releaseOther = subscriptions.acquire(key, { asteroidId: 1, exchangeId: 31, products: [7] });
  expect(client.invalidateQueries).toHaveBeenCalledTimes(1);
  await flush();
  let finish;
  client.invalidateQueries.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  socket.registerMessageHandler.mock.calls[0][0](event());
  let settled = false;
  const pending = subscriptions.flush().then(() => { settled = true; });
  await flush();
  expect(settled).toBe(false);
  finish(); await pending;
  expect(settled).toBe(true);
  expect(client.invalidateQueries).toHaveBeenCalledTimes(2);
  release(); releaseOther();
});

test('an event waits for a pre-event request before requesting current data', async () => {
  const release = subscriptions.acquire(['orderList', 31, 7], { asteroidId: 1, exchangeId: 31, products: [7] });
  await flush();
  let resolveOld;
  const oldRequest = client.fetchQuery({ queryKey: ['orderList', 31, 7], queryFn: () => new Promise(resolve => { resolveOld = resolve; }) });
  socket.registerMessageHandler.mock.calls[0][0](event());
  jest.advanceTimersByTime(2500);
  await flush();
  expect(client.invalidateQueries).not.toHaveBeenCalled();
  resolveOld([]);
  await oldRequest; await flush();
  expect(client.invalidateQueries).toHaveBeenCalledTimes(1);
  release();
});
