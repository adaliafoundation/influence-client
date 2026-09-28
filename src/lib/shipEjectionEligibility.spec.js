const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const { Entity, Lot, Permission } = require('@influenceth/sdk');
const { getShipEjectionEligibility, loadShipEjectionEligibility, isForceLaunch, isLandedShip } = require('./shipEjectionEligibility');
const { resolveLotUsage, checkContractPolicy } = require('./lotUsageAuthorization');

const target = (label, id) => ({ label, id, PublicPolicies: [], WhitelistAgreements: [], WhitelistAccountAgreements: [], PrepaidAgreements: [], ContractAgreements: [] });
const crew = (id, delegatedTo = '0x123') => ({ label: Entity.IDS.CREW, id, Crew: { delegatedTo, roster: [1], readyAt: 100 }, Location: { locations: [{ label: Entity.IDS.ASTEROID, id: 1 }] } });
const grant = (permitted, permission = Permission.IDS.USE_LOT, extra = {}) => ({ permitted, permission, ...extra });
let params;
beforeEach(() => {
  const lot = { ...target(Entity.IDS.LOT, Lot.toId(1, 1)), UseLot: { tenant: null } };
  const controller = crew(2, '0x456');
  params = {
    lot, asteroid: target(Entity.IDS.ASTEROID, 1), crew: crew(1), controller,
    ship: { label: Entity.IDS.SHIP, id: 9, Control: { controller }, Ship: { readyAt: 900 }, Location: { location: lot, locations: [lot, { label: Entity.IDS.ASTEROID, id: 1 }] }, Inventories: [{ reservedMass: 100 }] },
    building: { ...target(Entity.IDS.BUILDING, 8), Dock: {}, Location: { locations: [lot, { label: Entity.IDS.ASTEROID, id: 1 }] } },
    blockTime: 100, accountAddress: '0x123',
    loadCrew: jest.fn(async (id) => crew(id, id === 1 ? '0x123' : '0x456')),
    checkPolicy: jest.fn(async () => null)
  };
});
const check = () => getShipEjectionEligibility(params);
const dock = () => { params.ship.Location.location = { label: Entity.IDS.BUILDING, id: params.building.id }; };

test('a bystander in orbit can evict an unprotected surface ship with busy pilot and reserved deliveries', async () => {
  params.controller.Crew.readyAt = 900;
  expect((await check()).status).toBe('allowed');
});

test('lot authorization is independent of occupancy', async () => {
  params.lot.building = { Building: { status: 3 } };
  params.lot.surfaceShip = params.ship;
  params.lot.PublicPolicies = [grant(null)];
  expect((await resolveLotUsage({ ...params, crew: params.controller })).status).toBe('allowed');
  expect((await check()).status).toBe('blocked');
});

test('actual immediate location distinguishes a surface ship from a port on the lot', async () => {
  params.lot.building = params.building;
  params.building.PublicPolicies = [grant(null, Permission.IDS.DOCK_SHIP)];
  expect((await check()).status).toBe('allowed');
  dock();
  expect((await check()).status).toBe('blocked');
});

test('an active exact tenant protects its ship', async () => {
  params.lot.UseLot.tenant = params.controller;
  params.lot.PrepaidAgreements = [grant(params.controller, Permission.IDS.USE_LOT, { endTime: 100 })];
  expect((await check()).reason).toBe('Ship has permission to remain');
});

test('another active tenant overrides the ship controller asteroid grant, even on the same wallet', async () => {
  params.lot.UseLot.tenant = crew(3, '0x456');
  params.lot.PrepaidAgreements = [grant(params.lot.UseLot.tenant, Permission.IDS.USE_LOT, { endTime: 100 })];
  params.asteroid.WhitelistAgreements = [grant(params.controller)];
  expect((await check()).status).toBe('allowed');
  params.blockTime = 101;
  expect((await check()).reason).toBe('Ship has permission to remain');
});

