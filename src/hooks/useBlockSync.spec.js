import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import useBlockSync from './useBlockSync';
import api from '~/lib/api';

jest.mock('~/lib/api', () => ({ getUser: jest.fn() }), { virtual: true });
let client, invalidate, setBlockNumber, setBlockTime, visibility;
const advance = async ms => act(async () => { jest.advanceTimersByTime(ms); });
const mount = () => renderHook(({ enabled, block }) => useBlockSync(enabled, block, setBlockNumber, setBlockTime), {
  initialProps: { enabled: true, block: 100 },
  wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
});
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  client = new QueryClient();
  invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue();
  setBlockNumber = jest.fn();
  setBlockTime = jest.fn();
  visibility = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  api.getUser.mockResolvedValue({ blockNumber: 200, blockTimestamp: 2000 });
});
afterEach(() => {
  client.clear();
  visibility.mockRestore();
  jest.useRealTimers();
});

test('refreshes a stalled stream without pending transactions and protects newer state', async () => {
  mount();
  await advance(59999);
  expect(api.getUser).not.toHaveBeenCalled();
  await advance(1);
  expect(api.getUser).toHaveBeenCalledWith({ includeBlockData: true });
  expect(setBlockNumber.mock.calls[0][0](100)).toBe(200);
  expect(setBlockNumber.mock.calls[0][0](300)).toBe(300);
  expect(setBlockTime.mock.calls[0][0](1000)).toBe(2000);
  expect(setBlockTime.mock.calls[0][0](3000)).toBe(3000);
  expect(invalidate).toHaveBeenCalledTimes(1);
});

test('does not poll while websocket blocks keep advancing', async () => {
  const { rerender } = mount();
  for (let block = 101; block < 106; block++) {
    await advance(30000);
    rerender({ enabled: true, block });
  }
  expect(api.getUser).not.toHaveBeenCalled();
});

test('refreshes on return from a hidden tab and coalesces focus and visibility events', async () => {
  visibility.mockReturnValue('hidden');
  mount();
  await advance(90000);
  expect(api.getUser).not.toHaveBeenCalled();
  visibility.mockReturnValue('visible');
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  expect(api.getUser).toHaveBeenCalledTimes(1);
});

test('does not overlap requests and retries a failed request at the next interval', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  let reject;
  api.getUser.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  mount();
  await advance(180000);
  expect(api.getUser).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error('offline')));
  await advance(60000);
  expect(api.getUser).toHaveBeenCalledTimes(2);
  expect(invalidate).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});

test('ignores an older response when websocket progress resumes', async () => {
  let resolve;
  api.getUser.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const { rerender } = mount();
  await advance(60000);
  rerender({ enabled: true, block: 300 });
  await act(async () => resolve({ blockNumber: 200, blockTimestamp: 2000 }));
  expect(setBlockNumber).not.toHaveBeenCalled();
  expect(setBlockTime).not.toHaveBeenCalled();
  expect(invalidate).not.toHaveBeenCalled();
});

test('ignores responses and stops polling after logout', async () => {
  let resolve;
  api.getUser.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const { rerender } = mount();
  await advance(60000);
  rerender({ enabled: false, block: 100 });
  await act(async () => resolve({ blockNumber: 200, blockTimestamp: 2000 }));
  await advance(120000);
  expect(setBlockNumber).not.toHaveBeenCalled();
  expect(invalidate).not.toHaveBeenCalled();
  expect(api.getUser).toHaveBeenCalledTimes(1);
});
