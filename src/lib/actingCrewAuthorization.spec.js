const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const { Entity } = require('@influenceth/sdk');
const { recheckActingCrew } = require('./actingCrewAuthorization');
const station = { label: Entity.IDS.BUILDING, id: 2 };
const crew = {
  label: Entity.IDS.CREW, id: 1,
  Crew: { delegatedTo: '0x123', readyAt: 100, roster: [1] }, Ship: { emergencyAt: 0 },
  Location: { location: station, locations: [station, { label: Entity.IDS.ASTEROID, id: 1 }] }
};
const options = { crew, accountAddress: '0x123', blockTime: 100, isLaunched: true, asteroidId: 1 };
const check = (current, extra = {}, entities = []) => recheckActingCrew({
  ...options, ...extra, recheck: jest.fn(async () => ({ status: 'allowed', entities: [current, ...entities] }))
});

test('ready boundary is inclusive and busy self-ejection can skip readiness', async () => {
  expect((await check(crew)).status).toBe('allowed');
  const busy = { ...crew, Crew: { ...crew.Crew, readyAt: 101 } };
  expect((await check(busy)).status).toBe('denied');
  expect((await check(busy, { requireReady: false })).status).toBe('allowed');
});
test('emergency mode is checked on the current ship rather than the escape module', async () => {
  const ship = { label: Entity.IDS.SHIP, id: 3, Ship: { emergencyAt: 50 } };
  const aboard = { ...crew, Location: { ...crew.Location, location: ship } };
  expect((await check(aboard, {}, [ship])).status).toBe('denied');
  expect((await check({ ...crew, Ship: { emergencyAt: 50 } })).status).toBe('denied');
  expect((await check({ ...crew, Ship: undefined })).status).toBe('unresolved');
});
test('delegation, roster and asteroid changes block cleanup', async () => {
  expect((await check({ ...crew, Crew: { ...crew.Crew, delegatedTo: '0x456' } })).status).toBe('denied');
  expect((await check({ ...crew, Crew: { ...crew.Crew, roster: [] } })).status).toBe('denied');
  expect((await check(crew, { asteroidId: 2 })).status).toBe('denied');
});
test('movement while resolving the current ship remains unresolved', async () => {
  const ship = { label: Entity.IDS.SHIP, id: 3 };
  const recheck = jest.fn().mockResolvedValueOnce({ status: 'allowed', entities: [{ ...crew, Location: { location: ship } }] })
    .mockResolvedValueOnce({ status: 'allowed', entities: [crew, { ...ship, Ship: { emergencyAt: 0 } }] });
  expect((await recheckActingCrew({ ...options, recheck })).status).toBe('unresolved');
});
