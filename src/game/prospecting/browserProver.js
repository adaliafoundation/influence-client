const ASSET_ROOT = `${process.env.PUBLIC_URL || ''}/prospecting-proofs/`;

export function proveCampaign(packet, { signal, onProgress = () => {}, createWorker } = {}) {
  if (signal?.aborted) return Promise.reject(new DOMException('Proof cancelled.', 'AbortError'));
  const worker = createWorker ? createWorker() : new Worker(`${process.env.PUBLIC_URL || ''}/prospecting-prover.worker.js`);
  return new Promise((resolve, reject) => {
    const finish = (error, result) => {
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      if (error) reject(error); else resolve(result);
    };
    const abort = () => finish(new DOMException('Proof cancelled.', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    worker.onerror = () => finish(new Error('The browser prover stopped unexpectedly. Retry or use a device with more available memory.'));
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') { onProgress(data.phase); return; }
      if (data.type === 'error') { finish(new Error(data.message)); return; }
      if (data.type !== 'result') return;
      if (JSON.stringify(data.publicSignals) !== JSON.stringify(packet.expectedPublicSignals)) {
        finish(new Error('The proof does not match the saved campaign.'));
        return;
      }
      finish(null, { circuit: packet.circuit, sampleCount: packet.sampleCount,
        mode: packet.mode, proof: data.proof, publicSignals: data.publicSignals,
        timings: data.timings });
    };
    worker.postMessage({ packet, assetRoot: new URL(ASSET_ROOT, window.location.href).href });
  });
}
