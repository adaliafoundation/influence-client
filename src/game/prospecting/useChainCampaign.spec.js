import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { Prospecting } from '@influenceth/sdk';
import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useChainCampaign from './useChainCampaign';

let mockState;
const mockProvider = {};
const mockCrew = { id: 1 };
const mockGame = { dispatcher: '0x9', origin: jest.fn(), campaign: jest.fn() };
const mockTransactions = { getStatus: jest.fn(() => null), execute: jest.fn() };
jest.mock('@influenceth/sdk', () => {
  const sdk = jest.requireActual('@influenceth/sdk');
  return { ...sdk, Prospecting: { ...sdk.Prospecting, Game: { createClient: () => mockGame } } };
});
jest.mock('~/contexts/ChainTransactionContext', () => require('react').createContext({}), { virtual: true });
jest.mock('~/hooks/useSession', () => () => ({ provider: mockProvider, accountAddress: '0x2', chainId: '0x1' }), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => () => ({ crew: mockCrew }), { virtual: true });
jest.mock('~/appConfig', () => ({ appConfig: { get: () => '0x9' } }), { virtual: true });
jest.mock('~/lib/api', () => ({}), { virtual: true });
jest.mock('~/lib/utils', () => ({ resolveChainId: value => value }), { virtual: true });
jest.mock('@tanstack/react-query', () => ({ useInfiniteQuery: () => ({}) }));
jest.mock('./store', () => ({ useProspecting: () => mockState, prospectingOnchain: () => true }));
jest.mock('@zkpassport/poseidon2', () => jest.requireActual('../../../node_modules/@zkpassport/poseidon2/dist/cjs/index.cjs'));

const campaign = { id: '7', owner: '0x2', resource: 1, crew: { id: 1 }, context: '10', qualityBps: 10000, sampleCount: 0 };
const wrapper = ({ children }) => <ChainTransactionContext.Provider value={mockTransactions}>{children}</ChainTransactionContext.Provider>;
beforeEach(() => {
  mockState = { active: true, asteroidId: 1, originIndex: 1, resource: 1, mode: 'local-simulation' };
  mockGame.origin.mockReset().mockResolvedValue('7');
  mockGame.campaign.mockReset().mockImplementation(async () => ({ ...campaign }));
});

it('retains the initial private record across public campaign refreshes', async () => {
  const { result } = renderHook(() => useChainCampaign(), { wrapper });
  await waitFor(() => expect(result.current.campaign?.id).toBe('7'));
  const initial = result.current.initialRecord;
  await act(async () => result.current.viewCampaign('7'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.initialRecord).toBe(initial);
  expect(Prospecting.replayCampaign(initial).history).toHaveLength(0);
});

it('requires backup recovery rather than seeding over accepted private work', async () => {
  mockGame.campaign.mockResolvedValue({ ...campaign, sampleCount: 2 });
  const { result } = renderHook(() => useChainCampaign(), { wrapper });
  await waitFor(() => expect(result.current.campaign?.id).toBe('7'));
  await expect(result.current.validateNewRecord()).rejects.toThrow('Private sample data is missing');
});

it('hides the old campaign immediately when its account/lot/material scope changes', async () => {
  const { result, rerender } = renderHook(() => useChainCampaign(), { wrapper });
  await waitFor(() => expect(result.current.campaign?.id).toBe('7'));
  let resolveOrigin;
  mockGame.origin.mockImplementation(() => new Promise(resolve => { resolveOrigin = resolve; }));
  mockState = { ...mockState, resource: 2 };
  rerender();
  expect(result.current.campaign).toBeNull();
  expect(result.current.initialRecord).toBeFalsy();
  await act(async () => resolveOrigin('0'));
  expect(result.current.campaign).toBeNull();
});

it('can open an archived campaign while a different campaign occupies the origin', async () => {
  mockGame.campaign.mockImplementation(async id => ({ ...campaign, id }));
  const { result } = renderHook(() => useChainCampaign(), { wrapper });
  await waitFor(() => expect(result.current.campaign?.id).toBe('7'));
  act(() => result.current.viewCampaign('6'));
  await waitFor(() => expect(result.current.campaign?.id).toBe('6'));
  expect(result.current.occupying.id).toBe('7');
  expect(result.current.initialRecord.campaignId).toBe('6');
});
