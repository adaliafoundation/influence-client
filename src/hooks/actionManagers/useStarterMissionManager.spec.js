const { TextDecoder, TextEncoder } = require('util');
global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;
const React = require('react');
const { renderHook, act } = require('@testing-library/react');

jest.mock('~/contexts/ChainTransactionContext', () => ({ __esModule: true, default: require('react').createContext() }), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => ({ __esModule: true, default: () => ({ crew: { id: 501 }, pendingTransactions: [] }) }), { virtual: true });
jest.mock('~/hooks/useSession', () => ({ __esModule: true, default: () => ({ accountAddress: '0xabc' }) }), { virtual: true });
jest.mock('~/hooks/useStarterMissions', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('~/lib/starterMissions', () => jest.requireActual('../../lib/starterMissions'), { virtual: true });

const Context = require('~/contexts/ChainTransactionContext').default;
const useStarterMissions = require('~/hooks/useStarterMissions').default;
const useStarterMissionManager = require('./useStarterMissionManager').default;
const execute = jest.fn();
const wrapper = ({ children }) => <Context.Provider value={{ execute }}>{children}</Context.Provider>;

test.each([
  [false, true, 'CompleteStarterMission'],
  [true, true, 'ClaimMissionReward'],
  [true, false, 'ClaimMissionReward']
])('completion with claimable=%s and eligible=%s uses %s', (claimable, eligible, system) => {
  execute.mockClear();
  useStarterMissions.mockReturnValue({ data: {
    campaign: '123', subject: { id: '501', label: 1 }, recipient: '0xabc', eligible,
    missions: [{ id: 0, accepted: true, earned: true, claimable }]
  } });
  const { result } = renderHook(() => useStarterMissionManager(), { wrapper });
  act(() => result.current.complete(0));
  expect(execute).toHaveBeenCalledWith(system, {
    assignment: { campaign: '123', subject: { id: '501', label: 1 }, mission: 0 }
  });
});
