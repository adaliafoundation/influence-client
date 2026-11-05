import { renderHook } from '@testing-library/react';

jest.mock('~/appConfig/features', () => ({ features: { stripe: true } }), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/usePendingCrewmatePurchases', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useSession', () => jest.fn(), { virtual: true });

const useCrewContext = require('~/hooks/useCrewContext');
const usePendingCrewmatePurchases = require('~/hooks/usePendingCrewmatePurchases');
const useSession = require('~/hooks/useSession');
const useRecruitmentDestination = require('./useRecruitmentDestination').default;

beforeEach(() => {
  useCrewContext.mockReturnValue({ adalianRecruits: [] });
  useSession.mockReturnValue({ walletCapabilities: { preferredForStarterPacks: true } });
  usePendingCrewmatePurchases.mockReturnValue({ enabled: true, purchases: [] });
});

test('offers packs to a new account without credits', () => {
  expect(renderHook(useRecruitmentDestination).result.current).toBe('packs');
});

test.each(['stripe', 'onchain'])('resumes recruitment with a %s credit', type => {
  if (type === 'stripe') usePendingCrewmatePurchases.mockReturnValue({ enabled: true, purchases: [{ id: 'paid' }] });
  else useCrewContext.mockReturnValue({ adalianRecruits: [{ id: 1 }] });
  expect(renderHook(useRecruitmentDestination).result.current).toBe('/recruit/0');
});

test('waits for paid purchase recovery before automatically redirecting', () => {
  usePendingCrewmatePurchases.mockReturnValue({ enabled: true, isPending: true, purchases: [] });
  expect(renderHook(useRecruitmentDestination).result.current).toBeNull();
});

test('keeps recruitment accessible when purchase lookup fails', () => {
  usePendingCrewmatePurchases.mockReturnValue({ enabled: true, isError: true, purchases: [] });
  expect(renderHook(useRecruitmentDestination).result.current).toBe('/recruit/0');
});
