import { useState } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import useMissedBlockRecovery from './useMissedBlockRecovery';

const refocus = () => act(() => {
  window.dispatchEvent(new Event('blur'));
  window.dispatchEvent(new Event('focus'));
});

test('a missed block refreshes once, while a later gap still triggers recovery', () => {
  const client = new QueryClient();
  const invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue();
  const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result, unmount } = renderHook(() => {
    const [missing, setMissing] = useState(false);
    useMissedBlockRecovery(true, missing, setMissing);
    return setMissing;
  }, { wrapper });

  refocus();
  expect(invalidate).not.toHaveBeenCalled();
  act(() => result.current(true));
  refocus();
  expect(invalidate).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 10; i += 1) refocus();
  expect(invalidate).toHaveBeenCalledTimes(1);
  act(() => result.current(true));
  refocus();
  expect(invalidate).toHaveBeenCalledTimes(2);
  expect(invalidate).toHaveBeenLastCalledWith({}, { cancelRefetch: false });
  unmount();
  refocus();
  expect(invalidate).toHaveBeenCalledTimes(2);
  client.clear();
});
