jest.mock('~/contexts/MissionActionContext', () => ({ useMissionAction: jest.fn(() => null) }), { virtual: true });
import React from 'react';
import { useMissionAction } from '~/contexts/MissionActionContext';
import { renderHook, act } from '@testing-library/react';
import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useStarterMissionExecution from './useStarterMissionExecution';
import useStarterMissions from '~/hooks/useStarterMissions';

jest.mock('~/contexts/ChainTransactionContext', () => ({ __esModule: true, default: require('react').createContext() }), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => ({ __esModule: true, default: () => ({ crew: { id: 501 } }) }), { virtual: true });
jest.mock('~/hooks/useStarterMissions', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('~/lib/starterMissions', () => ({
  getStarterMissionAssignment: (view, mission) => ({ campaign: view.campaign, subject: view.subject, mission })
}), { virtual: true });

const view = { campaign: '123', subject: { id: '501', label: 1 } };
const execute = jest.fn();
const wrapper = ({ children }) => <ChainTransactionContext.Provider value={{ execute }}>{children}</ChainTransactionContext.Provider>;

beforeEach(() => {
  jest.clearAllMocks();
  useMissionAction.mockReturnValue(null);
  useStarterMissions.mockReturnValue({ data: view });
});

test('ordinary gameplay does not request a crew mission view or change transaction inputs', () => {
  const { result } = renderHook(() => useStarterMissionExecution(), { wrapper });
  const vars = { lot: { id: 123 } };
  act(() => result.current('ConstructionPlan', vars, { lotId: 123 }));
  expect(useStarterMissions).toHaveBeenCalledWith(null);
  expect(execute).toHaveBeenCalledWith('ConstructionPlan', vars, { lotId: 123 }, {});
});

test('mission zero is explicit and native keys, vars, metadata and wallet options survive', () => {
  const { result } = renderHook(() => useStarterMissionExecution(0), { wrapper });
  const vars = { lot: { id: 123 } };
  act(() => result.current('ConstructionPlan', vars, { lotId: 123 }, { usePaymaster: false }));
  expect(useStarterMissions).toHaveBeenCalledWith(501);
  expect(execute).toHaveBeenCalledWith('ConstructionPlan', vars, { lotId: 123 }, {
    usePaymaster: false,
    missionAssignment: { campaign: '123', subject: view.subject, mission: 0 }
  });
});

test('mission gameplay cannot silently fall back to an uncredited native action before loading', () => {
  useStarterMissions.mockReturnValue({ data: undefined });
  const { result } = renderHook(() => useStarterMissionExecution(0), { wrapper });
  expect(() => result.current('ConstructionPlan', {})).toThrow('not loaded');
  expect(execute).not.toHaveBeenCalled();
});


test('shared dialog context supplies an assignment without changing native arguments', async () => {
  const missionAssignment = { campaign: '123', subject: view.subject, mission: 0 };
  useMissionAction.mockReturnValue({ prepare: async (key, vars, options) => ({ ...options, missionAssignment }) });
  const { result } = renderHook(() => useStarterMissionExecution(), { wrapper });
  const vars = { lot: { id: 123 } };
  await act(async () => { await result.current('ConstructionPlan', vars, { lotId: 123 }, { usePaymaster: false }); });
  expect(execute).toHaveBeenCalledWith('ConstructionPlan', vars, { lotId: 123 }, { usePaymaster: false, missionAssignment });
});

test('a failed contextual verification does not execute an ordinary transaction', async () => {
  useMissionAction.mockReturnValue({ prepare: async () => null });
  const { result } = renderHook(() => useStarterMissionExecution(), { wrapper });
  await act(async () => { await result.current('ProcessProductsFinish', {}); });
  expect(execute).not.toHaveBeenCalled();
});
