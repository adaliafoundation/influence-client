import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import useWalletTokenBalance from './useWalletTokenBalance';
import useSession from '~/hooks/useSession';

jest.mock('~/hooks/useSession', () => jest.fn(), { virtual: true });
jest.mock('~/lib/priceUtils', () => ({ TOKEN: {} }), { virtual: true });
jest.mock('starknet', () => ({ uint256: { uint256ToBN: ({ low }) => BigInt(low) } }));

test('retains the last known balance when an RPC refresh fails', async () => {
  const provider = { callContract: jest.fn().mockResolvedValue(['42', '0']) };
  useSession.mockReturnValue({ provider, accountAddress: '0x123' });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result, unmount } = renderHook(() => useWalletTokenBalance('usdc', '0x456'), { wrapper });
  await waitFor(() => expect(result.current.data).toBe(42n));
  expect(result.current.isError).toBe(false);
  provider.callContract.mockRejectedValue(new Error('RPC unavailable'));
  await act(async () => { await result.current.refetch(); });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.data).toBe(42n);
  unmount();
  client.clear();
});
