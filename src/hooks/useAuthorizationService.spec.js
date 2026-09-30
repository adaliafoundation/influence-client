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
function Harness({ blockNumber = 1, provider, selectedCrewId = 1, building = { label: target.label, id: target.id } }) {
  service = useAuthorizationService({ provider, blockNumber, blockTime: 100, accountAddress: '0x123', selectedCrewId, queryClient });
  const result = service.authorize('can', [crew, building, Permission.IDS.ADD_PRODUCTS], [crew, building]);
  return <p>{result.status}</p>;
}
beforeEach(() => {
  granted = true;
  api.getEntities.mockReset().mockImplementation(async ({ ids, label }) => Promise.all(ids.map((id) => api.getEntityById({ id, label }))));
  api.getEntityById.mockReset().mockImplementation(async ({ label, id }) => label === Entity.IDS.CREW ? crew : { ...target, id, PublicPolicies: granted ? [{ permission: Permission.IDS.ADD_PRODUCTS }] : [] });
});

test('loads after render, shares reads, and refreshes a revoked grant before submission', async () => {
  render(<Harness />);
  expect(screen.getByText('unresolved')).toBeTruthy();
  await screen.findByText('allowed');
  expect(api.getEntityById).toHaveBeenCalledTimes(1);
  granted = false;
  let decision;
  await act(async () => { decision = await service.recheckAuthorization('can', [crew, target, Permission.IDS.ADD_PRODUCTS], [crew, target]); });
  expect(decision.status).toBe('denied');
});

test('new blocks preserve displayed access without reads; submission catches revocation', async () => {
  const view = render(<Harness />);
  await screen.findByText('allowed');
  granted = false;
  view.rerender(<Harness blockNumber={2} />);
  expect(screen.getByText('allowed')).toBeTruthy();
  expect(api.getEntityById).toHaveBeenCalledTimes(1);
  let decision;
  await act(async () => { decision = await service.recheckAuthorization('can', [crew, target, Permission.IDS.ADD_PRODUCTS], [crew, target]); });
  expect(decision.status).toBe('denied');
});

test('entity cache changes invalidate access while the view is open', async () => {
  render(<Harness />);
  await screen.findByText('allowed');
  granted = false;
  act(() => queryClient.setQueryData(['entity', Entity.IDS.BUILDING, 2], { ...target, PublicPolicies: [] }));
  await screen.findByText('denied');
});

