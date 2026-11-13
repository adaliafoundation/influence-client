import { PrivateData } from '@influenceth/sdk';
import { multiaddr } from '@multiformats/multiaddr';
import { createPrivateDataNode } from './node.mjs';
import { PRIVATE_DATA_PROTOCOL, recordId, contentHash, readJSON, sendJSON } from './protocol.mjs';
import { createReplicationAuthorization } from './replicationAuthorization.mjs';

export async function createPrivateDataTransport({ privateKey, peers }) {
  if (!peers.length) throw new Error('No private-data retention peers configured.');
  const addresses = peers.map((address) => {
    if (!/\/p2p\/[^/]+$/.test(address)) throw new Error('Retention peer addresses must include their peer ID.');
    return multiaddr(address);
  });
  const signingKey = await PrivateData.derivePeerPrivateKey(privateKey);
  const node = await createPrivateDataNode({ privateKey: signingKey });
  const acknowledged = new Map();
  const knownRecords = new Map();
  const remember = async (id, record) => {
    const hash = await contentHash(record, id), key = `${id}:${record.revision}`;
    if (knownRecords.has(key) && knownRecords.get(key) !== hash) {
      throw Object.assign(new Error('Conflicting private-data revisions.'), { code: 'PRIVATE_DATA_INVALID_RECORD' });
    }
    knownRecords.set(key, hash);
  };
  async function request(address, message) {
    const signal = AbortSignal.timeout(8000);
    const stream = await node.dialProtocol(address, PRIVATE_DATA_PROTOCOL, { signal });
    const abort = () => stream.abort(new Error('Private-data request timed out.'));
    signal.addEventListener('abort', abort, { once: true });
    try {
      await sendJSON(stream, message, signal);
      const reply = await readJSON(stream);
      if (reply.error) throw Object.assign(new Error(reply.error), { code: reply.errorCode });
      return reply;
    } catch (error) { stream.abort(error); throw error; }
    finally { signal.removeEventListener('abort', abort); }
  }
  return {
    async put(envelope) {
      const { id, record } = await PrivateData.signRecord(privateKey, envelope.scope, envelope);
      const hash = await contentHash(record, id);
      await remember(id, record);
      const peerIds = addresses.map(address => address.toString().split('/p2p/').at(-1));
      const replication = await createReplicationAuthorization(privateKey, id, peerIds);
      const results = await Promise.allSettled(addresses.map(async address => {
        const key = `${address}:${id}`;
        const write = previousRevision => request(address, { op: 'put', id, record, replication, previousRevision });
        let reply;
        try { reply = await write(acknowledged.get(key) ?? envelope.remoteRevision ?? 0); }
        catch (error) {
          if (error.code !== 'PRIVATE_DATA_REVISION_CONFLICT') throw error;
          const current = await request(address, { op: 'get', id });
          if (current.id !== id || !current.record) throw error;
          await PrivateData.verifySignedRecord(signingKey.publicKey, id, current.record);
          if (knownRecords.get(`${id}:${current.record.revision}`) !== await contentHash(current.record, id)) throw error;
          // A relay or an uncertain response may have saved a snapshot this device
          // already signed. Only that exact known snapshot can advance our CAS base.
          reply = await write(current.record.revision);
        }
        if (reply.id !== id || reply.revision !== record.revision || reply.hash !== hash) {
          throw new Error('Retention peer did not acknowledge the saved revision.');
        }
        // Keep each successful receipt even if a different peer is offline.
        acknowledged.set(key, record.revision);
      }));
      const failed = results.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
      return { scope: envelope.scope, revision: envelope.revision };
    },
    async get(scope, publicKey) {
      const id = await recordId(privateKey, scope);
      const results = await Promise.allSettled(addresses.map(async address => ({ address,
        reply: await request(address, { op: 'get', id }) })));
      const replies = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
      if (!replies.length) throw new Error('Private-data retention peers are unavailable.');
      const records = [];
      for (const { address, reply } of replies) {
        if (reply.id !== id) throw Object.assign(new Error('Retention peer returned the wrong private record.'), { code: 'PRIVATE_DATA_INVALID_RECORD' });
        if (reply.record) {
          try {
            await PrivateData.verifySignedRecord(signingKey.publicKey, id, reply.record);
          } catch (error) { error.code = 'PRIVATE_DATA_INVALID_RECORD'; throw error; }
          records.push(reply.record);
          await remember(id, reply.record);
        }
        acknowledged.set(`${address}:${id}`, reply.record?.revision || 0);
      }
      records.sort((a, b) => b.revision - a.revision);
      const newest = records[0];
      if (!newest) return null;
      const hash = await contentHash(newest, id);
      for (const other of records.filter((record) => record.revision === newest.revision)) {
        if (await contentHash(other, id) !== hash) throw Object.assign(new Error('Private-data peers disagree about this revision.'), { code: 'PRIVATE_DATA_INVALID_RECORD' });
      }
      return { ...newest, scope, publicKey, pendingRemote: false };
    },
    stop: () => node.stop()
  };
}
