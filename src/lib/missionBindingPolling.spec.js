const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const { QueryClient, QueryObserver } = require('@tanstack/react-query');
const { missionBindingRefetchInterval } = require('./missionBindings');

test.each(['matched', 'unbound'])('real query observer stops interval requests after binding becomes %s', async (status) => {
  jest.useFakeTimers();
  const client = new QueryClient();
  const fetch = jest.fn().mockResolvedValueOnce({ status: 'unknown' }).mockResolvedValue({ status });
  const observer = new QueryObserver(client, { queryKey: ['binding'], queryFn: fetch, refetchInterval: missionBindingRefetchInterval });
  const unsubscribe = observer.subscribe(() => {});
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  await flush();
  expect(fetch).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(5000);
  await flush();
  expect(fetch).toHaveBeenCalledTimes(2);
  jest.advanceTimersByTime(30000);
  await flush();
  expect(fetch).toHaveBeenCalledTimes(2);
  unsubscribe(); client.clear(); jest.useRealTimers();
});

test('an idle unbound entity does not poll but still refreshes on invalidation', async () => {
  jest.useFakeTimers();
  const client = new QueryClient();
  const fetch = jest.fn().mockResolvedValue({ status: 'unbound' });
  const observer = new QueryObserver(client, { queryKey: ['binding'], queryFn: fetch, refetchInterval: missionBindingRefetchInterval });
  const unsubscribe = observer.subscribe(() => {});
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  await flush();
  jest.advanceTimersByTime(30000);
  await flush();
  expect(fetch).toHaveBeenCalledTimes(1);
  await client.invalidateQueries({ queryKey: ['binding'] });
  expect(fetch).toHaveBeenCalledTimes(2);
  unsubscribe(); client.clear(); jest.useRealTimers();
});