test('an old policy response cannot overwrite a new crew result', async () => {
  let completeOld;
  const provider = { callContract: jest.fn().mockImplementationOnce(() => new Promise((resolve) => { completeOld = resolve; })).mockResolvedValue(['0x0']) };
  api.getEntityById.mockImplementation(async ({ label }) => label === Entity.IDS.CREW ? crew : { ...target, ContractAgreements: [{ permission: Permission.IDS.ADD_PRODUCTS, permitted: crew, address: '0x987' }] });
  const view = render(<Harness provider={provider} />);
  await waitFor(() => expect(provider.callContract).toHaveBeenCalledTimes(1));
  view.rerender(<Harness provider={provider} selectedCrewId={2} />);
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


test('entity refreshes update displayed access without fetching components again', async () => {
  render(<Harness />);
  await screen.findByText('allowed');
  api.getEntities.mockClear();
  act(() => queryClient.setQueryData(['entity', Entity.IDS.BUILDING, 2], { ...target, PublicPolicies: [] }));
  await screen.findByText('denied');
  expect(api.getEntities).not.toHaveBeenCalled();
});

test('updated components retain the same action result, but a new target starts checking', async () => {
  const view = render(<Harness />);
  await screen.findByText('allowed');
  view.rerender(<Harness building={{ ...target, PublicPolicies: [{ permission: Permission.IDS.ADD_PRODUCTS }] }} />);
  expect(screen.getByText('allowed')).toBeTruthy();
  view.rerender(<Harness building={{ label: target.label, id: 3 }} />);
  expect(screen.getByText('unresolved')).toBeTruthy();
  await screen.findByText('allowed');
});

test('switching crews does not retain the previous crews displayed permission', async () => {
  const view = render(<Harness />);
  await screen.findByText('allowed');
  view.rerender(<Harness selectedCrewId={2} />);
  expect(screen.getByText('unresolved')).toBeTruthy();
  await screen.findByText('allowed');
});


test('unrelated entity traffic and invalidations do not reload displayed permissions', async () => {
  render(<Harness />);
  await screen.findByText('allowed');
  api.getEntities.mockClear();
  await act(async () => {
    for (let id = 100; id < 150; id++) {
      queryClient.setQueryData(['entity', Entity.IDS.BUILDING, id], { ...target, id });
    }
    await queryClient.invalidateQueries({ queryKey: ['entity'] });
  });
  expect(screen.getByText('allowed')).toBeTruthy();
  expect(api.getEntities).not.toHaveBeenCalled();
});

test('UI metadata and elapsed blocks do not create more permission reads', async () => {
  const view = render(<Harness />);
  await screen.findByText('allowed');
  api.getEntities.mockClear();
  for (let index = 0; index < 20; index++) {
    view.rerender(<Harness blockNumber={index + 2} building={{ label: target.label, id: target.id, _time: index, name: `Name ${index}` }} />);
  }
  expect(screen.getByText('allowed')).toBeTruthy();
  expect(api.getEntities).not.toHaveBeenCalled();
});

test('an explicit denied recheck immediately updates the displayed result', async () => {
  render(<Harness />);
  await screen.findByText('allowed');
  granted = false;
  await act(async () => service.recheckAuthorization('can', [crew, target, Permission.IDS.ADD_PRODUCTS], [crew, target]));
  await screen.findByText('denied');
});

function InventoryHarness({ blockNumber = 1 }) {
  const authorization = useAuthorizationService({ blockNumber, blockTime: 100, accountAddress: '0x123', selectedCrewId: 1, queryClient });
  const candidates = Array.from({ length: 200 }, (_, index) => ({ label: target.label, id: index + 10 }));
  const allowed = candidates.filter(entity => authorization.authorize('can', [crew, entity, Permission.IDS.ADD_PRODUCTS], [crew, entity]).status === 'allowed').length;
  return <p>{allowed} allowed</p>;
}

test('an idle inventory selector does not reload hundreds of candidates on blocks or unrelated updates', async () => {
  const view = render(<InventoryHarness />);
  await screen.findByText('200 allowed');
  expect(api.getEntities).toHaveBeenCalledTimes(2);
  api.getEntities.mockClear();
  for (let blockNumber = 2; blockNumber < 12; blockNumber++) {
    view.rerender(<InventoryHarness blockNumber={blockNumber} />);
    act(() => queryClient.setQueryData(['entity', Entity.IDS.SHIP, 999], { label: Entity.IDS.SHIP, id: 999, Ship: { status: blockNumber } }));
  }
  expect(screen.getByText('200 allowed')).toBeTruthy();
  expect(api.getEntities).not.toHaveBeenCalled();
});

test('click-time refresh shares component reads and updates the matching displayed checks', async () => {
  render(<Harness />);
  await screen.findByText('allowed');
  granted = false;
  await act(async () => service.refreshAuthorization([target]));
  await screen.findByText('denied');
});

test('concurrent sparse and hydrated consumers of the same permission settle without a render loop', async () => {
  let renders = 0;
  function ConcurrentConsumers() {
    if (++renders > 15) throw new Error('Authorization render loop');
    const authorization = useAuthorizationService({ blockTime: 100, accountAddress: '0x123', selectedCrewId: 1, queryClient });
    const sparse = { label: target.label, id: target.id };
    const hydrated = { ...target, PublicPolicies: [{ permission: Permission.IDS.ADD_PRODUCTS }] };
    const first = authorization.authorize('can', [crew, sparse, Permission.IDS.ADD_PRODUCTS], [crew, sparse]);
    const second = authorization.authorize('can', [crew, hydrated, Permission.IDS.ADD_PRODUCTS], [crew, hydrated]);
    return <p>{first.status}/{second.status}</p>;
  }
  render(<ConcurrentConsumers />);
  await screen.findByText('allowed/allowed');
  expect(renders).toBeLessThan(10);
  expect(api.getEntities).toHaveBeenCalledTimes(1);
});

test('inventory contents are never serialized into permission keys or compared on unrelated updates', async () => {
  const serializeContents = jest.fn(() => Array.from({ length: 1000 }, (_, product) => ({ product, amount: 100 })));
  const inventory = { label: target.label, id: target.id, Inventories: [{ contents: { toJSON: serializeContents } }] };
  const view = render(<Harness building={inventory} />);
  await screen.findByText('allowed');
  expect(serializeContents).not.toHaveBeenCalled();
  api.getEntities.mockClear();
  for (let index = 0; index < 20; index++) {
    view.rerender(<Harness building={{ ...inventory, Inventories: [{ contents: { toJSON: serializeContents }, mass: index }] }} />);
    act(() => queryClient.setQueryData(['entity', Entity.IDS.SHIP, 999], { label: Entity.IDS.SHIP, id: 999, Ship: { status: index } }));
  }
  expect(screen.getByText('allowed')).toBeTruthy();
  expect(serializeContents).not.toHaveBeenCalled();
  expect(api.getEntities).not.toHaveBeenCalled();
});
