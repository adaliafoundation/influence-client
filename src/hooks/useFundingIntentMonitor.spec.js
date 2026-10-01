import { act, renderHook } from '@testing-library/react';
import useFundingIntentMonitor from './useFundingIntentMonitor';
import useStore from '~/hooks/useStore';
import useWalletPurchasableBalances from '~/hooks/useWalletPurchasableBalances';
import api from '~/lib/api';

jest.mock('~/hooks/useStore', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useWalletPurchasableBalances', () => jest.fn(), { virtual: true });
jest.mock('~/lib/api', () => ({ getBanxaOrder: jest.fn() }), { virtual: true });
jest.mock('~/lib/funding', () => ({ normalizeBanxaOrder: order => order }), { virtual: true });
jest.mock('~/lib/priceUtils', () => ({ TOKEN: { USDC: 'usdc' }, TOKEN_FORMAT: {}, TOKEN_FORMATTER: {} }), { virtual: true });
jest.mock('~/lib/utils', () => ({ safeBigInt: BigInt }), { virtual: true });

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  const state = {
    dispatchAlertLogged: jest.fn(), dispatchFundingIntentCleared: jest.fn(), dispatchFundingIntentUpdated: jest.fn()
  };
  useStore.mockImplementation(selector => selector(state));
  useWalletPurchasableBalances.mockReturnValue({ data: null, refetch: jest.fn() });
});
afterEach(() => jest.useRealTimers());

test('waits for a slow order check before scheduling the next check and stops on unmount', async () => {
  let finish;
  api.getBanxaOrder.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const intent = { id: 'funding-1', provider: 'banxa', orderId: 'order-1', status: 'pending' };
  const { rerender, unmount } = renderHook(() => useFundingIntentMonitor(intent));
  await act(async () => { jest.advanceTimersByTime(180000); });
  rerender();
  expect(api.getBanxaOrder).toHaveBeenCalledTimes(1);
  await act(async () => { finish({ status: 'pending' }); });
  await act(async () => { jest.advanceTimersByTime(59999); });
  expect(api.getBanxaOrder).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(api.getBanxaOrder).toHaveBeenCalledTimes(2);
  unmount();
  await act(async () => { finish({ status: 'pending' }); jest.advanceTimersByTime(120000); });
  expect(api.getBanxaOrder).toHaveBeenCalledTimes(2);
});
