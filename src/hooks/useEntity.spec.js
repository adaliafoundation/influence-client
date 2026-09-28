import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import useEntity from './useEntity';
import api from '~/lib/api';

jest.mock('~/lib/api', () => ({ getEntityById: jest.fn() }), { virtual: true });

test('component selections have stable separate keys and preserve the full entity cache', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const full = { id: 1, label: 3, Name: { name: 'Full entity' } };
  client.setQueryData(['entity', 3, 1], full);
  api.getEntityById.mockResolvedValue({ id: 1, label: 3, Control: null });
  const wrapper = ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useEntity({ label: 3, id: 1, components: ['UseLot', 'Control', 'Control'] }), { wrapper });
  await result.current.refetch();
  expect(api.getEntityById).toHaveBeenCalledWith({ label: 3, id: 1, components: ['Control', 'UseLot'] });
  expect(client.getQueryData(['entity', 3, 1])).toEqual(full);
  expect(client.getQueryData(['entity', 3, 1, { components: ['Control', 'UseLot'] }])).toEqual({ id: 1, label: 3, Control: null });
  await client.invalidateQueries({ queryKey: ['entity', 3, 1], refetchType: 'none' });
  expect(client.getQueryState(['entity', 3, 1, { components: ['Control', 'UseLot'] }]).isInvalidated).toBe(true);
  client.clear();
});
