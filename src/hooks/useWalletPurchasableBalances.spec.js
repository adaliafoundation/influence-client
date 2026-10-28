import { act, renderHook } from '@testing-library/react';
import useWalletPurchasableBalances from './useWalletPurchasableBalances';
import { useEthBalance, useStrkBalance, useSwayBalance, useUSDCBalance } from '~/hooks/useWalletTokenBalance';

jest.mock('~/hooks/useWalletTokenBalance', () => ({
  useEthBalance: jest.fn(), useStrkBalance: jest.fn(), useSwayBalance: jest.fn(), useUSDCBalance: jest.fn()
}), { virtual: true });
jest.mock('~/lib/priceUtils', () => ({ TOKEN: { USDC: 'usdc' } }), { virtual: true });

test('exposes only USDC and keeps its awaitable refresh stable through balance changes', async () => {
  const refetch = jest.fn().mockResolvedValue({ data: 10n });
  useUSDCBalance.mockReturnValue({ data: undefined, isLoading: true, refetch });
  const { result, rerender } = renderHook(() => useWalletPurchasableBalances());
  expect(result.current.data).toBeNull();
  const refresh = result.current.refetch;
  useUSDCBalance.mockReturnValue({ data: 100n, isLoading: false, refetch });
  rerender();
  expect(result.current.data).toEqual({ tokenBalances: { usdc: 100n } });
  expect(result.current.refetch).toBe(refresh);
  await act(async () => { expect(await refresh()).toEqual({ data: 10n }); });
  expect(refetch).toHaveBeenCalledTimes(1);
  [useEthBalance, useStrkBalance, useSwayBalance].forEach(query => expect(query).not.toHaveBeenCalled());
});
