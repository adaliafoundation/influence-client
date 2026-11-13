import { act, renderHook, waitFor } from '@testing-library/react';
import useCampaignStorage from './useCampaignStorage';
import { useProspecting } from './store';
import { createCampaignRepository } from './campaignRepository';
import { createPrivateDataTransport } from '~/lib/privateData/transport.mjs';

let mockKey, mockRepository, mockTransport;
jest.mock('~/appConfig', () => ({ appConfig: { get: (key) => ({
  'App.enableDevTools': true, 'App.privateDataPeers': '/test/peer', 'Starknet.Address.dispatcher': '0x1'
})[key] } }), { virtual: true });
jest.mock('~/hooks/useSession', () => () => ({ accountAddress: '0x1', chainId: '0x1' }), { virtual: true });
jest.mock('~/hooks/useUser', () => () => ({ data: { publicKey: 'PUBLIC', hasSeed: true } }), { virtual: true });
jest.mock('~/hooks/usePrivateDataKey', () => () => ({ privateKey: mockKey, unlock: jest.fn() }), { virtual: true });
jest.mock('~/lib/utils', () => ({ resolveChainId: (chain) => chain }), { virtual: true });
jest.mock('~/lib/inboxKeys', () => ({ assertInboxKey: jest.fn() }), { virtual: true });

jest.mock('@zkpassport/poseidon2', () =>
  jest.requireActual('../../../node_modules/@zkpassport/poseidon2/dist/cjs/index.cjs')
);
jest.mock('./campaignRepository', () => ({ createCampaignRepository: jest.fn() }));
jest.mock('~/lib/privateData/transport.mjs', () => ({ createPrivateDataTransport: jest.fn() }), { virtual: true });

beforeEach(() => {
  Object.defineProperty(global, 'crypto', { configurable: true, value: require('node:crypto').webcrypto });
  mockKey = 'KEY';
  mockRepository = {
    load: jest.fn(async () => null), save: jest.fn(async (_, revision) => revision + 1),
    restore: jest.fn(), pendingEnvelope: jest.fn(async () => null), replicate: jest.fn()
  };
  mockTransport = { get: jest.fn(async () => null), stop: jest.fn(async () => {}) };
  createCampaignRepository.mockReturnValue(mockRepository);
  createPrivateDataTransport.mockResolvedValue(mockTransport);
  useProspecting.getState().detachStorage();
  useProspecting.getState().open(1, 1, 1);
});
afterEach(() => useProspecting.getState().detachStorage());

it('continues encrypted local saving while the retention peer is offline', async () => {
  mockTransport.get.mockRejectedValue(new Error('peer offline'));
  mockRepository.replicate.mockRejectedValue(new Error('peer offline'));
  const { result } = renderHook(() => useCampaignStorage());
  await waitFor(() => expect(useProspecting.getState().storageStatus).toBe('ready'));
  expect(mockRepository.save).toHaveBeenCalledTimes(1);
  expect(useProspecting.getState().busy).toBe(false);
  expect(result.current.backupLabel).toContain('pending');
});
it('locks decrypted state and ignores recovery completing after the key is locked', async () => {
  let resolveRemote;
  mockTransport.get.mockImplementation(() => new Promise((resolve) => { resolveRemote = resolve; }));
  const { rerender } = renderHook(() => useCampaignStorage());
  await waitFor(() => expect(mockTransport.get).toHaveBeenCalled());
  mockKey = null;
  rerender();
  await act(async () => { resolveRemote({ revision: 12 }); });
  expect(useProspecting.getState().storageStatus).toBe('locked');
  expect(useProspecting.getState().storage).toBeNull();
  expect(useProspecting.getState().history).toEqual([]);
  expect(mockRepository.restore).not.toHaveBeenCalled();
  expect(mockRepository.save).not.toHaveBeenCalled();
});
it('blocks recovery when a peer returns a forged private record', async () => {
  mockTransport.get.mockRejectedValue(Object.assign(new Error('authentication failed'), { code: 'PRIVATE_DATA_INVALID_RECORD' }));
  renderHook(() => useCampaignStorage());
  await waitFor(() => expect(useProspecting.getState().storageStatus).toBe('error'));
  expect(useProspecting.getState().message).toContain('authentication failed');
  expect(mockRepository.save).not.toHaveBeenCalled();
});
