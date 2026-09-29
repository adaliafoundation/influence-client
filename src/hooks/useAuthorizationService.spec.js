const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const React = require('react');
const { render, screen, waitFor, act } = require('@testing-library/react');
const { QueryClient } = require('@tanstack/react-query');
const { Entity, Permission } = require('@influenceth/sdk');
jest.mock('~/lib/api', () => ({ getEntityById: jest.fn(), getEntities: jest.fn() }), { virtual: true });
jest.mock('~/lib/authorizationData', () => jest.requireActual('../lib/authorizationData'), { virtual: true });
jest.mock('~/lib/authorization', () => jest.requireActual('../lib/authorization'), { virtual: true });
const api = require('~/lib/api');
const useAuthorizationService = require('./useAuthorizationService').default;
const crew = { label: Entity.IDS.CREW, id: 1, Crew: { delegatedTo: '0x123', readyAt: 100 } };
const target = { label: Entity.IDS.BUILDING, id: 2, Control: null, PublicPolicies: [], WhitelistAgreements: [], WhitelistAccountAgreements: [], PrepaidAgreements: [], ContractAgreements: [] };
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
let service, granted;
function Harness({ blockNumber = 1, provider, selectedCrewId = 1 }) {
  service = useAuthorizationService({ provider, blockNumber, blockTime: 100, accountAddress: '0x123', selectedCrewId, queryClient });
  const result = service.authorize('can', [crew, target, Permission.IDS.ADD_PRODUCTS], [crew, target]);
  return <p>{result.status}</p>;
}
beforeEach(() => {
  granted = true;
  api.getEntities.mockReset().mockImplementation(async ({ ids, label }) => Promise.all(ids.map((id) => api.getEntityById({ id, label }))));
  api.getEntityById.mockReset().mockImplementation(async ({ label }) => label === Entity.IDS.CREW ? crew : { ...target, PublicPolicies: granted ? [{ permission: Permission.IDS.ADD_PRODUCTS }] : [] });
});

test('loads after render, shares reads, and refreshes a revoked grant before submission', async () => {
  render(<Harness />);
  expect(screen.getByText('unresolved')).toBeTruthy();
  await screen.findByText('allowed');
  expect(api.getEntityById).toHaveBeenCalledTimes(2);
  granted = false;
  expect((await service.recheckAuthorization('can', [crew, target, Permission.IDS.ADD_PRODUCTS], [crew, target])).status).toBe('denied');
});

test('a new block discards earlier authorization', async () => {
  const view = render(<Harness />);
  await screen.findByText('allowed');
  granted = false;
  view.rerender(<Harness blockNumber={2} />);
  expect(screen.getByText('unresolved')).toBeTruthy();
  await screen.findByText('denied');
});

test('entity cache changes invalidate access while the view is open', async () => {
  render(<Harness />);
  await screen.findByText('allowed');
  granted = false;
  act(() => queryClient.setQueryData(['entity', Entity.IDS.BUILDING, 2], { ...target }));
  await screen.findByText('denied');
});

test('an old policy response cannot overwrite a new block result', async () => {
  let completeOld;
  const provider = { callContract: jest.fn().mockImplementationOnce(() => new Promise((resolve) => { completeOld = resolve; })).mockResolvedValue(['0x0']) };
  api.getEntityById.mockImplementation(async ({ label }) => label === Entity.IDS.CREW ? crew : { ...target, ContractAgreements: [{ permission: Permission.IDS.ADD_PRODUCTS, permitted: crew, address: '0x987' }] });
  const view = render(<Harness provider={provider} />);
  await waitFor(() => expect(provider.callContract).toHaveBeenCalledTimes(1));
  view.rerender(<Harness provider={provider} blockNumber={2} />);
  await screen.findByText('denied');
  await act(async () => completeOld(['0x1']));
  expect(screen.getByText('denied')).toBeTruthy();
});

test('changing selected crew invalidates both captured and in-flight submission checks', async () => {
  const view = render(<Harness />);
  await screen.findByText('allowed');
  const oldRecheck = service.recheckAuthorization;
  let finishRead;
  api.getEntityById.mockImplementationOnce(() => new Promise((resolve) => { finishRead = resolve; }));
  const pending = oldRecheck('can', [crew, target, Permission.IDS.ADD_PRODUCTS], [crew, target]);
  view.rerender(<Harness selectedCrewId={2} />);
  await act(async () => finishRead(crew));
  expect((await pending).status).toBe('unresolved');
  expect((await oldRecheck('can', [crew, target, Permission.IDS.ADD_PRODUCTS], [crew, target])).status).toBe('unresolved');
});
