const { TextDecoder, TextEncoder } = require('util');
global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;
const { Entity, Lot, Permission } = require('@influenceth/sdk');
const { getPlanningEligibility, loadPlanningEligibility } = require('./planningEligibility');
const { checkContractPolicy } = require('./lotUsageAuthorization');

const crew = (id, delegate = '0x123') => ({ label: Entity.IDS.CREW, id, Crew: { delegatedTo: delegate, roster: [1] } });
const target = (label, id) => ({ label, id, Control: null, UseLot: { tenant: null }, PublicPolicies: [], WhitelistAgreements: [], WhitelistAccountAgreements: [], PrepaidAgreements: [], ContractAgreements: [] });
const grant = (permitted = crew(1), extra = {}) => ({ permission: Permission.IDS.USE_LOT, permitted, noticeTime: 0, noticePeriod: 0, ...extra });
let lot, asteroid, params;
beforeEach(() => {
  lot = target(Entity.IDS.LOT, Lot.toId(1, 1));
  asteroid = target(Entity.IDS.ASTEROID, 1);
  params = { lot, asteroid, crew: crew(1), blockTime: 100, loadCrew: jest.fn(async (id) => crew(id)), checkPolicy: jest.fn(async () => null) };
});
const eligibility = () => getPlanningEligibility(params);

test('no grant and a lease offer alone both block planning', async () => {
  expect(await eligibility()).toEqual({ status: 'blocked', reason: 'Lot Usage permission required' });
  asteroid.PrepaidPolicies = [grant()];
  expect((await eligibility()).status).toBe('blocked');
});

describe.each(['lot', 'asteroid'])('%s grants', (scope) => {
  test.each(['PublicPolicies', 'WhitelistAgreements', 'WhitelistAccountAgreements', 'PrepaidAgreements'])('%s allows planning without a lease offer', async (component) => {
    params[scope][component] = [grant(component === 'WhitelistAccountAgreements' ? '0x0123' : crew(1), { endTime: 100 })];
    expect((await eligibility()).status).toBe('allowed');
    params[scope][component] = [];
    expect((await eligibility()).status).toBe('blocked');
  });
  test('control includes the controller delegate', async () => {
    params[scope].Control = { controller: crew(2) };
    expect((await eligibility()).status).toBe('allowed');
    params.loadCrew.mockResolvedValue(crew(2, '0x456'));
    expect((await eligibility()).status).toBe('blocked');
  });
});

test.each([
  ['WhitelistAgreements', grant(crew(2))],
  ['WhitelistAccountAgreements', grant('0x456')],
  ['PublicPolicies', { permission: Permission.IDS.RUN_PROCESS }],
  ['PrepaidAgreements', grant(crew(1), { endTime: 99 })],
  ['PrepaidAgreements', grant(crew(2), { endTime: 200 })]
])('rejects invalid %s grant', async (component, record) => {
  lot[component] = [record];
  expect((await eligibility()).status).toBe('blocked');
});

test('prepaid end and notice boundaries are inclusive', async () => {
  lot.PrepaidAgreements = [grant(crew(1), { endTime: 90, noticeTime: 80, noticePeriod: 20 })];
  expect((await eligibility()).status).toBe('allowed');
  params.blockTime = 101;
  expect((await eligibility()).status).toBe('blocked');
});

test('active tenant excludes asteroid controller and another crew on the same wallet', async () => {
  lot.UseLot.tenant = crew(2);
  lot.PrepaidAgreements = [grant(crew(2), { endTime: 100 })];
  asteroid.Control = { controller: crew(1) };
  expect(await eligibility()).toEqual({ status: 'blocked', reason: 'Another crew holds active tenancy' });
  params.crew = crew(2);
  expect((await eligibility()).status).toBe('allowed');
});

test('expired recorded tenancy permits another authorized crew', async () => {
  lot.UseLot.tenant = crew(2);
  lot.PrepaidAgreements = [grant(crew(2), { endTime: 99 })];
  asteroid.PublicPolicies = [grant()];
  expect((await eligibility()).status).toBe('allowed');
});

