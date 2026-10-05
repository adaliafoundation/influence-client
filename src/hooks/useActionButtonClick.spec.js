import { act, renderHook } from '@testing-library/react';
import useActionButtonClick from './useActionButtonClick';

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

test('refreshes only on click and opens once after refresh, retaining the original action', async () => {
  const pending = deferred();
  const props = { disabled: false, onClick: jest.fn(), refresh: jest.fn(() => pending.promise), reportBlocked: jest.fn() };
  const { result, rerender } = renderHook(useActionButtonClick, { initialProps: props });
  rerender(props);
  expect(props.refresh).not.toHaveBeenCalled();
  let clicked;
  act(() => { clicked = result.current.handleClick(); });
  expect(result.current.checking).toBe(true);
  await act(async () => { await result.current.handleClick(); });
  expect(props.refresh).toHaveBeenCalledTimes(1);
  expect(props.onClick).not.toHaveBeenCalled();
  await act(async () => { pending.resolve({ status: 'allowed' }); await clicked; });
  expect(props.onClick).toHaveBeenCalledTimes(1);
});

test('a revoked permission hides the button, reports once and does not open the modal', async () => {
  const pending = deferred();
  const props = { disabled: false, onClick: jest.fn(), refresh: () => pending.promise, reportBlocked: jest.fn() };
  const { result, rerender } = renderHook(useActionButtonClick, { initialProps: props });
  let clicked;
  act(() => { clicked = result.current.handleClick(); });
  rerender({ ...props, disabled: 'access restricted' });
  await act(async () => { pending.resolve({ status: 'allowed' }); await clicked; });
  expect(result.current.hidden).toBe(true);
  expect(props.onClick).not.toHaveBeenCalled();
  expect(props.reportBlocked).toHaveBeenCalledTimes(1);
  expect(props.reportBlocked).toHaveBeenCalledWith({ status: 'denied' });
});

test('unresolved permissions block opening without hiding a potentially valid button', async () => {
  const props = { disabled: false, onClick: jest.fn(), refresh: async () => ({ status: 'unresolved' }), reportBlocked: jest.fn() };
  const { result } = renderHook(useActionButtonClick, { initialProps: props });
  await act(async () => result.current.handleClick());
  expect(props.onClick).not.toHaveBeenCalled();
  expect(result.current.hidden).toBe(false);
  expect(props.reportBlocked).toHaveBeenCalledWith({ status: 'unresolved' });
});

test('a silently disabled button remains visible when access is still unresolved after refresh', async () => {
  const pending = deferred();
  const props = { disabled: false, onClick: jest.fn(), refresh: () => pending.promise, reportBlocked: jest.fn() };
  const { result, rerender } = renderHook(useActionButtonClick, { initialProps: props });
  let clicked;
  act(() => { clicked = result.current.handleClick(); });
  rerender({ ...props, disabled: true });
  await act(async () => { pending.resolve({ status: 'allowed' }); await clicked; });
  expect(result.current.hidden).toBe(false);
  expect(props.onClick).not.toHaveBeenCalled();
  expect(props.reportBlocked).toHaveBeenCalledWith({ status: 'unresolved' });
});

test('changing the selected target during a refresh does not open its replacement action', async () => {
  const pending = deferred();
  const props = { disabled: false, onClick: jest.fn(), refresh: () => pending.promise, reportBlocked: jest.fn() };
  const { result, rerender } = renderHook(useActionButtonClick, { initialProps: props });
  let clicked;
  act(() => { clicked = result.current.handleClick(); });
  rerender({ ...props, refresh: async () => ({ status: 'allowed' }) });
  await act(async () => { pending.resolve({ status: 'allowed' }); await clicked; });
  expect(props.onClick).not.toHaveBeenCalled();
});
