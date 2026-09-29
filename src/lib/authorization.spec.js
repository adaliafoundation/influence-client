const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const { Entity, Lot, Permission, Time } = require('@influenceth/sdk');
const { matchesCrewPermissionSubject, evaluateAuthorization, loadAuthorization, readPolicy, normalizeAuthorizationEntity } = require('./authorization');
const record = (label, id, extra = {}) => ({ label, id, Control: null, PublicPolicies: [], WhitelistAgreements: [], WhitelistAccountAgreements: [], PrepaidAgreements: [], ContractAgreements: [], ...extra });
const crew = record(Entity.IDS.CREW, 1, { Crew: { delegatedTo: '0x123', readyAt: 100 } });
const target = () => record(Entity.IDS.BUILDING, 10);
const grant = (permission, permitted = crew) => ({ permission, permitted });
const permission = Permission.IDS.ADD_PRODUCTS;
const evaluate = (building, extra = {}) => evaluateAuthorization({ method: 'can', args: [crew, building, permission], entities: [crew, building], blockTime: 100, ...extra });

test('unloaded components are unresolved; confirmed empty grants deny', () => {
  const building = target();
  expect(evaluate(building).status).toBe('denied');
  delete building.PublicPolicies;
  expect(evaluate(building).status).toBe('unresolved');
});

test('normalizes recorded tenancy, never synthesized lot control', () => {
  const raw = record(Entity.IDS.LOT, Lot.toId(1, 1), { UseLot: { tenant: null } });
  const lot = { ...raw, Control: { controller: crew }, _permissionTargets: { lot: raw } };
  expect(normalizeAuthorizationEntity(lot)).toMatchObject({ Control: null, UseLot: null });
});

test.each([100, 110])('inclusive prepaid/notice boundary at %s', (time) => {
  const building = target();
  building.PrepaidAgreements = [{ ...grant(permission), endTime: 100, noticeTime: 90, noticePeriod: 20 }];
  expect(evaluate(building, { blockTime: time }).status).toBe('allowed');
  expect(evaluate(building, { blockTime: 111 }).status).toBe('denied');
});

test('completion permission can reject access that is valid now', () => {
  const building = target();
  building.PrepaidAgreements = [{ ...grant(permission), endTime: 110, noticeTime: 0, noticePeriod: 0 }];
  expect(evaluate(building).status).toBe('allowed');
  expect(evaluate(building, { method: 'canUntil', args: [crew, building, permission, 120] }).status).toBe('denied');
});

test('SDK 2.7 blocks planned-site cleanup behind an active different tenant', () => {
  const tenant = record(Entity.IDS.CREW, 2, { Crew: { delegatedTo: '0x456' } });
  const lot = record(Entity.IDS.LOT, Lot.toId(1, 1), { UseLot: { tenant }, PublicPolicies: [{ permission: Permission.IDS.USE_LOT }] });
  const building = record(Entity.IDS.BUILDING, 3, { Building: { status: 1, plannedAt: 0 }, Location: { location: lot } });
  const asteroid = record(Entity.IDS.ASTEROID, 1);
  const options = { method: 'repossession', args: [crew, building, 1], entities: [crew, tenant, lot, building, asteroid], blockTime: 100 };
  expect(evaluateAuthorization(options)).toMatchObject({ status: 'denied', reason: 'active-tenant-precedence' });
  lot.UseLot = null;
  expect(evaluateAuthorization(options)).toMatchObject({ status: 'allowed', reason: 'planned-site-cleanup' });
});

test('fresh submission loads new grants rather than accepting cached denial', async () => {
  const building = target();
  const current = { ...building, PublicPolicies: [{ permission }] };
  const api = { getEntityById: jest.fn(async ({ label }) => label === Entity.IDS.CREW ? crew : current) };
  const result = await loadAuthorization({ api, method: 'can', args: [crew, building, permission], entities: [crew, building], blockTime: 100, fresh: true });
  expect(result.status).toBe('allowed');
  expect(api.getEntityById).toHaveBeenCalledWith(expect.objectContaining({ components: expect.arrayContaining(['PublicPolicy', 'WhitelistAccountAgreement']) }));
  current.PublicPolicies = [];
  expect((await loadAuthorization({ api, method: 'can', args: [crew, building, permission], entities: [crew, building], blockTime: 100, fresh: true })).status).toBe('denied');
});

