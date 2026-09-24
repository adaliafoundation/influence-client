import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { TextDecoder, TextEncoder } = require('util');
global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

jest.mock('~/hooks/useSession', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('~/hooks/useSimulationEnabled', () => ({ __esModule: true, default: () => false }), { virtual: true });
jest.mock('~/game/launcher/store/components/StripeEmbeddedCheckout', () => ({ stripePromise: {} }), { virtual: true });
jest.mock('~/lib/api', () => ({ __esModule: true, default: {
  getPendingCrewmatePurchases: jest.fn(),
  getCrewmatePurchaseCheckout: jest.fn(),
  submitCrewmatePurchaseCustomization: jest.fn()
} }), { virtual: true });
jest.mock('~/lib/crewmatePurchases', () => jest.requireActual('../lib/crewmatePurchases'), { virtual: true });

const useSession = require('~/hooks/useSession').default;
const api = require('~/lib/api').default;
const usePendingCrewmatePurchases = require('./usePendingCrewmatePurchases').default;
const useCrewmatePurchaseCheckout = require('./useCrewmatePurchaseCheckout').default;

const paidPurchase = (id, status = 'paid_pending_customization') => ({
  id, status, purchaser: '0x123', recipient: '0x123', stripeCheckoutSessionId: `cs_${id}`
});
let queryClient;
const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;

beforeEach(() => {
  jest.resetAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  useSession.mockReturnValue({ accountAddress: '0x123', authenticated: true });
});
afterEach(() => queryClient.clear());

test('recovers both paid purchases despite a newer unpaid checkout and keeps the remaining purchase after completion', async () => {
  api.getPendingCrewmatePurchases.mockResolvedValue({ purchases: [
    paidPurchase('unpaid', 'checkout_created'), paidPurchase('one'), paidPurchase('two'),
    paidPurchase('done', 'grant_confirmed'), { ...paidPurchase('other'), recipient: '0x456' }
  ] });
  const { result } = renderHook(usePendingCrewmatePurchases, { wrapper });
  await waitFor(() => expect(result.current.purchases.map((p) => p.id)).toEqual(['one', 'two']));
  api.getPendingCrewmatePurchases.mockResolvedValue({ purchases: [paidPurchase('two')] });
  await act(async () => { await result.current.refetch(); });
  await waitFor(() => expect(result.current.purchases.map((p) => p.id)).toEqual(['two']));
});

test('prioritizes the oldest paid purchase without changing the server response order', async () => {
  const purchases = [
    { ...paidPurchase('newer'), paidAt: '2026-09-24T12:00:00Z' },
    { ...paidPurchase('oldest'), paidAt: '2026-09-24T09:00:00Z' },
    { ...paidPurchase('middle'), paidAt: '2026-09-24T10:00:00Z' }
  ];
  api.getPendingCrewmatePurchases.mockResolvedValue({ purchases });
  const { result } = renderHook(usePendingCrewmatePurchases, { wrapper });
  await waitFor(() => expect(result.current.purchases.map((p) => p.id)).toEqual(['oldest', 'middle', 'newer']));
  expect(purchases.map((p) => p.id)).toEqual(['newer', 'oldest', 'middle']);
});

test('does not expose the previous account purchases after switching accounts or logging out', async () => {
  api.getPendingCrewmatePurchases.mockResolvedValue({ purchases: [paidPurchase('one')] });
  const { result, rerender } = renderHook(usePendingCrewmatePurchases, { wrapper });
  await waitFor(() => expect(result.current.purchases).toHaveLength(1));
  useSession.mockReturnValue({ accountAddress: '0x456', authenticated: true });
  rerender();
  expect(result.current.purchases).toEqual([]);
  useSession.mockReturnValue({ accountAddress: '0x123', authenticated: false });
  rerender();
  expect(result.current.purchases).toEqual([]);
});

test('loading and refetching a paid purchase never submit customization', async () => {
  api.getCrewmatePurchaseCheckout.mockResolvedValue({ purchase: paidPurchase('one') });
  const { result } = renderHook(() => useCrewmatePurchaseCheckout('cs_one'), { wrapper });
  await waitFor(() => expect(result.current.data?.purchase.id).toBe('one'));
  await act(async () => { await result.current.refetch(); });
  expect(api.submitCrewmatePurchaseCustomization).not.toHaveBeenCalled();
});

test('explicit confirmation submits only the selected purchase and prevents concurrent duplicate submissions', async () => {
  api.getCrewmatePurchaseCheckout.mockImplementation(async (session) => ({ purchase: paidPurchase(session === 'cs_two' ? 'two' : 'one') }));
  let finish;
  api.submitCrewmatePurchaseCustomization.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const { result, rerender } = renderHook(({ session }) => useCrewmatePurchaseCheckout(session), {
    wrapper, initialProps: { session: 'cs_one' }
  });
  await waitFor(() => expect(result.current.data?.purchase.id).toBe('one'));
  rerender({ session: 'cs_two' });
  await waitFor(() => expect(result.current.data?.purchase.id).toBe('two'));
  const request = { name: 'Reviewed crewmate' };
  let submission;
  act(() => {
    submission = result.current.submitCustomization(request);
    result.current.submitCustomization(request);
  });
  expect(api.submitCrewmatePurchaseCustomization).toHaveBeenCalledTimes(1);
  expect(api.submitCrewmatePurchaseCustomization).toHaveBeenCalledWith({ purchaseId: 'two', grantRequest: request });
  await act(async () => { finish({ purchase: paidPurchase('two', 'grant_submitted') }); await submission; });
  await act(async () => { await result.current.submitCustomization(request); });
  expect(api.submitCrewmatePurchaseCustomization).toHaveBeenCalledTimes(1);
});

test('a failed request requires another explicit confirmation to retry', async () => {
  api.getCrewmatePurchaseCheckout.mockResolvedValue({ purchase: paidPurchase('one') });
  api.submitCrewmatePurchaseCustomization.mockRejectedValueOnce(new Error('Temporary failure'))
    .mockResolvedValueOnce({ purchase: paidPurchase('one', 'grant_submitted') });
  const { result } = renderHook(() => useCrewmatePurchaseCheckout('cs_one'), { wrapper });
  await waitFor(() => expect(result.current.data?.purchase.id).toBe('one'));
  await act(async () => { await expect(result.current.submitCustomization({ name: 'Ada' })).rejects.toThrow('Temporary failure'); });
  await act(async () => { await result.current.refetch(); });
  expect(api.submitCrewmatePurchaseCustomization).toHaveBeenCalledTimes(1);
  await act(async () => { await result.current.submitCustomization({ name: 'Ada' }); });
  expect(api.submitCrewmatePurchaseCustomization).toHaveBeenCalledTimes(2);
});

test.each(['checkout_created', 'grant_submitting', 'grant_submitted', 'grant_confirmed'])('cannot submit a purchase in %s', async (status) => {
  api.getCrewmatePurchaseCheckout.mockResolvedValue({ purchase: paidPurchase('one', status) });
  const { result } = renderHook(() => useCrewmatePurchaseCheckout('cs_one'), { wrapper });
  await waitFor(() => expect(result.current.data?.purchase.id).toBe('one'));
  await act(async () => { await result.current.submitCustomization({ name: 'Ada' }); });
  expect(api.submitCrewmatePurchaseCustomization).not.toHaveBeenCalled();
});


test('a fresh checkout submits its confirmed customization once when payment completes', async () => {
  const checkoutCustomization = {
    accountAddress: '0x123', checkoutSessionId: 'cs_one', grantRequest: { name: 'Confirmed before checkout' }
  };
  api.getCrewmatePurchaseCheckout.mockResolvedValue({ purchase: paidPurchase('one', 'checkout_created') });
  api.submitCrewmatePurchaseCustomization.mockResolvedValue({ purchase: paidPurchase('one', 'grant_submitted') });
  const { result } = renderHook(() => useCrewmatePurchaseCheckout('cs_one', checkoutCustomization), { wrapper });
  await waitFor(() => expect(result.current.data?.purchase.status).toBe('checkout_created'));
  expect(api.submitCrewmatePurchaseCustomization).not.toHaveBeenCalled();

  api.getCrewmatePurchaseCheckout.mockResolvedValue({ purchase: paidPurchase('one') });
  await act(async () => { await result.current.refetch(); });
  await waitFor(() => expect(api.submitCrewmatePurchaseCustomization).toHaveBeenCalledWith({
    purchaseId: 'one', grantRequest: checkoutCustomization.grantRequest
  }));
  await act(async () => { await result.current.refetch(); });
  expect(api.submitCrewmatePurchaseCustomization).toHaveBeenCalledTimes(1);
});

test.each([
  { accountAddress: '0x456', checkoutSessionId: 'cs_one' },
  { accountAddress: '0x123', checkoutSessionId: 'cs_other' }
])('does not reuse a fresh checkout confirmation for another account or purchase (%j)', async (identity) => {
  const checkoutCustomization = { ...identity, grantRequest: { name: 'Previously confirmed' } };
  api.getCrewmatePurchaseCheckout.mockResolvedValue({ purchase: paidPurchase('one') });
  const { result } = renderHook(() => useCrewmatePurchaseCheckout('cs_one', checkoutCustomization), { wrapper });
  await waitFor(() => expect(result.current.data?.purchase.id).toBe('one'));
  expect(api.submitCrewmatePurchaseCustomization).not.toHaveBeenCalled();
});

test('automatic submission failure is exposed and requires explicit retry', async () => {
  const checkoutCustomization = {
    accountAddress: '0x123', checkoutSessionId: 'cs_one', grantRequest: { name: 'Ada' }
  };
  api.getCrewmatePurchaseCheckout.mockResolvedValue({ purchase: paidPurchase('one') });
  api.submitCrewmatePurchaseCustomization.mockRejectedValueOnce(new Error('Temporary failure'))
    .mockResolvedValueOnce({ purchase: paidPurchase('one', 'grant_submitted') });
  const { result } = renderHook(() => useCrewmatePurchaseCheckout('cs_one', checkoutCustomization), { wrapper });
  await waitFor(() => expect(result.current.automaticSubmissionError?.message).toBe('Temporary failure'));
  await act(async () => { await result.current.refetch(); });
  expect(api.submitCrewmatePurchaseCustomization).toHaveBeenCalledTimes(1);
  await act(async () => { await result.current.submitCustomization({ name: 'Reviewed Ada' }); });
  expect(api.submitCrewmatePurchaseCustomization).toHaveBeenLastCalledWith({
    purchaseId: 'one', grantRequest: { name: 'Reviewed Ada' }
  });
});
