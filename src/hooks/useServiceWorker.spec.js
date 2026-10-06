import { act, renderHook, waitFor } from '@testing-library/react';
import useServiceWorker from './useServiceWorker';

let serviceWorker;
let registration;
const originalLocation = window.location;

beforeEach(() => {
  delete window.location;
  window.location = { reload: jest.fn() };
  registration = Object.assign(new EventTarget(), {
    active: {}, waiting: null, installing: null
  });
  serviceWorker = Object.assign(new EventTarget(), {
    controller: {}, getRegistration: jest.fn().mockResolvedValue(registration)
  });
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: serviceWorker });
});

afterEach(() => {
  jest.useRealTimers();
  window.location = originalLocation;
  delete navigator.serviceWorker;
});

test('waits for activation before reloading, and reloads only once', async () => {
  registration.waiting = { postMessage: jest.fn() };
  const { result } = renderHook(() => useServiceWorker());
  await waitFor(() => expect(result.current.updateNeeded).toBe(true));
  expect(result.current.isInstalling).toBe(false);

  await act(async () => result.current.onUpdateVersion());
  expect(registration.waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  expect(result.current.isUpdating).toBe(true);
  expect(window.location.reload).not.toHaveBeenCalled();

  act(() => {
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    serviceWorker.dispatchEvent(new Event('controllerchange'));
  });
  expect(window.location.reload).toHaveBeenCalledTimes(1);
});

test('does not prompt until installation finishes', async () => {
  const worker = Object.assign(new EventTarget(), { state: 'installing' });
  registration.installing = worker;
  const { result, unmount } = renderHook(() => useServiceWorker());
  await waitFor(() => expect(result.current.isInstalling).toBe(false));
  expect(result.current.updateNeeded).toBe(false);
  act(() => {
    worker.state = 'installed';
    worker.dispatchEvent(new Event('statechange'));
  });
  expect(result.current.updateNeeded).toBe(true);
  unmount();
  serviceWorker.dispatchEvent(new Event('controllerchange'));
  expect(window.location.reload).not.toHaveBeenCalled();
});

test('reloads when the waiting worker is no longer available', async () => {
  const { result } = renderHook(() => useServiceWorker());
  await act(async () => result.current.onUpdateVersion());
  expect(window.location.reload).toHaveBeenCalledTimes(1);
  expect(result.current.isUpdating).toBe(true);
  expect(result.current.updateNeeded).toBe(false);
});

test('reloads after a stalled activation and ignores a late controller change', async () => {
  jest.useFakeTimers();
  registration.waiting = { postMessage: jest.fn() };
  const { result } = renderHook(() => useServiceWorker());
  await act(async () => result.current.onUpdateVersion());
  act(() => jest.advanceTimersByTime(9999));
  expect(window.location.reload).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(1));
  expect(window.location.reload).toHaveBeenCalledTimes(1);
  act(() => serviceWorker.dispatchEvent(new Event('controllerchange')));
  expect(window.location.reload).toHaveBeenCalledTimes(1);
});

test('cancels the pending reload on unmount', async () => {
  jest.useFakeTimers();
  registration.waiting = { postMessage: jest.fn() };
  const { result, unmount } = renderHook(() => useServiceWorker());
  await act(async () => result.current.onUpdateVersion());
  unmount();
  act(() => jest.runOnlyPendingTimers());
  expect(window.location.reload).not.toHaveBeenCalled();
});

test('reloads if registration lookup fails', async () => {
  serviceWorker.getRegistration.mockRejectedValue(new Error('Lookup failed'));
  const { result } = renderHook(() => useServiceWorker());
  await act(async () => result.current.onUpdateVersion());
  expect(window.location.reload).toHaveBeenCalledTimes(1);
});
