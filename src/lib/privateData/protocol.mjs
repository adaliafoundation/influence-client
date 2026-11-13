import { PrivateData } from '@influenceth/sdk';

export const {
  PROTOCOL: PRIVATE_DATA_PROTOCOL, MAX_RECORD_BYTES,
  sha256, keySeed, recordId, contentHash, validateRemoteRecord
} = PrivateData;
const encoder = new TextEncoder();
export async function sendJSON(stream, value, signal) {
  const bytes = encoder.encode(JSON.stringify(value));
  if (bytes.length > MAX_RECORD_BYTES) throw new Error('Private record exceeds the protocol size limit.');
  stream.send(bytes);
  await stream.close({ signal });
}
export async function readJSON(stream) {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let length = 0, text = '';
  for await (const chunk of stream) {
    length += chunk.byteLength;
    if (length > MAX_RECORD_BYTES) throw new Error('Private record exceeds the protocol size limit.');
    text += decoder.decode(chunk.subarray(), { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}
