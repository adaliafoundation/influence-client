import { act, renderHook } from '@testing-library/react';
import useWalletPurchasableBalances from './useWalletPurchasableBalances';
import useSession from '~/hooks/useSession';
import { useEthBalance, useStrkBalance, useSwayBalance, useUSDCBalance } from '~/hooks/useWalletTokenBalance';

jest.mock('~/hooks/useSession', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useWalletTokenBalance', () => ({
  useEthBalance: jest.fn(), useStrkBalance: jest.fn(), useSwayBalance: jest.fn(), useUSDCBalance: jest.fn()
}), { virtual: true });
jest.mock('~/hooks/usePriceHelper', () => {
  const helper = { from: value => ({ usdcValue: Number(value || 0), to: () => Number(value || 0) }) };
  return () => helper;
}, { virtual: true });
jest.mock('~/lib/priceUtils', () => ({ TOKEN: { ETH: 'eth', STRK: 'strk', USDC: 'usdc', SWAY: 'sway' }, TOKEN_SCALE: { usdc: 1 } }), { virtual: true });
jest.mock('~/lib/utils', () => ({ safeBigInt: BigInt }), { virtual: true });

test('keeps a shared awaitable refresh stable through loading and balance changes', async () => {
  useSession.mockReturnValue({});
  const queries = [useEthBalance, useStrkBalance, useSwayBalance, useUSDCBalance];
  const refetches = queries.map(() => jest.fn().mockResolvedValue({ data: 10n }));
  queries.forEach((query, i) => query.mockReturnValue({ data: undefined, isLoading: true, refetch: refetches[i] }));
  const { result, rerender } = renderHook(() => useWalletPurchasableBalances());
  const refresh = result.current.refetch;
  queries.forEach((query, i) => query.mockReturnValue({ data: 100n, isLoading: false, refetch: refetches[i] }));
  rerender();
  expect(result.current.refetch).toBe(refresh);
  await act(async () => { expect(await refresh()).toHaveLength(4); });
  refetches.forEach(refetch => expect(refetch).toHaveBeenCalledWith({ cancelRefetch: false }));
});
