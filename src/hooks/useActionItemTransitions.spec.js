import { act, renderHook } from '@testing-library/react';
import useActionItemTransitions from './useActionItemTransitions';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('new items appear immediately and obsolete timers cannot restore removed items', () => {
  const item = Object.freeze({ uniqueKey: 'resupply' });
  const { result, rerender } = renderHook(({ items }) => useActionItemTransitions(items, 400), {
    initialProps: { items: [] }
  });
  rerender({ items: [item] });
  expect(result.current).toEqual([item]);
  act(() => jest.advanceTimersByTime(50));
  rerender({ items: [] });
  expect(result.current).toEqual([{ ...item, transitionOut: true }]);
  expect(item.transitionOut).toBeUndefined();
  act(() => jest.advanceTimersByTime(350));
  expect(result.current[0].transitionOut).toBe(true);
  act(() => jest.advanceTimersByTime(50));
  expect(result.current).toEqual([]);
});

test('an item returning during its exit animation is visible and stays visible', () => {
  const item = Object.freeze({ uniqueKey: 'resupply' });
  const { result, rerender } = renderHook(({ items }) => useActionItemTransitions(items, 400), {
    initialProps: { items: [item] }
  });
  rerender({ items: [] });
  rerender({ items: [item] });
  expect(result.current).toEqual([item]);
  act(() => jest.advanceTimersByTime(400));
  expect(result.current).toEqual([item]);
});
