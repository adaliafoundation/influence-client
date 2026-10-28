import { renderHook } from '@testing-library/react';
import { useQuery } from '@tanstack/react-query';
import api from '~/lib/api';
import useMissionCampaigns from './useMissionCampaigns';

jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn() }));
jest.mock('~/appConfig', () => ({ appConfig: { get: () => 'api' } }), { virtual: true });
jest.mock('~/lib/api', () => ({ getConstants: jest.fn(), getMissionCampaign: jest.fn() }), { virtual: true });
jest.mock('~/hooks/useSession', () => () => ({ chainId: 'sepolia', token: 'token' }), { virtual: true });
jest.mock('~/hooks/useSimulationEnabled', () => () => false, { virtual: true });

beforeEach(() => jest.clearAllMocks());
const query = () => {
  renderHook(() => useMissionCampaigns());
  return useQuery.mock.calls[0][0];
};
test('inactive constants hide campaigns without fetching subject or definition data', async () => {
  api.getConstants.mockResolvedValue({ COLONIZATION_CAMPAIGN: '0' });
  expect(await query().queryFn()).toEqual({ starter: false, colonization: false });
  expect(api.getMissionCampaign).not.toHaveBeenCalled();
});
test('registered campaigns turn on and off as indexed constants change', async () => {
  api.getConstants.mockResolvedValue({ STARTER_MISSION_CAMPAIGN: '123', STARTER_MISSION_CUTOFF: '456', COLONIZATION_CAMPAIGN: '789' });
  api.getMissionCampaign.mockImplementation(id => Promise.resolve({ missionCount: id === '123' ? 8 : 5 }));
  const config = query();
  expect(config.refetchInterval).toBeUndefined();
  expect(await config.queryFn()).toEqual({ starter: true, colonization: true });
  api.getConstants.mockResolvedValue({ COLONIZATION_CAMPAIGN: '0' });
  expect(await config.queryFn()).toEqual({ starter: false, colonization: false });
});
test('a configured but unregistered campaign stays hidden; lookup errors remain errors', async () => {
  api.getConstants.mockResolvedValue({ COLONIZATION_CAMPAIGN: '789' });
  api.getMissionCampaign.mockResolvedValue(null);
  const config = query();
  expect(await config.queryFn()).toEqual({ starter: false, colonization: false });
  api.getMissionCampaign.mockRejectedValue(new Error('Network error'));
  await expect(config.queryFn()).rejects.toThrow('Network error');
});
