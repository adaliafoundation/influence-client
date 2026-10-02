import React, { useContext, useEffect } from 'react';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ActivitiesContext, { ActivitiesProvider } from './ActivitiesContext';
import useSession from '~/hooks/useSession';
import useCrewContext from '~/hooks/useCrewContext';
import useGetActivityConfig from '~/hooks/useGetActivityConfig';
import useStore from '~/hooks/useStore';
import useWebsocket from '~/hooks/useWebsocket';
import api from '~/lib/api';
import { marketSubscriptionsByClient } from '../lib/marketSubscriptions';

jest.mock('@influenceth/sdk', () => ({ Address: {}, Entity: { IDS: {} } }));
jest.mock('~/hooks/useBlockSync', () => () => {}, { virtual: true });
jest.mock('~/hooks/useSession', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useGetActivityConfig', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useStore', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useWebsocket', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useSimulationState', () => () => null, { virtual: true });
jest.mock('~/lib/activities', () => ({ hydrateActivities: jest.fn(async () => {}) }), { virtual: true });
jest.mock('~/lib/api', () => ({ getTransactionActivities: jest.fn() }), { virtual: true });
jest.mock('~/appConfig', () => ({ appConfig: { get: () => false } }), { virtual: true });
jest.mock('~/lib/debugFlags', () => ({ areWebsocketLogsEnabled: () => false }), { virtual: true });
jest.mock('~/lib/utils', () => ({ safeBigInt: BigInt }), { virtual: true });
jest.mock('~/lib/priceUtils', () => ({ TOKEN: {} }), { virtual: true });

const activity = { id: 'document-1', event: { id: 'event-1', name: 'SellOrderFilled', transactionHash: '0x123' } };
let client, socket, session, state, invalidate, consume;
const advance = async ms => {
  await act(async () => { jest.advanceTimersByTime(ms); });
};
const Consumer = () => {
  const activities = useContext(ActivitiesContext);
  useEffect(() => { consume(activities); }, [activities]);
  return null;
};
const tree = () => <QueryClientProvider client={client}><ActivitiesProvider><Consumer /></ActivitiesProvider></QueryClientProvider>;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  client = new QueryClient();
  invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue();
  consume = jest.fn();
  state = { pendingTransactions: [{ txHash: '0x123' }], dispatchAlertLogged: jest.fn() };
  session = { token: 'token', blockNumber: 1, setBlockNumber: jest.fn(), setBlockTime: jest.fn() };
  socket = {
    wsReady: true,
    registerConnectionHandler: jest.fn(), unregisterConnectionHandler: jest.fn(),
    registerMessageHandler: jest.fn(), unregisterMessageHandler: jest.fn()
  };
  useSession.mockImplementation(() => session);
  useStore.mockImplementation(selector => selector(state));
  useWebsocket.mockImplementation(() => socket);
  // Refetching creates new crew/config identities, as it does in the application.
  useCrewContext.mockImplementation(() => ({ crew: { id: 1 }, refreshReadyAt: jest.fn() }));
  useGetActivityConfig.mockImplementation(() => () => ({
    onBeforeReceived: async () => [], invalidations: [['walletBalance', 'sway']],
    triggerAlert: true, logContent: { content: 'Purchased core drills' }
  }));
  api.getTransactionActivities.mockResolvedValue({ activities: [activity] });
});
afterEach(() => {
  marketSubscriptionsByClient.delete(client);
  client.clear();
  jest.useRealTimers();
});

test('publishes a recovered purchase before refetch completes and preserves completion across state updates', async () => {
  let finishRefresh;
  invalidate.mockImplementation(() => new Promise(resolve => { finishRefresh = resolve; }));
  const { rerender } = render(tree());
  await advance(0);
  await advance(2500);
  expect(state.dispatchAlertLogged).toHaveBeenCalledTimes(1);
  expect(consume.mock.calls.at(-1)[0]).toEqual([expect.objectContaining({ key: 'event-1' })]);

  for (let i = 0; i < 5; i += 1) {
    session = { ...session, blockNumber: i + 2 };
    rerender(tree());
    await advance(3000);
  }
  expect(api.getTransactionActivities).toHaveBeenCalledTimes(1);
  expect(socket.registerMessageHandler).toHaveBeenCalledTimes(2);
  expect(invalidate).toHaveBeenCalledTimes(1);
  await act(async () => { finishRefresh(); });
  expect(consume.mock.calls.at(-1)[0]).toEqual([expect.objectContaining({ key: 'event-1' })]);
  state.pendingTransactions = [];
  rerender(tree());
  await advance(5000);
  expect(consume.mock.calls.at(-1)[0]).toHaveLength(1);
  expect(state.dispatchAlertLogged).toHaveBeenCalledTimes(1);
});

test('deduplicates API and websocket copies while retaining separate fills in one transaction', async () => {
  render(tree());
  await advance(0);
  const onMessage = socket.registerMessageHandler.mock.calls[0][0];
  act(() => {
    onMessage({ type: 'SellOrderFilled', body: { ...activity, id: 'socket-id' } });
    onMessage({ type: 'SellOrderFilled', body: { ...activity, event: { ...activity.event, id: 'event-2' } } });
  });
  await advance(1000);
  await advance(2500);
  expect(state.dispatchAlertLogged).toHaveBeenCalledTimes(2);
  expect(consume.mock.calls.at(-1)[0].map(a => a.key).sort()).toEqual(['event-1', 'event-2']);
  act(() => onMessage({ type: 'SellOrderFilled', body: activity }));
  await advance(1000);
  await advance(2500);
  expect(state.dispatchAlertLogged).toHaveBeenCalledTimes(2);
});

