const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const React = require('react');
const { render, act } = require('@testing-library/react');
const { Entity, Lot, Permission } = require('@influenceth/sdk');

jest.mock('~/hooks/useCrewContext', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useGetActivityConfig', () => () => () => ({}), { virtual: true });
jest.mock('~/hooks/useStore', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useSimulationState', () => () => ({}), { virtual: true });
jest.mock('~/lib/priceUtils', () => ({ TOKEN: { SWAY: 'sway' }, TOKEN_SCALE: { sway: 1e6 } }), { virtual: true });

const useCrewContext = require('~/hooks/useCrewContext');
const useStore = require('~/hooks/useStore');
const MockTransactionManager = require('./MockTransactionManager').default;
const simulationConfig = require('./simulationConfig').default;

let state, transaction;
beforeEach(() => {
  jest.useFakeTimers();
  state = { dispatchSimulationState: jest.fn(), dispatchPendingTransactionComplete: jest.fn() };
  useStore.mockImplementation(selector => selector(state));
  const crew = { id: simulationConfig.crewId, label: Entity.IDS.CREW, Crew: {}, _crewmates: [] };
  const term = 30 * 86400;
  transaction = {
    key: 'AcceptPrepaidAgreement', txHash: '0xlease',
    vars: {
      target: { id: Lot.toId(1, 500), label: Entity.IDS.LOT },
      caller_crew: crew, permitted: crew, permission: Permission.IDS.USE_LOT,
      term, termPrice: Permission.getPrepaidAgreementPaymentAmount(1000000, term)
    }
  };
  useCrewContext.mockReturnValue({ crew, pendingTransactions: [transaction] });
});
afterEach(() => jest.useRealTimers());

test('completes the tutorial lease with the bigint payment produced by the agreement form', () => {
  render(<MockTransactionManager />);
  act(() => jest.advanceTimersByTime(2000));
  const lots = state.dispatchSimulationState.mock.calls.find(([key]) => key === 'lots')[1];
  expect(Object.keys(lots)).toHaveLength(5);
  expect(lots[transaction.vars.target.id]).toEqual({ leaseTerm: transaction.vars.term, leaseRate: 1000000 });
  expect(state.dispatchSimulationState).toHaveBeenCalledWith('sway',
    simulationConfig.startingSway - 5 * Number(transaction.vars.termPrice));
  expect(state.dispatchPendingTransactionComplete).toHaveBeenCalledWith('0xlease');
});
