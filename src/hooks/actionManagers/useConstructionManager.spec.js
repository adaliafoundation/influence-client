jest.mock('../useFailureReporter', () => () => result => {
  require('../../lib/errorReporting').reportFailure(jest.fn(), result, { message: 'accessChanged' });
  return result;
});
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const React = require('react');
const { renderHook } = require('@testing-library/react');

jest.mock('~/contexts/ChainTransactionContext', () => ({ __esModule: true, default: require('react').createContext() }), { virtual: true });
jest.mock('~/hooks/useStarterMissionExecution', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('~/hooks/usePlanningEligibility', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => () => ({ crewControls: () => true, crew: { id: 1 } }), { virtual: true });
jest.mock('~/hooks/useBlockTime', () => () => 100, { virtual: true });
jest.mock('~/hooks/useUnresolvedActivities', () => () => ({ data: [] }), { virtual: true });
jest.mock('~/hooks/useLot', () => () => ({ data: { id: 1 } }), { virtual: true });
jest.mock('~/hooks/useAsteroid', () => () => ({ data: {} }), { virtual: true });
jest.mock('~/lib/actionStages', () => ({}), { virtual: true });

const { Entity } = require('@influenceth/sdk');
const Context = require('~/contexts/ChainTransactionContext').default;
const useStarterMissionExecution = require('~/hooks/useStarterMissionExecution').default;
const usePlanningEligibility = require('~/hooks/usePlanningEligibility').default;
const useConstructionManager = require('./useConstructionManager').default;
const wrapper = ({ children }) => <Context.Provider value={{ getPendingTx: () => null, getStatus: () => null }}>{children}</Context.Provider>;

test.each(['blocked', 'checking', 'allowed'])('submission respects the fresh %s result rather than the displayed eligibility', async (status) => {
  const execute = jest.fn();
  const recheck = jest.fn(async () => ({ status, reason: status === 'allowed' ? null : 'Permission changed' }));
  useStarterMissionExecution.mockReturnValue(execute);
  usePlanningEligibility.mockReturnValue({ eligibility: { status: 'allowed' }, recheck });
  const { result } = renderHook(() => useConstructionManager(1), { wrapper });
  await result.current.planConstruction(2);
  expect(recheck).toHaveBeenCalledWith({ lotId: 1, crewId: 1 });
  expect(execute.mock.calls).toEqual(status === 'allowed' ? [[
    'ConstructionPlan', { building_type: 2, lot: { id: 1, label: Entity.IDS.LOT }, caller_crew: { id: 1, label: Entity.IDS.CREW } }
  ]] : []);
});
