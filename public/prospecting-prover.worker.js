/* global snarkjs */
/* eslint-env worker */
const progress = (phase) => globalThis.postMessage({ type: 'progress', phase });
const hex = (bytes) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
async function asset(root, descriptor) {
  if (!descriptor || !/^[\w.-]+$/.test(descriptor.file) || !/^[a-f0-9]{64}$/.test(descriptor.sha256)) {
    throw new Error('Invalid proving asset manifest.');
  }
  const response = await fetch(`${root}${descriptor.file}?sha256=${descriptor.sha256}`, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Unable to download proving asset (${response.status}).`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== descriptor.bytes || hex(await crypto.subtle.digest('SHA-256', bytes)) !== descriptor.sha256) {
    throw new Error('Proving asset integrity check failed. Rebuild the development assets and retry.');
  }
  return new Uint8Array(bytes);
}
globalThis.onmessage = async ({ data: { packet, assetRoot } }) => {
  try {
    if (!['local-simulation', 'chain'].includes(packet.mode) || packet.circuit !== 'fieldwork-r7-volume150-p10-v1' ||
        !Number.isInteger(packet.sampleCount) || packet.sampleCount < 1 || packet.sampleCount > 10) {
      throw new Error('Unsupported campaign proof statement.');
    }
    const start = performance.now();
    progress('downloading');
    const response = await fetch(`${assetRoot}manifest.json`, { cache: 'no-cache' });
    if (!response.ok) throw new Error('Development proving assets are missing. Run the sandbox proof asset builder first.');
    const manifest = await response.json();
    if (manifest.circuit !== packet.circuit || !manifest.developmentOnly || manifest.maxSamples !== 10 ||
        manifest.padding !== 'zero' || Number(packet.input?.count) !== packet.sampleCount) {
      throw new Error('Proving assets do not support this campaign version or length.');
    }
    const [library, wasm, zkey, verificationKey] = await Promise.all([
      asset(assetRoot, manifest.library), asset(assetRoot, manifest.wasm),
      asset(assetRoot, manifest.zkey), asset(assetRoot, manifest.vk)
    ]);
    const libraryURL = URL.createObjectURL(new Blob([library], { type: 'application/javascript' }));
    try { globalThis.importScripts(libraryURL); } finally { URL.revokeObjectURL(libraryURL); }
    const downloaded = performance.now();
    progress('proving');
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(packet.input, wasm, zkey,
      undefined, undefined, { singleThread: true });
    const proved = performance.now();
    if (JSON.stringify(publicSignals) !== JSON.stringify(packet.expectedPublicSignals)) {
      throw new Error('The circuit result differs from the saved claim. No proof was accepted.');
    }
    progress('verifying');
    if (!await snarkjs.groth16.verify(JSON.parse(new TextDecoder().decode(verificationKey)), publicSignals, proof)) {
      throw new Error('The generated proof failed local verification.');
    }
    globalThis.postMessage({ type: 'result', proof, publicSignals,
      timings: { downloadMs: downloaded - start, proveMs: proved - downloaded, verifyMs: performance.now() - proved } });
  } catch (error) {
    globalThis.postMessage({ type: 'error', message: error.message || 'Unable to generate campaign proof.' });
  }
};
