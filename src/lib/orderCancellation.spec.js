const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const { Entity } = require('@influenceth/sdk');
const { getOrderCancellationAuthorization } = require('./orderCancellation');
const crew = { label: Entity.IDS.CREW, id: 1 };
const other = { label: Entity.IDS.CREW, id: 2 };
const allowed = { status: 'allowed' };
const denied = { status: 'denied' };
const unresolved = { status: 'unresolved' };
test.each([
  [crew, denied, denied, 'allowed'],
  [other, allowed, denied, 'allowed'],
  [other, denied, allowed, 'allowed'],
  [other, denied, denied, 'denied'],
  [other, unresolved, allowed, 'unresolved'],
  [other, denied, unresolved, 'unresolved'],
])('cancellation authorization respects creator, storage, and marketplace control', (creator, storage, market, status) => {
  expect(getOrderCancellationAuthorization(crew, creator, storage, market).status).toBe(status);
});