test('does not process a scheduled activity after logout', async () => {
  const { rerender } = render(tree());
  await advance(0);
  session = { ...session, token: null };
  rerender(tree());
  await advance(5000);
  expect(invalidate).not.toHaveBeenCalled();
  expect(state.dispatchAlertLogged).not.toHaveBeenCalled();
  expect(consume).toHaveBeenLastCalledWith([]);
});

test('recovers a missed websocket event without remounting or repeated invalidations', async () => {
  state.pendingTransactions[0].timestamp = Date.now();
  render(tree());
  await advance(29999);
  expect(api.getTransactionActivities).not.toHaveBeenCalled();
  await advance(1);
  expect(api.getTransactionActivities).toHaveBeenCalledTimes(1);
  await advance(2500);
  expect(consume.mock.calls.at(-1)[0]).toHaveLength(1);
  await advance(60000);
  expect(api.getTransactionActivities).toHaveBeenCalledTimes(1);
  expect(invalidate).toHaveBeenCalledTimes(1);
});

test('retries failed recovery at a fixed cadence without overlapping requests', async () => {
  let reject;
  api.getTransactionActivities.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  render(tree());
  await advance(90000);
  expect(api.getTransactionActivities).toHaveBeenCalledTimes(1);
  await act(async () => { reject(new Error('Offline')); });
  await advance(29999);
  expect(api.getTransactionActivities).toHaveBeenCalledTimes(1);
  await advance(1);
  expect(api.getTransactionActivities).toHaveBeenCalledTimes(2);
  await advance(2500);
  expect(consume.mock.calls.at(-1)[0]).toHaveLength(1);
});

test('ignores a recovery response that arrives after logout', async () => {
  let finish;
  api.getTransactionActivities.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { rerender } = render(tree());
  session = { ...session, token: null };
  rerender(tree());
  await act(async () => { finish({ activities: [activity] }); });
  await advance(60000);
  expect(invalidate).not.toHaveBeenCalled();
  expect(api.getTransactionActivities).toHaveBeenCalledTimes(1);
  expect(consume).toHaveBeenLastCalledWith([]);
});

test('retries an activity when preparing its refresh failed', async () => {
  const onBeforeReceived = jest.fn()
    .mockRejectedValueOnce(new Error('Entity API unavailable'))
    .mockResolvedValue([]);
  useGetActivityConfig.mockReturnValue(() => ({ onBeforeReceived, invalidations: [['entity', 1, 1]] }));
  render(tree());
  await advance(0);
  await advance(2500);
  expect(consume).toHaveBeenLastCalledWith([]);
  await advance(27500);
  await advance(2500);
  expect(onBeforeReceived).toHaveBeenCalledTimes(2);
  expect(invalidate).toHaveBeenCalledTimes(1);
  expect(consume.mock.calls.at(-1)[0]).toHaveLength(1);
});


test.each(['CrewmateRecruited', 'SellOrderFilled', 'ConstructionStarted'])(
  '%s publishes after the delay without waiting for entity, market, or readiness refreshes', async (name) => {
    const indexedActivity = { ...activity, event: { ...activity.event, name } };
    api.getTransactionActivities.mockResolvedValue({ activities: [indexedActivity] });
    const pending = new Promise(() => {});
    invalidate.mockReturnValue(pending);
    const flush = jest.fn(() => pending);
    const refreshReadyAt = jest.fn(() => pending);
    marketSubscriptionsByClient.set(client, { flush });
    useCrewContext.mockReturnValue({ crew: { id: 1 }, refreshReadyAt });
    useGetActivityConfig.mockReturnValue(() => ({
      onBeforeReceived: async () => [], invalidations: [['entity', 1, 1]], requiresCrewTime: true,
    }));
    render(tree());
    await advance(0);
    await advance(2499);
    expect(consume).toHaveBeenLastCalledWith([]);
    expect(invalidate).not.toHaveBeenCalled();
    await advance(1);
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(refreshReadyAt).toHaveBeenCalledTimes(1);
    expect(consume.mock.calls.at(-1)[0]).toEqual([expect.objectContaining({ event: indexedActivity.event })]);
    await advance(30000);
    expect(api.getTransactionActivities).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(2);
  }
);

test.each(['entity', 'market', 'readiness'])('a failed %s refresh does not undo completion or replay the activity', async (source) => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const error = new Error('Refresh failed');
  const refresh = jest.fn().mockRejectedValue(error);
  if (source === 'entity') invalidate.mockImplementation(refresh);
  if (source === 'market') marketSubscriptionsByClient.set(client, { flush: refresh });
  if (source === 'readiness') {
    useCrewContext.mockReturnValue({ crew: { id: 1 }, refreshReadyAt: refresh });
    useGetActivityConfig.mockReturnValue(() => ({
      onBeforeReceived: async () => [], invalidations: [], requiresCrewTime: true,
    }));
  }
  render(tree());
  await advance(0);
  await advance(2500);
  expect(consume.mock.calls.at(-1)[0]).toHaveLength(1);
  expect(warn).toHaveBeenCalledWith('Unable to refresh activity data', error);
  await advance(30000);
  const onMessage = socket.registerMessageHandler.mock.calls[0][0];
  act(() => onMessage({ type: activity.event.name, body: activity }));
  await advance(1000);
  await advance(2500);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(consume.mock.calls.at(-1)[0]).toHaveLength(1);
  expect(api.getTransactionActivities).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});
