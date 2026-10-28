import { act, renderHook } from '@testing-library/react';
import useFundingFlow from './useFundingFlow';
import useWalletPurchasableBalances from '~/hooks/useWalletPurchasableBalances';

jest.mock('~/hooks/useSession', () => () => ({ accountAddress: 'account' }), { virtual: true });
jest.mock('~/hooks/useWalletPurchasableBalances', () => jest.fn(), { virtual: true });
jest.mock('~/game/launcher/store/FundingFlow', () => () => null, { virtual: true });
jest.mock('~/lib/priceUtils', () => ({ TOKEN: { USDC: 'usdc' } }), { virtual: true });
jest.mock('~/lib/funding', () => ({ getUsdcValue: value => value }), { virtual: true });

test('other tokens cannot fund a USDC purchase, and completing funding does not purchase', () => {
  useWalletPurchasableBalances.mockReturnValue({ data: { tokenBalances: { usdc: 2n, eth: 999999n } } });
  const purchase = jest.fn();
  const { result, rerender } = renderHook(() => useFundingFlow());
  act(() => result.current.onVerifyFunds(5, purchase));
  expect(result.current.isFunding).toBe(true);
  expect(purchase).not.toHaveBeenCalled();
  useWalletPurchasableBalances.mockReturnValue({ data: { tokenBalances: { usdc: 5n } } });
  rerender();
  act(() => result.current.fundingPrompt.props.onFunded());
  expect(result.current.isFunding).toBe(false);
  expect(purchase).not.toHaveBeenCalled();
  act(() => result.current.onVerifyFunds(5, purchase));
  expect(purchase).toHaveBeenCalledTimes(1);
});
