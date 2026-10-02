import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { recoverGameplayQueries, recoverQueries } from './queryRecovery';

let client;
beforeEach(() => { client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); });
afterEach(() => client.clear());

test('coalesces recovery sources, preserves displayed data and leaves unrelated queries alone', async () => {
  const key = ['entity', 5, 1];
  client.setQueryData(key, 'old');
  client.setQueryData(['swapQuote', 'a', 'b'], 42);
  client.setQueryData(['pendingCrewmatePurchases', 'account'], []);
  client.setQueryData(['entities', 5, { asteroidId: 2 }], []);
  let finish;
  const fetch = jest.fn(() => new Promise(resolve => { finish = resolve; }));
  const observer = new QueryObserver(client, { queryKey: key, queryFn: fetch });
  const unsubscribe = observer.subscribe(() => {});
  const first = recoverGameplayQueries(client);
  const second = recoverQueries(client, { queryKey: key, exact: true });
  await Promise.resolve();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(observer.getCurrentResult().data).toBe('old');
  expect(client.getQueryState(['swapQuote', 'a', 'b']).isInvalidated).toBe(false);
  expect(client.getQueryState(['pendingCrewmatePurchases', 'account']).isInvalidated).toBe(false);
  expect(client.getQueryState(['entities', 5, { asteroidId: 2 }]).isInvalidated).toBe(true);
  finish('new');
  await Promise.all([first, second]);
  expect(observer.getCurrentResult().data).toBe('new');
  unsubscribe();
});

test('waits for a pre-gap request, then refreshes once without cancellation', async () => {
  const key = ['starterMissions', 'crew'];
  client.setQueryData(key, 'cached');
  let finish;
  const fetch = jest.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue('recovered');
  const observer = new QueryObserver(client, { queryKey: key, queryFn: fetch });
  const unsubscribe = observer.subscribe(() => {});
  const oldRequest = observer.refetch();
  const first = recoverGameplayQueries(client);
  const second = recoverQueries(client, { queryKey: key });
  await Promise.resolve();
  expect(fetch).toHaveBeenCalledTimes(1);
  finish('old response');
  await Promise.all([oldRequest, first, second]);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(client.getQueryData(key)).toBe('recovered');
  unsubscribe();
});

test('does not resurrect removed queries after logout', async () => {
  client.setQueryData(['entity', 1, 1], 'old account');
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  const pending = recoverGameplayQueries(client);
  client.clear();
  await pending;
  expect(invalidate).not.toHaveBeenCalled();
});
