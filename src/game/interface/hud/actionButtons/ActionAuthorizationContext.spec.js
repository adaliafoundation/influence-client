import { useContext } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import ActionAuthorizationContext, { ActionAuthorizationProvider } from './ActionAuthorizationContext';
import useCrewContext from '~/hooks/useCrewContext';

jest.mock('~/hooks/useCrewContext', () => jest.fn(), { virtual: true });

let refresh, preview, recheck, refreshAuthorization, client;
function Probe() {
  refresh = useContext(ActionAuthorizationContext);
  useQuery({ queryKey: ['planningEligibility', 1, 10], queryFn: preview, staleTime: Infinity, meta: { recheck } });
  return null;
}
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  preview = jest.fn(async () => ({ status: 'allowed' }));
  recheck = jest.fn(async () => ({ status: 'blocked' }));
  refreshAuthorization = jest.fn(async () => ({ status: 'allowed' }));
  useCrewContext.mockReturnValue({ refreshAuthorization });
});
afterEach(() => client.clear());

test('HUD entry uses the fresh eligibility check only when clicked, then updates the shared preview', async () => {
  render(<QueryClientProvider client={client}>
    <ActionAuthorizationProvider lot={{ id: 1, label: 4 }}><Probe /></ActionAuthorizationProvider>
  </QueryClientProvider>);
  await waitFor(() => expect(client.getQueryData(['planningEligibility', 1, 10])).toEqual({ status: 'allowed' }));
  expect(recheck).not.toHaveBeenCalled();
  expect(refreshAuthorization).not.toHaveBeenCalled();
  await act(async () => refresh());
  expect(recheck).toHaveBeenCalledTimes(1);
  expect(preview).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(['planningEligibility', 1, 10])).toEqual({ status: 'blocked' });
  await act(async () => refresh());
  expect(recheck).toHaveBeenCalledTimes(2);
});
