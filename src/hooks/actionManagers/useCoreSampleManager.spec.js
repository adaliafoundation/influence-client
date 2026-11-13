import { renderHook } from '@testing-library/react';
import { Deposit, Entity } from '@influenceth/sdk';
import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useCoreSampleManager from './useCoreSampleManager';
import useCrewContext from '~/hooks/useCrewContext';
import useLot from '~/hooks/useLot';
import useBlockTime from '~/hooks/useBlockTime';

jest.mock('../useFailureReporter', () => () => jest.fn());
jest.mock('~/contexts/ChainTransactionContext', () => ({ __esModule: true, default: require('react').createContext() }), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useLot', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useBlockTime', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useUnresolvedActivities', () => () => ({ data: [] }), { virtual: true });
jest.mock('~/game/prospecting/store', () => ({ prospectingOnchain: () => true }), { virtual: true });
jest.mock('~/lib/actionStages', () => jest.requireActual('../../lib/actionStages'), { virtual: true });
jest.mock('~/lib/starterPacks', () => ({ getStarterCoreSampleSource: () => null }), { virtual: true });

let execute;
const wrapper = ({ children }) => <ChainTransactionContext.Provider value={{ execute, getStatus: () => null, getPendingTx: () => null }}>{children}</ChainTransactionContext.Provider>;
beforeEach(() => {
  execute = jest.fn();
  useBlockTime.mockReturnValue(300);
  useCrewContext.mockReturnValue({ crew: { id: 1 }, accountCrewIds: [1, 9], pendingTransactions: [] });
  useLot.mockReturnValue({ data: { deposits: [{ id: 42, Deposit: {
    status: Deposit.STATUSES.SAMPLING, resource: 1, initialYield: 0, finishTime: 200
  }, Control: { controller: { id: 9 } } }] } });
});
it('finishes using the actual sample crew even when another account crew is selected', () => {
  const { result } = renderHook(() => useCoreSampleManager(7), { wrapper });
  result.current.finishSampling(42);
  expect(execute).toHaveBeenCalledWith('SampleDepositFinish', {
    lot: { label: Entity.IDS.LOT, id: 7 }, deposit: { label: Entity.IDS.DEPOSIT, id: 42 },
    caller_crew: { label: Entity.IDS.CREW, id: 9 }
  }, { lotId: 7, isNew: true });
});
it('does not expose another account’s pending sample', () => {
  useCrewContext.mockReturnValue({ crew: { id: 1 }, accountCrewIds: [1], pendingTransactions: [] });
  const { result } = renderHook(() => useCoreSampleManager(7), { wrapper });
  result.current.finishSampling(42);
  expect(execute).not.toHaveBeenCalled();
});
it('keeps legacy start and improvement transactions disabled after activation', async () => {
  const { result } = renderHook(() => useCoreSampleManager(7), { wrapper });
  result.current.startSampling(1);
  await result.current.startImproving(42);
  expect(execute).not.toHaveBeenCalled();
});
