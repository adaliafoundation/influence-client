import { act, renderHook, waitFor } from '@testing-library/react';
import useLocalCampaigns from './useLocalCampaigns';
import { listCampaigns } from './campaignRepository';

let mockOwner = '0x1', mockPrivateKey = '0x12';
jest.mock('~/appConfig', () => ({ appConfig: { get: () => '0x3' } }), { virtual: true });
jest.mock('~/hooks/useSession', () => () => ({ accountAddress: mockOwner, chainId: '0x1' }), { virtual: true });
jest.mock('~/hooks/usePrivateDataKey', () => () => ({ privateKey: mockPrivateKey, publicKey: 'PUBLIC', unlock: jest.fn() }), { virtual: true });
jest.mock('~/lib/utils', () => ({ resolveChainId: (chain) => chain }), { virtual: true });
jest.mock('./campaignRepository', () => ({ listCampaigns: jest.fn() }));

beforeEach(() => {
  mockOwner = '0x1'; mockPrivateKey = '0x12';
  listCampaigns.mockReset().mockResolvedValue([{ context: 'private-discovery' }]);
});

it('removes decrypted claims when locked and ignores loads completing for an old account', async () => {
  const { result, rerender } = renderHook(() => useLocalCampaigns(1));
  await waitFor(() => expect(result.current.campaigns).toHaveLength(1));
  mockPrivateKey = null;
  rerender();
  expect(result.current.campaigns).toEqual([]);
  expect(result.current.locked).toBe(true);
  let resolveOld;
  listCampaigns.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  mockPrivateKey = '0x12';
  rerender();
  mockOwner = '0x2';
  listCampaigns.mockResolvedValue([]);
  rerender();
  await act(async () => { resolveOld([{ context: 'old-account-secret' }]); });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.campaigns).toEqual([]);
});
