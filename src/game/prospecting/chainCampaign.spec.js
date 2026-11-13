/** @jest-environment node */
import { Prospecting, Lot } from '@influenceth/sdk';
import { createChainCampaign } from './chainCampaign';

jest.mock('@zkpassport/poseidon2', () =>
  jest.requireActual('../../../node_modules/@zkpassport/poseidon2/dist/cjs/index.cjs')
);
const identity = { chainId: '0x1', game: '0x9', owner: '0x2', asteroidId: 1, originIndex: 1, resource: 1 };
const lot = { label: 4, id: Lot.toId(1, 1) };
const supply = { entity: { label: 5, id: 3 }, slot: 2 };
function setup() {
  let record = Prospecting.createRecord({ identity, mode: 'chain', campaignId: 7, context: '10' });
  let accepted = false;
  const meta = Prospecting.packMeta({ lot: 1, x: 500000, z: 500000, abundance: 500000 });
  const game = {
    campaign: jest.fn(async () => ({ id: '7', context: '10', owner: '0x2', origin: 1, asteroidId: 1, resource: 1,
      qualityBps: 10000, crew: { id: 1, label: 1 }, chainStatus: 1, closed: false, count: 0,
      pending: accepted, originLot: lot })),
    previewSample: jest.fn(async () => ({ meta, blockedApproaches: '0' })),
    core: jest.fn(async () => ({ commitment: record.pending.commitment, meta, blockedApproaches: '0', random: '0', target: '90', ready: 900 })),
    randomness: jest.fn(async () => '123')
  };
  const provider = { getBlock: jest.fn(async () => ({ timestamp: 1000, block_number: 100 })),
    getTransactionReceipt: jest.fn(async () => ({ execution_status: 'REVERTED' })) };
  const save = jest.fn(async next => { record = JSON.parse(JSON.stringify(next)); });
  const execute = jest.fn(async (system, vars) => {
    expect(record.pending).not.toBeNull();
    expect(vars.commitment).toBe(record.pending.commitment);
    expect(vars).not.toHaveProperty('action');
    expect(vars).not.toHaveProperty('salt');
    accepted = true;
    return { status: 'submitted', txHash: '0x1' };
  });
  const controller = createChainCampaign({ game, provider, read: () => record, save, execute,
    crew: { label: 1, id: 1 }, recheck: async () => null });
  return { controller, game, provider, save, execute, record: () => record };
}
beforeAll(() => { global.crypto = require('node:crypto').webcrypto; });

it('persists the full commitment intent before broadcasting and resolves only accepted future entropy', async () => {
  const s = setup();
  await s.controller.sample({ method: 0, source: 0, target: 0, depth: 0 }, lot, supply);
  expect(s.record().pending.stage).toBe('submitted');
  expect(s.save.mock.calls[0][0].pending.supply).toEqual(supply);
  await s.controller.synchronize();
  expect(s.record().pending).toBeNull();
  expect(s.record().actions).toHaveLength(1);
  expect(s.record().actions[0].randomness).toBe('123');
  expect(s.execute).toHaveBeenCalledTimes(1);
});
it('does not broadcast or reveal a result when the pending save fails', async () => {
  const s = setup();
  s.save.mockRejectedValueOnce(new Error('disk full'));
  await expect(s.controller.sample({ method: 0, source: 0, target: 0, depth: 0 }, lot, supply)).rejects.toThrow('disk full');
  expect(s.execute).not.toHaveBeenCalled();
  expect(s.record().actions).toHaveLength(0);
});
it('recovers an accepted transaction even when the wallet returned no hash', async () => {
  const s = setup();
  const execute = s.execute.getMockImplementation();
  s.execute.mockImplementationOnce(async (...args) => { await execute(...args); return { status: 'unknown' }; });
  await s.controller.sample({ method: 0, source: 0, target: 0, depth: 0 }, lot, supply);
  expect(s.record().pending.stage).toBe('prepared');
  await s.controller.synchronize();
  expect(s.record().actions).toHaveLength(1);
  expect(s.execute).toHaveBeenCalledTimes(1);
});
it('does not resolve drilling work before both its time and block targets', async () => {
  const s = setup();
  await s.controller.sample({ method: 0, source: 0, target: 0, depth: 0 }, lot, supply);
  s.provider.getBlock.mockResolvedValue({ timestamp: 1000, block_number: 99 });
  await s.controller.synchronize();
  expect(s.record().pending.stage).toBe('accepted');
  expect(s.record().actions).toHaveLength(0);
  expect(s.game.randomness).not.toHaveBeenCalled();
});
it('refuses a core that does not match the durable private commitment', async () => {
  const s = setup();
  await s.controller.sample({ method: 0, source: 0, target: 0, depth: 0 }, lot, supply);
  const get = s.game.core.getMockImplementation();
  s.game.core.mockImplementation(async (...args) => ({ ...await get(...args), commitment: '999' }));
  await expect(s.controller.synchronize()).rejects.toThrow('differs');
  expect(s.record().actions).toHaveLength(0);
});
