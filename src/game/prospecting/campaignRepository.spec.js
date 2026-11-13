/** @jest-environment node */
import { runInThisContext } from 'node:vm';
let Encryption, Prospecting, createCampaignRepository, listCampaigns;

jest.mock('@zkpassport/poseidon2', () =>
  jest.requireActual('../../../node_modules/@zkpassport/poseidon2/dist/cjs/index.cjs')
);
const identity = { chainId: '0x1', game: '0x9', owner: '0x2', asteroidId: 1, originIndex: 10, resource: 1 };
let privateKey, publicKey;
beforeAll(async () => {
  // CRA's older Jest node environment omits these modern Node globals.
  global.crypto = require('node:crypto').webcrypto;
  global.DOMException = runInThisContext('DOMException');
  global.structuredClone = runInThisContext('structuredClone');
  require('fake-indexeddb/auto');
  ({ Encryption, Prospecting } = require('@influenceth/sdk'));
  ({ createCampaignRepository, listCampaigns } = require('./campaignRepository'));
  privateKey = await Encryption.generatePrivateKeyFromSeed('campaign-tests');
  publicKey = Encryption.getPublicKeyFromPrivateKey(privateKey);
});
const repo = (id = identity, key = privateKey) => createCampaignRepository(id, publicKey, key);

it('archives chain campaigns independently on the same starting lot and rejects another campaign payload', async () => {
  const id = { ...identity, originIndex: 101 };
  const record = Prospecting.createRecord({ identity: id, mode: 'chain', campaignId: 7, context: '10' });
  const first = createCampaignRepository(id, publicKey, privateKey, '7');
  const second = createCampaignRepository(id, publicKey, privateKey, '8');
  await first.save(record, 0);
  await second.save({ ...record, campaignId: '8' }, 0);
  expect((await first.load()).record.campaignId).toBe('7');
  expect((await second.load()).record.campaignId).toBe('8');
  await expect(first.save({ ...record, campaignId: '8' }, 1)).rejects.toThrow('another campaign');
});

it('persists ciphertext, recovers across repository instances, and isolates accounts', async () => {
  const record = { context: 'private-test-secret', actions: [], identity };
  expect(await repo().save(record, 0)).toBe(1);
  const envelope = await repo().pendingEnvelope();
  expect(JSON.stringify(envelope)).not.toContain('private-test-secret');
  expect((await repo().load()).record).toEqual(record);
  expect(await repo({ ...identity, owner: '0x3' }).load()).toBeNull();
  const wrong = await Encryption.generatePrivateKeyFromSeed('wrong');
  await expect(repo(identity, wrong).load()).rejects.toThrow();
});

it('rejects stale writes and does not acknowledge a newer local revision', async () => {
  const id = { ...identity, originIndex: 11 };
  const repository = repo(id);
  await repository.save({ marker: 1 }, 0);
  await expect(repository.save({ marker: 9 }, 0)).rejects.toThrow('another tab');
  await repository.replicate({
    put: async (envelope) => {
      await repository.save({ marker: 2 }, 1);
      return { scope: envelope.scope, revision: envelope.revision };
    }
  });
  expect((await repository.pendingEnvelope()).revision).toBe(2);
  expect((await repository.pendingEnvelope()).remoteRevision).toBe(1);
  await repository.replicate({ put: async ({ scope, revision }) => ({ scope, revision }) });
  expect(await repository.pendingEnvelope()).toBeNull();
  expect((await repository.load()).record.marker).toBe(2);
});

const savedFixture = (id) => {
  const { input } = require('./__fixtures__/campaign.json');
  return {
    schema: 1, rules: 7, mode: 'local-simulation', quantityMultiplierBps: 15000,
    identity: id, context: input.context, pending: null, selected: null, claimIndex: Number(input.selected),
    actions: input.methods.map((method, i) => ({
      action: { method: Number(method), target: Number(input.targets[i]), source: Number(input.sources[i]),
        depth: Number(input.depths[i]), salt: input.salts[i] },
      meta: input.meta[i], mask: input.blockedApproaches[i], randomness: input.randomness[i]
    }))
  };
};
it('restores a validated encrypted transcript after local storage loss', async () => {
  const id = { ...identity, originIndex: 14, asteroidId: 991 };
  const record = savedFixture(id);
  const ciphertext = await Encryption.encryptContent(publicKey, JSON.stringify(record));
  const remote = { scope: Prospecting.getScopeKey(id), publicKey, revision: 9, ciphertext, updatedAt: Date.now() };
  await repo(id).restore(remote);
  const recovered = await repo(id).load();
  expect(recovered.record).toEqual(record);
  expect(recovered.revision).toBe(9);
  expect(recovered.pendingRemote).toBe(false);
  expect(await repo(id).save(record, 9)).toBe(10);
});
it('rejects conflicting local/remote heads and ciphertext for the wrong campaign', async () => {
  const id = { ...identity, originIndex: 14, asteroidId: 992 };
  const record = savedFixture(id);
  const remote = { scope: Prospecting.getScopeKey(id), publicKey, revision: 2,
    ciphertext: await Encryption.encryptContent(publicKey, JSON.stringify(record)), updatedAt: Date.now() };
  await repo(id).save(record, 0);
  await expect(repo(id).restore(remote)).rejects.toThrow('unsynced local');
  await expect(repo(id).restore({ ...remote, revision: 1 })).rejects.toThrow('conflicting device');
  const wrong = { ...record, identity: { ...id, owner: '0x999' } };
  await expect(repo(id).restore({ ...remote, ciphertext: await Encryption.encryptContent(publicKey, JSON.stringify(wrong)) }))
    .rejects.toThrow('Incompatible campaign identity');
  expect((await repo(id).load()).record).toEqual(record);
});

it('lists validated campaigns only for the unlocked account, deployment and asteroid', async () => {
  const id = { ...identity, asteroidId: 993, originIndex: 14 };
  const record = savedFixture(id);
  await repo(id).save(record, 0);
  const other = { ...id, owner: '0x444' };
  await repo(other).save({ private: 'another account' }, 0);
  const records = await listCampaigns(id, publicKey, privateKey);
  expect(records).toEqual([record]);
  await expect(listCampaigns(id, publicKey, await Encryption.generatePrivateKeyFromSeed('wrong-catalog-key'))).rejects.toThrow();
});
