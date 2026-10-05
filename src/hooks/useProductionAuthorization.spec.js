import { act, renderHook } from '@testing-library/react';
import useProductionAuthorization from './useProductionAuthorization';
import useCrewContext from './useCrewContext';
import useBlockTime from './useBlockTime';
import useStore from './useStore';
import { errorMessages } from '../lib/errorMessages';

jest.mock('@influenceth/sdk', () => ({
  Time: { getProductionCompletionTime: (time, ready, duration) => Math.max(time, ready) + duration },
  Permission: { IDS: { RUN_PROCESS: 1, EXTRACT_RESOURCES: 2, ASSEMBLE_SHIP: 3, USE_DEPOSIT: 4, REMOVE_PRODUCTS: 5, ADD_PRODUCTS: 6 } }
}));
jest.mock('./useCrewContext', () => jest.fn());
jest.mock('./useBlockTime', () => jest.fn());
jest.mock('./useStore', () => jest.fn());
jest.mock('~/lib/productionAuthorization', () => jest.requireActual('../lib/productionAuthorization'), { virtual: true });

test('block updates retain the production preview; submission still checks the job and handles revocation', async () => {
  const createAlert = jest.fn();
  useStore.mockImplementation(selector => selector({ dispatchAlertLogged: createAlert }));
  const authorize = jest.fn(() => ({ status: 'allowed' }));
  const recheckAuthorization = jest.fn().mockResolvedValue({ status: 'denied' });
  const retryAuthorization = jest.fn();
  useCrewContext.mockReturnValue({ authorize, recheckAuthorization, retryAuthorization });
  useBlockTime.mockReturnValue(100);
  const inputs = { kind: 'process', crew: { id: 1, Crew: { readyAt: 90 } }, facility: { id: 2 }, origin: { id: 3 }, destination: { id: 4 }, duration: 20 };
  const { result, rerender } = renderHook((props) => useProductionAuthorization(props), { initialProps: inputs });
  const originalRequest = authorize.mock.calls[0][1][0];
  expect(result.current.completionTime).toBe(120);
  useBlockTime.mockReturnValue(105);
  rerender({ ...inputs, crew: { ...inputs.crew, _ready: true, _food: 90 } });
  expect(authorize.mock.calls.filter(([method]) => method === 'production').at(-1)[1][0]).toBe(originalRequest);
  expect(result.current.completionTime).toBe(120);
  await act(async () => result.current.recheck());
  expect(recheckAuthorization).toHaveBeenCalledWith('production', [{ ...originalRequest, duration: 20 }], [expect.objectContaining(inputs.crew), inputs.facility, inputs.origin, inputs.destination]);
  expect(retryAuthorization).toHaveBeenCalledTimes(1);
  expect(createAlert).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ content: errorMessages.productionChanged }) }));
  expect(result.current.message).toBeNull();
  rerender({ ...inputs, duration: 30 });
  expect(result.current.completionTime).toBe(135);
});

test.each(['extract', 'process', 'assemble'])('%s stays silent until permissions are explicitly denied', (kind) => {
  useStore.mockImplementation(selector => selector({ dispatchAlertLogged: jest.fn() }));
  useBlockTime.mockReturnValue(100);
  const authorize = jest.fn(() => ({ status: 'unresolved' }));
  useCrewContext.mockReturnValue({ authorize });
  let inputs = { kind, crew: { id: 1, Crew: { readyAt: 90 } }, facility: { id: 2 }, duration: 20 };
  const { result, rerender } = renderHook(props => useProductionAuthorization(props), { initialProps: inputs });
  expect(result.current.allowed).toBe(false);
  expect(result.current.message).toBeNull();

  inputs = { ...inputs, [kind === 'extract' ? 'deposit' : 'origin']: { id: 3 } };
  rerender(inputs);
  expect(result.current.message).toBeNull();
  expect(result.current.allowed).toBe(false);
  if (kind !== 'assemble') {
    inputs = { ...inputs, destination: { id: 4 } };
    rerender(inputs);
  }
  expect(result.current.message).toBeNull();
  expect(result.current.allowed).toBe(false);

  authorize.mockReturnValue({ status: 'denied' });
  rerender(inputs);
  expect(result.current.message).toMatch('Access must cover this job through completion.');
  expect(result.current.allowed).toBe(false);

  authorize.mockReturnValue({ status: 'allowed' });
  rerender(inputs);
  expect(result.current.message).toBeNull();
  expect(result.current.allowed).toBe(true);

  rerender({ ...inputs, [kind === 'extract' ? 'deposit' : 'origin']: undefined });
  expect(result.current.allowed).toBe(false);
  expect(result.current.message).toBeNull();
});
