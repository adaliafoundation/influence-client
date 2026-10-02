import { act, renderHook } from '@testing-library/react';
import useProductionAuthorization from './useProductionAuthorization';
import useCrewContext from './useCrewContext';
import useBlockTime from './useBlockTime';
import useStore from './useStore';
import { errorMessages } from '../lib/errorMessages';

jest.mock('@influenceth/sdk', () => ({ Time: { getProductionCompletionTime: (time, ready, duration) => Math.max(time, ready) + duration } }));
jest.mock('./useCrewContext', () => jest.fn());
jest.mock('./useBlockTime', () => jest.fn());
jest.mock('./useStore', () => jest.fn());
jest.mock('~/lib/productionAuthorization', () => ({ productionChecks: () => [], acquisitionMatches: jest.fn() }), { virtual: true });

test('block updates retain the production preview; submission still checks the job and handles revocation', async () => {
  const createAlert = jest.fn();
  useStore.mockImplementation(selector => selector({ dispatchAlertLogged: createAlert }));
  const authorize = jest.fn(() => ({ status: 'allowed' }));
  const recheckAuthorization = jest.fn().mockResolvedValue({ status: 'denied' });
  const retryAuthorization = jest.fn();
  useCrewContext.mockReturnValue({ authorize, recheckAuthorization, retryAuthorization });
  useBlockTime.mockReturnValue(100);
  const inputs = { kind: 'process', crew: { id: 1, Crew: { readyAt: 90 } }, facility: { id: 2 }, duration: 20 };
  const { result, rerender } = renderHook((props) => useProductionAuthorization(props), { initialProps: inputs });
  const originalRequest = authorize.mock.calls[0][1][0];
  expect(result.current.completionTime).toBe(120);
  useBlockTime.mockReturnValue(105);
  rerender({ ...inputs, crew: { ...inputs.crew, _ready: true, _food: 90 } });
  expect(authorize.mock.calls.at(-1)[1][0]).toBe(originalRequest);
  expect(result.current.completionTime).toBe(120);
  await act(async () => result.current.recheck());
  expect(recheckAuthorization).toHaveBeenCalledWith('production', [{ ...originalRequest, duration: 20 }], [expect.objectContaining(inputs.crew), inputs.facility]);
  expect(retryAuthorization).toHaveBeenCalledTimes(1);
  expect(createAlert).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ content: errorMessages.productionChanged }) }));
  expect(result.current.message).toBeNull();
  rerender({ ...inputs, duration: 30 });
  expect(result.current.completionTime).toBe(135);
});