test('asteroid grants do not keep a recorded lot tenant active', async () => {
  lot.UseLot.tenant = crew(2);
  asteroid.PublicPolicies = [grant()];
  expect((await eligibility()).status).toBe('allowed');
});

test('cleared tenancy is not reconstructed from an active historical agreement', async () => {
  lot.PrepaidAgreements = [grant(crew(2), { endTime: 200 })];
  asteroid.PublicPolicies = [grant()];
  expect((await eligibility()).status).toBe('allowed');
  expect(lot.UseLot.tenant).toBeNull();
});

test.each([undefined, {}, { tenant: undefined }])('unknown tenancy %p remains checking', async (tenancy) => {
  lot.UseLot = tenancy;
  asteroid.PublicPolicies = [grant()];
  expect((await eligibility()).status).toBe('checking');
});

test.each([1, 2, 3])('building status %s blocks planning', async (status) => {
  lot.building = { Building: { status } };
  asteroid.PublicPolicies = [grant()];
  expect(await eligibility()).toEqual({ status: 'blocked', reason: 'Lot occupied' });
});

test('surface ships block planning', async () => {
  lot.surfaceShip = { id: 1 };
  expect((await eligibility()).reason).toBe('Lot occupied');
});

test('abandon and replan works only while permission remains', async () => {
  lot.PublicPolicies = [grant()];
  lot.building = { Building: { status: 1 } };
  expect((await eligibility()).status).toBe('blocked');
  lot.building = null;
  expect((await eligibility()).status).toBe('allowed');
  lot.PublicPolicies = [];
  expect((await eligibility()).status).toBe('blocked');
});

test('contract records require policy approval', async () => {
  lot.ContractAgreements = [grant(crew(1), { address: '0x789' })];
  expect((await eligibility()).status).toBe('checking');
  params.checkPolicy.mockResolvedValue(false);
  expect((await eligibility()).status).toBe('blocked');
  params.checkPolicy.mockResolvedValue(true);
  expect((await eligibility()).status).toBe('allowed');
});

test('unknown tenant policy blocks even an otherwise authorized planner', async () => {
  lot.UseLot.tenant = crew(2);
  lot.ContractAgreements = [grant(crew(2), { address: '0x789' })];
  asteroid.PublicPolicies = [grant()];
  expect((await eligibility()).status).toBe('checking');
});

test('missing permission data and controller delegates remain checking', async () => {
  lot.PublicPolicies = undefined;
  expect((await eligibility()).status).toBe('checking');
  lot.PublicPolicies = [];
  lot.Control = { controller: crew(2) };
  params.loadCrew.mockResolvedValue(null);
  expect((await eligibility()).status).toBe('checking');
});

test('calls the contract policy ABI with the exact target and crew', async () => {
  const provider = { callContract: jest.fn(async () => ['0x1']) };
  expect(await checkContractPolicy(provider, { address: '0x789' }, lot, crew(1), Permission.IDS.USE_LOT, 123)).toBe(true);
  expect(provider.callContract).toHaveBeenCalledWith({ contractAddress: '0x789', entrypoint: 'can', calldata: [lot.label, lot.id, Permission.IDS.USE_LOT, Entity.IDS.CREW, 1].map(String) }, 123);
  provider.callContract.mockResolvedValue(['0x0']);
  expect(await checkContractPolicy(provider, { address: '0x789' }, lot, crew(1), Permission.IDS.USE_LOT, 123)).toBe(false);
});

