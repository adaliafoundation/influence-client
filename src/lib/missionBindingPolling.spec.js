const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const { QueryClient, QueryObserver } = require('@tanstack/react-query');
const { missionBindingRefetchInterval } = require('./missionBindings');

test('real query observer stops interval requests after binding resolution', async () => {
  jest.useFakeTimers();
  const client = new QueryClient();
  const fetch = jest.fn().mockResolvedValueOnce({ status: 'unknown' }).mockResolvedValue({ status: 'matched' });
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