test('same-wallet different crews still use force launch and permission protection', async () => {
  params.controller.Crew.delegatedTo = params.accountAddress;
  expect(isForceLaunch(params.crew, params.ship)).toBe(true);
  expect((await check()).status).toBe('allowed');
  params.crew = params.controller;
  expect(isForceLaunch(params.crew, params.ship)).toBe(false);
  expect((await check()).reason).toBe('Selected crew controls this ship');
});

test.each(['lot', 'asteroid'])('public %s access protects surface ships and revocation removes protection', async (scope) => {
  params[scope].PublicPolicies = [grant(null)];
  expect((await check()).status).toBe('blocked');
  params[scope].PublicPolicies = [];
  expect((await check()).status).toBe('allowed');
});

test.each([
  { endTime: 100 },
  { endTime: 90, noticeTime: 80, noticePeriod: 20 }
])('prepaid and notice end boundaries are inclusive: %p', async (times) => {
  params.lot.PrepaidAgreements = [grant(params.controller, Permission.IDS.USE_LOT, times)];
  expect((await check()).status).toBe('blocked');
  params.blockTime = 101;
  expect((await check()).status).toBe('allowed');
});

test('account grants use the ship controller delegate, not the acting crew', async () => {
  params.lot.WhitelistAccountAgreements = [grant('0x0456')];
  expect((await check()).status).toBe('blocked');
  params.lot.WhitelistAccountAgreements = [grant('0x123')];
  expect((await check()).status).toBe('allowed');
});

test.each(['controller', 'ship'])('a %s-specific DOCK_SHIP grant protects a docked ship', async (permitted) => {
  dock();
  params.building.WhitelistAgreements = [grant(params[permitted], Permission.IDS.DOCK_SHIP)];
  expect((await check()).status).toBe('blocked');
  params.building.WhitelistAgreements = [];
  expect((await check()).status).toBe('allowed');
});

test('asteroid USE_LOT and wrong-entity docking grants do not protect a spaceport ship', async () => {
  dock();
  params.asteroid.PublicPolicies = [grant(null)];
  params.building.WhitelistAgreements = [grant({ label: Entity.IDS.SHIP, id: 10 }, Permission.IDS.DOCK_SHIP)];
  expect((await check()).status).toBe('allowed');
});

test('public docking and account docking grants both protect', async () => {
  dock();
  params.building.PublicPolicies = [grant(null, Permission.IDS.DOCK_SHIP)];
  expect((await check()).status).toBe('blocked');
  params.building.PublicPolicies = [];
  params.building.WhitelistAccountAgreements = [grant('0x456', Permission.IDS.DOCK_SHIP)];
  expect((await check()).status).toBe('blocked');
});

test.each([null, undefined, {}, { tenant: undefined }])('unknown tenancy %p does not mean unprotected', async (value) => {
  params.lot.UseLot = value;
  expect((await check()).status).toBe('checking');
});

test('missing permissions or missing controller data remains checking', async () => {
  params.lot.WhitelistAgreements = undefined;
  expect((await check()).status).toBe('checking');
  params.controller = null;
  expect((await check()).status).toBe('checking');
});

test.each(['controller', 'ship'])('external %s policy must resolve before allowing eviction', async (subject) => {
  dock();
  params.building.ContractAgreements = [grant(params[subject], Permission.IDS.DOCK_SHIP, { address: '0x789' })];
  expect((await check()).status).toBe('checking');
  params.checkPolicy.mockResolvedValue(true);
  expect((await check()).status).toBe('blocked');
  expect(params.checkPolicy).toHaveBeenCalledWith(expect.any(Object), params.building, params[subject], Permission.IDS.DOCK_SHIP);
  params.checkPolicy.mockResolvedValue(false);
  expect((await check()).status).toBe('allowed');
  params.checkPolicy.mockRejectedValue(new Error('unavailable'));
  expect((await check()).status).toBe('checking');
});

test('unknown tenant policy takes precedence over the ship controller grant', async () => {
  params.lot.UseLot.tenant = crew(3);
  params.lot.ContractAgreements = [grant(crew(3), Permission.IDS.USE_LOT, { address: '0x789' })];
  params.asteroid.PublicPolicies = [grant(null)];
  expect((await check()).status).toBe('checking');
});

