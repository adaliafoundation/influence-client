const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const { Entity, Permission, Time } = require('@influenceth/sdk');
const { acquisitionMatches, productionChecks } = require('./productionAuthorization');
const crew = { id: 1, label: Entity.IDS.CREW };
const controller = { id: 2, label: Entity.IDS.CREW, Crew: { delegatedTo: '0x123' } };
const facility = { id: 3, label: Entity.IDS.BUILDING, Control: { controller }, PrepaidPolicies: [{ permission: Permission.IDS.RUN_PROCESS, rate: 3600, initialTerm: 10 }] };
const request = { crew, facility, kind: 'process', completionTime: 200, evaluationTime: 100 };
const lease = { recipient: '0x123', term: 100, termPrice: 100 };
const decision = { status: 'denied', entities: [facility, controller] };

test('fresh matching lease terms can precede production', () => {
  expect(acquisitionMatches(decision, 1, request, { lease })).toBe(true);
});
test('policy removal, price changes and delegate changes invalidate a quoted lease', () => {
  expect(acquisitionMatches({ ...decision, entities: [{ ...facility, PrepaidPolicies: [] }, controller] }, 1, request, { lease })).toBe(false);
  expect(acquisitionMatches(decision, 1, request, { lease: { ...lease, termPrice: 99 } })).toBe(false);
  expect(acquisitionMatches(decision, 1, request, { lease: { ...lease, recipient: '0x456' } })).toBe(false);
});
test('a lease never bypasses unresolved access or destination access', () => {
  expect(acquisitionMatches({ ...decision, status: 'unresolved' }, 1, request, { lease })).toBe(false);
  expect(acquisitionMatches(decision, 2, request, { lease })).toBe(false);
});
test('processing checks source now and both facility and destination through completion', () => {
  const origin = { id: 4, label: Entity.IDS.BUILDING };
  const destination = { id: 5, label: Entity.IDS.BUILDING };
  expect(productionChecks({ ...request, origin, destination })).toEqual([
    ['can', [crew, origin, Permission.IDS.REMOVE_PRODUCTS]],
    ['canUntil', [crew, facility, Permission.IDS.RUN_PROCESS, 200]],
    ['canUntil', [crew, destination, Permission.IDS.ADD_PRODUCTS, 200]]
  ]);
});

test('a quoted lease must cover the refreshed completion time, inclusively', () => {
  expect(acquisitionMatches(decision, 1, request, { lease })).toBe(true);
  expect(acquisitionMatches(decision, 1, { ...request, completionTime: 201 }, { lease })).toBe(false);
  expect(acquisitionMatches(decision, 1, { ...request, evaluationTime: undefined }, { lease })).toBe(false);
});


test('new lease quotes cover each rounded phase rather than a rounded fractional sum', () => {
  const duration = 2 * Time.toRealDurationCeil(8165, 24);
  const completionTime = Time.getProductionCompletionTime(100, 0, duration);
  expect(acquisitionMatches(decision, 1, { ...request, completionTime }, { lease: { ...lease, term: 681, termPrice: 681 } })).toBe(false);
  expect(acquisitionMatches(decision, 1, { ...request, completionTime }, { lease: { ...lease, term: 682, termPrice: 682 } })).toBe(true);
});