describe('fresh submission reads', () => {
  let api, input, selected, occupants;
  beforeEach(() => {
    selected = { ...crew(1), Location: { locations: [asteroid, lot] } };
    occupants = [];
    api = {
      getEntityById: jest.fn(async ({ label }) => ({ [Entity.IDS.LOT]: lot, [Entity.IDS.ASTEROID]: asteroid, [Entity.IDS.CREW]: selected }[label])),
      getEntities: jest.fn(async () => occupants),
      getConstants: jest.fn(async () => ({ LAUNCH_TIME: 0 }))
    };
    input = { api, lotId: lot.id, crewId: 1, blockTime: 100, accountAddress: '0x123' };
    asteroid.PublicPolicies = [grant()];
  });
  test('re-reads revoked permissions and changed tenancy before submission', async () => {
    expect((await loadPlanningEligibility(input)).status).toBe('allowed');
    asteroid.PublicPolicies = [];
    expect((await loadPlanningEligibility(input)).status).toBe('blocked');
    lot.UseLot = undefined;
    expect((await loadPlanningEligibility(input)).status).toBe('checking');
    expect(api.getEntityById).toHaveBeenCalledWith(expect.objectContaining({ components: expect.arrayContaining(['UseLot', 'WhitelistAccountAgreement', 'ContractAgreement']) }));
  });
  test('re-reads occupancy', async () => {
    expect((await loadPlanningEligibility(input)).status).toBe('allowed');
    occupants.push({ Ship: { status: 2 }, Location: { location: lot } });
    expect((await loadPlanningEligibility(input)).reason).toBe('Lot occupied');
  });
  test('a busy crew can plan but the wrong wallet cannot', async () => {
    selected.Crew.readyAt = 200;
    expect((await loadPlanningEligibility(input)).status).toBe('allowed');
    input.accountAddress = '0x456';
    expect((await loadPlanningEligibility(input)).reason).toBe('Incorrect crew wallet');
  });
  test.each([
    [Entity.IDS.BUILDING, { Building: { status: 1 } }, 'Crew station not operational'],
    [Entity.IDS.SHIP, { Ship: { emergencyAt: 1 } }, 'Crew ship in emergency mode'],
    [Entity.IDS.BUILDING, {}, 'Checking Lot Usage permission']
  ])('checks station restrictions for label %s', async (label, station, reason) => {
    selected.Location.locations.push({ label, id: 9 });
    const original = api.getEntityById.getMockImplementation();
    api.getEntityById.mockImplementation((entity) => entity.label === label && entity.id === 9 ? Promise.resolve(station) : original(entity));
    expect((await loadPlanningEligibility(input)).reason).toBe(reason);
  });
  test('missing occupancy data remains checking', async () => {
    occupants = undefined;
    expect((await loadPlanningEligibility(input)).status).toBe('checking');
  });
  test('a crew must be manned and the game launched', async () => {
    selected.Crew.roster = [];
    expect((await loadPlanningEligibility(input)).reason).toBe('Crew required');
    selected.Crew.roster = [1];
    api.getConstants.mockResolvedValue({ LAUNCH_TIME: 101 });
    expect((await loadPlanningEligibility(input)).reason).toBe('Crew not launched');
  });
  test('requires crew on the surface of the same asteroid', async () => {
    selected.Location.locations = [asteroid];
    expect((await loadPlanningEligibility(input)).reason).toBe('Crew in orbit');
    selected.Location.locations = [lot, { ...asteroid, id: 2 }];
    expect((await loadPlanningEligibility(input)).reason).toBe('Crew is away');
  });
});


test('an unresolved earlier policy cannot be bypassed by an asteroid grant', async () => {
  lot.ContractAgreements = [grant(crew(1), { address: '0x789' })];
  params.checkPolicy.mockRejectedValue(new Error('RPC unavailable'));
  expect((await eligibility()).status).toBe('checking');
  asteroid.PublicPolicies = [grant()];
  expect((await eligibility()).status).toBe('checking');
});

test('policy reads without an explicit block remain unresolved', async () => {
  const provider = { callContract: jest.fn(async () => ['0x0']) };
  expect(await checkContractPolicy(provider, { address: '0x789' }, lot, crew(1), Permission.IDS.USE_LOT)).toBe(null);
  expect(provider.callContract).not.toHaveBeenCalled();
});
