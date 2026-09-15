const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createGrypeConfig } = require('./create-grype-config.cjs');
const exceptions = require('../security/vulnerability-exceptions.json');

test('unexpired exceptions retain their exact CVE and package scope', () => {
  const config = createGrypeConfig(exceptions, new Date('2026-12-31T23:59:59.999Z'));
  assert.deepEqual(config.ignore, exceptions.map(({ vulnerability, package: pkg }) => ({
    vulnerability, package: pkg
  })));
});

test('all current exceptions stop applying at midnight UTC on January 1, 2027', () => {
  for (const timestamp of ['2027-01-01T00:00:00.000Z', '2027-06-01T00:00:00.000Z']) {
    assert.deepEqual(createGrypeConfig(exceptions, new Date(timestamp)), { ignore: [] });
  }
});

test('expiration is evaluated separately for each allowance', () => {
  const entries = [exceptions[0], { ...exceptions[1], expires: '2027-02-01' }];
  assert.deepEqual(createGrypeConfig(entries, new Date('2027-01-01T00:00:00Z')).ignore,
    [{ vulnerability: entries[1].vulnerability, package: entries[1].package }]);
});

test('missing or invalid expiration and incomplete scopes fail closed', () => {
  for (const expires of [undefined, '', 'never', '2027-02-30']) {
    assert.throws(() => createGrypeConfig([{ ...exceptions[0], expires }]), /Invalid exception expiration/);
  }
  assert.throws(() => createGrypeConfig([{ ...exceptions[0], package: {} }]), /exact package/);
  assert.throws(() => createGrypeConfig([{ ...exceptions[0], reason: '' }]), /reason/);
});
