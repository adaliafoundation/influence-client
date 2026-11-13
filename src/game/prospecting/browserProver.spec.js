import { proveCampaign } from './browserProver';

const packet = { circuit: 'fieldwork-r7-volume150-p10-v1', mode: 'local-simulation', sampleCount: 5, expectedPublicSignals: ['123'] };
const worker = () => ({ postMessage: jest.fn(), terminate: jest.fn() });
it('reports progress and accepts only the digest of the selected saved claim', async () => {
  const instance = worker(), onProgress = jest.fn();
  const pending = proveCampaign(packet, { createWorker: () => instance, onProgress });
  expect(instance.postMessage.mock.calls[0][0].packet).toBe(packet);
  instance.onmessage({ data: { type: 'progress', phase: 'proving' } });
  expect(onProgress).toHaveBeenCalledWith('proving');
  instance.onmessage({ data: { type: 'result', publicSignals: ['123'], proof: { pi_a: [] } } });
  expect((await pending).sampleCount).toBe(5);
  expect(instance.terminate).toHaveBeenCalledTimes(1);
});
it('rejects a mismatched statement and terminates work on cancellation', async () => {
  const bad = worker();
  const wrong = proveCampaign(packet, { createWorker: () => bad });
  bad.onmessage({ data: { type: 'result', publicSignals: ['456'], proof: {} } });
  await expect(wrong).rejects.toThrow('does not match');
  const instance = worker(), controller = new AbortController();
  const pending = proveCampaign(packet, { createWorker: () => instance, signal: controller.signal });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(instance.terminate).toHaveBeenCalledTimes(1);
});