test('refresh failure cannot authorize using a stale allowed record', async () => {
  const building = { ...target(), PublicPolicies: [{ permission }] };
  const api = { getEntityById: jest.fn(async () => { throw Error('offline'); }) };
  expect((await loadAuthorization({ api, method: 'can', args: [crew, building, permission], entities: [crew, building], blockTime: 100, fresh: true })).status).toBe('unresolved');
});

test('policy responses are scoped to each evaluation and the explicit block', async () => {
  const building = target();
  building.ContractAgreements = [{ ...grant(permission), address: '0x987' }];
  const provider = { callContract: jest.fn().mockResolvedValueOnce(['0x1']).mockResolvedValueOnce(['0x0']) };
  const params = { api: {}, provider, blockNumber: 12, blockTime: 100, method: 'can', args: [crew, building, permission], entities: [crew, building] };
  expect((await loadAuthorization(params)).status).toBe('allowed');
  expect((await loadAuthorization({ ...params, blockNumber: 13 })).status).toBe('denied');
  expect(provider.callContract.mock.calls.map((call) => call[1])).toEqual([12, 13]);
});

test('failed policy reads and absent block context remain unresolved', async () => {
  const provider = { callContract: jest.fn(async () => { throw Error('offline'); }) };
  const request = { address: '0x987', target: target(), permitted: crew, permission };
  expect(await readPolicy(provider, request, 12)).toEqual({ status: 'failed' });
  expect(await readPolicy(provider, request)).toEqual({ status: 'failed' });
  expect(provider.callContract).toHaveBeenCalledTimes(1);
});

test('ship-specific docking grant is accepted independently of crew access', () => {
  const port = target();
  const ship = record(Entity.IDS.SHIP, 3, { Control: { controller: crew } });
  port.WhitelistAgreements = [grant(Permission.IDS.DOCK_SHIP, ship)];
  expect(evaluateAuthorization({ method: 'spaceportProtection', args: [crew, ship, port], entities: [crew, ship, port], blockTime: 100 }).status).toBe('allowed');
});

test('a missing refreshed entity does not retain stale public access', async () => {
  const building = { ...target(), PublicPolicies: [{ permission }] };
  const api = { getEntityById: jest.fn(async () => null) };
  expect((await loadAuthorization({ api, method: 'can', args: [crew, building, permission], entities: [crew, building], blockTime: 100, fresh: true })).status).toBe('unresolved');
});

test('a grant on another target never grants access to the selected target', () => {
  const selected = target();
  const other = { ...target(), id: 11, PublicPolicies: [grant(permission)] };
  const entities = [crew, selected, other];
  expect(evaluate(selected, { entities }).status).toBe('denied');
  expect(evaluate(other, { entities }).status).toBe('allowed');
});

test('agreement subjects preserve entity labels and normalize wallet addresses', () => {
  expect(matchesCrewPermissionSubject({ label: Entity.IDS.SHIP, id: crew.id }, crew)).toBe(false);
  expect(matchesCrewPermissionSubject({ label: Entity.IDS.CREW, id: String(crew.id) }, crew)).toBe(true);
  expect(matchesCrewPermissionSubject('0x000123', crew)).toBe(true);
  expect(matchesCrewPermissionSubject('0x456', crew)).toBe(false);
  expect(matchesCrewPermissionSubject(undefined, crew)).toBe(false);
});


test('fresh production authorization uses individually rounded travel and rejects a lease one second short', async () => {
  const facility = target();
  facility.PublicPolicies = [grant(Permission.IDS.REMOVE_PRODUCTS)];
  facility.PrepaidAgreements = [{ ...grant(Permission.IDS.RUN_PROCESS), endTime: 781, noticeTime: 0, noticePeriod: 0 }];
  const destination = record(Entity.IDS.BUILDING, 11, { PublicPolicies: [grant(Permission.IDS.ADD_PRODUCTS)] });
  const entities = [crew, facility, destination];
  const api = { getEntityById: jest.fn(async ({ id, label }) => entities.find((e) => e.id === id && e.label === label)) };
  const duration = 2 * Time.toRealDurationCeil(8165, 24);
  expect(duration).toBe(682);
  const job = { kind: 'process', crew, facility, origin: facility, destination, duration, completionTime: 781 };
  const options = { api, method: 'production', args: [job], entities, blockTime: 100, fresh: true };
  expect((await loadAuthorization(options)).status).toBe('denied');
  facility.PrepaidAgreements[0].endTime = 782;
  expect((await loadAuthorization(options)).status).toBe('allowed');
  expect((await loadAuthorization({ ...options, args: [{ ...job, duration: 680.416 }] })).status).toBe('unresolved');
});
