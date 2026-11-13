/** @jest-environment node */
import { Vector3 } from 'three';
import { useProspecting } from './store';

jest.mock('~/appConfig', () => ({ appConfig: { get: () => true } }), { virtual: true });
jest.mock('@zkpassport/poseidon2', () =>
  jest.requireActual('../../../node_modules/@zkpassport/poseidon2/dist/cjs/index.cjs')
);
const identity = { chainId: '0x1', game: '0x9', owner: '0x2', asteroidId: 1, originIndex: 1, resource: 1 };
const patch = { radius: 10000, sites: [{ index: 1, x: 0, z: 0, normal: new Vector3(0, 0, 1) }] };
beforeEach(() => {
  global.crypto = require('node:crypto').webcrypto;
  useProspecting.getState().detachStorage();
  useProspecting.getState().open(1, 1, 1);
  useProspecting.getState().setPatch(patch);
});
function repository() {
  let saved = null;
  return {
    load: jest.fn(async () => saved),
    save: jest.fn(async (record, revision) => {
      saved = { record: JSON.parse(JSON.stringify(record)), revision: revision + 1 };
      return saved.revision;
    })
  };
}

it('does not accept a sample when its durable pending write fails', async () => {
  const repo = repository();
  await useProspecting.getState().attachStorage(repo, identity);
  repo.save.mockRejectedValueOnce(new Error('disk full'));
  await useProspecting.getState().sample(0, 0.5, async () => null);
  expect(useProspecting.getState().history).toHaveLength(0);
  expect(useProspecting.getState().storageStatus).toBe('error');
  expect(useProspecting.getState().message).toContain('disk full');
});

it('recovers the same outcome after the post-resolution save is interrupted', async () => {
  const repo = repository();
  await useProspecting.getState().attachStorage(repo, identity);
  const save = repo.save.getMockImplementation();
  repo.save.mockImplementationOnce(save).mockRejectedValueOnce(new Error('interrupted'));
  await useProspecting.getState().sample(0, 0.5, async () => null);
  const pending = (await repo.load()).record.pending;
  expect(pending).not.toBeNull();
  expect(useProspecting.getState().history).toHaveLength(0);
  await useProspecting.getState().attachStorage(repo, identity);
  expect(useProspecting.getState().storageStatus).toBe('ready');
  expect(useProspecting.getState().history).toHaveLength(1);
  expect(useProspecting.getState().history[0].randomness).toBe(pending.randomness);
  expect((await repo.load()).record.pending).toBeNull();
});

it('ignores a second sample while the first action is saving', async () => {
  const repo = repository();
  await useProspecting.getState().attachStorage(repo, identity);
  const save = repo.save.getMockImplementation();
  let release;
  repo.save.mockImplementationOnce((record, revision) => new Promise((resolve) => {
    release = async () => resolve(await save(record, revision));
  }));
  const first = useProspecting.getState().sample(0, 0.5, async () => null);
  await useProspecting.getState().sample(0, 0.5, async () => null);
  expect(useProspecting.getState().history).toHaveLength(0);
  expect(repo.save).toHaveBeenCalledTimes(2); // Initial campaign, then one pending action.
  await release();
  await first;
  expect(useProspecting.getState().history).toHaveLength(1);
});

it('rechecks extraction conflicts before saving an action or drawing its outcome', async () => {
  const repo = repository();
  await useProspecting.getState().attachStorage(repo, identity);
  await useProspecting.getState().sample(0, 0.5, async () => 'Extractor is RUNNING');
  expect(repo.save).toHaveBeenCalledTimes(1);
  expect(useProspecting.getState().history).toHaveLength(0);
  expect(useProspecting.getState().busy).toBe(false);
  expect(useProspecting.getState().message).toBe('Extractor is RUNNING');
});