test('an approving protection path wins over an unresolved other path', async () => {
  dock();
  params.building.WhitelistAgreements = [grant(params.ship, Permission.IDS.DOCK_SHIP)];
  params.building.ContractAgreements = [grant(params.controller, Permission.IDS.DOCK_SHIP)];
  expect((await check()).status).toBe('blocked');
});

test.each([
  ['wallet', (p) => { p.accountAddress = '0x999'; }, 'Incorrect crew wallet'],
  ['roster', (p) => { p.crew.Crew.roster = []; }, 'Crew required'],
  ['readiness', (p) => { p.crew.Crew.readyAt = 101; }, 'Crew busy'],
  ['asteroid', (p) => { p.crew.Location.locations[0].id = 2; }, 'Crew is away'],
  ['unknown readiness', (p) => { delete p.crew.Crew.readyAt; }, 'Checking ship protection']
])('checks acting crew %s', async (name, change, reason) => {
  change(params);
  expect((await check()).reason).toBe(reason);
});

test('orbital ships cannot be ejected', async () => {
  params.ship.Location.location = params.asteroid;
  expect(isLandedShip(params.ship)).toBe(false);
  expect((await check()).reason).toBe('Ship is not landed or docked');
});

test('contract policy calldata keeps ship identity and docking permission', async () => {
  const provider = { callContract: jest.fn(async () => ['0x1']) };
  await expect(checkContractPolicy(provider, { address: '0x789' }, params.building, params.ship, Permission.IDS.DOCK_SHIP)).resolves.toBe(true);
  expect(provider.callContract).toHaveBeenCalledWith({ contractAddress: '0x789', entrypoint: 'can', calldata: [Entity.IDS.BUILDING, 8, Permission.IDS.DOCK_SHIP, Entity.IDS.SHIP, 9].map(String) });
});

describe('fresh submission data', () => {
  let api, input;
  beforeEach(() => {
    api = { getEntityById: jest.fn(async ({ label, id }) => {
      if (label === Entity.IDS.CREW) return id === 1 ? params.crew : params.controller;
      return { [Entity.IDS.LOT]: params.lot, [Entity.IDS.ASTEROID]: params.asteroid, [Entity.IDS.BUILDING]: params.building, [Entity.IDS.SHIP]: params.ship }[label];
    }) };
    input = { api, shipId: 9, crewId: 1, blockTime: 100, accountAddress: '0x123' };
  });
  test('a grant between opening and submitting prevents eviction', async () => {
    expect((await loadShipEjectionEligibility(input)).status).toBe('allowed');
    params.asteroid.PublicPolicies = [grant(null)];
    expect((await loadShipEjectionEligibility(input)).status).toBe('blocked');
    expect(api.getEntityById).toHaveBeenCalledWith(expect.objectContaining({ label: Entity.IDS.ASTEROID, components: expect.arrayContaining(['WhitelistAccountAgreement', 'ContractAgreement']) }));
  });
  test('ship movement changes the applicable permission scope', async () => {
    expect((await loadShipEjectionEligibility(input)).status).toBe('allowed');
    dock();
    params.building.WhitelistAgreements = [grant(params.ship, Permission.IDS.DOCK_SHIP)];
    expect((await loadShipEjectionEligibility(input)).status).toBe('blocked');
    params.ship.Location.location = params.asteroid;
    expect((await loadShipEjectionEligibility(input)).reason).toBe('Ship is not landed or docked');
  });
  test('controller and delegate changes are read again', async () => {
    expect((await loadShipEjectionEligibility(input)).status).toBe('allowed');
    params.crew.Crew.delegatedTo = '0x999';
    expect((await loadShipEjectionEligibility(input)).reason).toBe('Incorrect crew wallet');
    params.ship.Control.controller = params.crew;
    expect((await loadShipEjectionEligibility(input)).reason).toBe('Selected crew controls this ship');
  });
});
