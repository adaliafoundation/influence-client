import { Encryption, PrivateData } from '@influenceth/sdk';
import { replayCampaign, scopeKey } from './campaignRecord';

const DATABASE = 'influence-private-campaigns';
const STORE = 'campaigns';
const opening = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(DATABASE, 1);
  request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'scope' });
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

export function createCampaignRepository(identity, publicKey, privateKey, campaignId) {
  const scope = scopeKey(identity, campaignId);
  const assertScope = (record) => {
    if (campaignId !== undefined) {
      replayCampaign(record, identity);
      if (record.mode !== 'chain' || String(record.campaignId) !== String(campaignId)) {
        throw new Error('Private record belongs to another campaign.');
      }
    }
  };
  const read = async () => {
    const db = await opening();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const request = tx.objectStore(STORE).get(scope);
        let value;
        request.onsuccess = () => { value = request.result; };
        tx.oncomplete = () => resolve(value);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Campaign read was aborted.'));
      });
    } finally { db.close(); }
  };
  return {
    async load() {
      const envelope = await read();
      if (!envelope) return null;
      if (envelope.publicKey !== publicKey) throw new Error('This campaign was saved with a different inbox key. Recover that key before continuing.');
      const record = JSON.parse(await Encryption.decryptContent(privateKey, envelope.ciphertext));
      assertScope(record);
      return { record, revision: envelope.revision, pendingRemote: envelope.pendingRemote };
    },
    async save(record, expectedRevision) {
      assertScope(record);
      const ciphertext = await PrivateData.encryptRecord(publicKey, record);
      const envelope = { scope, publicKey, revision: expectedRevision + 1,
        ciphertext, pendingRemote: true, updatedAt: Date.now() };
      const db = await opening();
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          const store = tx.objectStore(STORE);
          const request = store.get(scope);
          let conflict;
          request.onsuccess = () => {
            if ((request.result?.revision || 0) !== expectedRevision) {
              conflict = new Error('Campaign changed in another tab. Reopen it before continuing.');
              tx.abort();
            } else store.put({ ...envelope, remoteRevision: request.result?.remoteRevision || 0 });
          };
          tx.oncomplete = resolve;
          tx.onabort = () => reject(conflict || tx.error || new Error('Campaign save was aborted.'));
          tx.onerror = () => reject(tx.error);
        });
      } finally { db.close(); }
      return envelope.revision;
    },
    async restore(envelope) {
      if (!envelope || envelope.scope !== scope || envelope.publicKey !== publicKey ||
          !Number.isSafeInteger(envelope.revision) || envelope.revision < 1) {
        throw new Error('Remote campaign identity or revision is invalid.');
      }
      const record = JSON.parse(await Encryption.decryptContent(privateKey, envelope.ciphertext));
      replayCampaign(record, identity);
      assertScope(record);
      const db = await opening();
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          const store = tx.objectStore(STORE);
          const request = store.get(scope);
          let conflict;
          request.onsuccess = () => {
            const local = request.result;
            if (local?.revision > envelope.revision) return;
            if (local?.revision === envelope.revision) {
              if (JSON.stringify(local.ciphertext) === JSON.stringify(envelope.ciphertext)) return;
              conflict = new Error('This campaign has conflicting device saves. Recover the current device before continuing.');
            } else if (local?.pendingRemote) {
              conflict = new Error('A newer remote campaign conflicts with unsynced local samples.');
            }
            if (conflict) tx.abort();
            else store.put({ ...envelope, pendingRemote: false, remoteRevision: envelope.revision });
          };
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(conflict || tx.error || new Error('Remote recovery was aborted.'));
        });
      } finally { db.close(); }
    },
    async pendingEnvelope() {
      const envelope = await read();
      return envelope?.pendingRemote ? envelope : null;
    },
    // The network adapter must acknowledge durable storage of this exact revision.
    async replicate(transport) {
      const envelope = await this.pendingEnvelope();
      if (!envelope) return;
      const ack = await transport.put(envelope);
      if (ack.scope !== scope || ack.revision !== envelope.revision) throw new Error('Invalid replication acknowledgment.');
      const db = await opening();
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          const store = tx.objectStore(STORE);
          const request = store.get(scope);
          request.onsuccess = () => {
            const current = request.result;
            if (!current || current.revision < envelope.revision) return;
            if (current.revision === envelope.revision && JSON.stringify(current.ciphertext) !== JSON.stringify(envelope.ciphertext)) return;
            store.put({ ...current, remoteRevision: Math.max(current.remoteRevision || 0, envelope.revision),
              pendingRemote: current.revision !== envelope.revision });
          };
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error('Replication acknowledgment save was aborted.'));
        });
      } finally { db.close(); }
    }
  };
}

export async function listCampaigns(identity, publicKey, privateKey) {
  const scope = JSON.parse(scopeKey(identity));
  const db = await opening();
  let envelopes;
  try {
    envelopes = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
  const matching = envelopes.filter((envelope) => {
    const saved = JSON.parse(envelope.scope);
    return ['chainId', 'game', 'owner', 'asteroidId'].every((key) => saved[key] === scope[key]);
  });
  return Promise.all(matching.map(async (envelope) => {
    if (envelope.publicKey !== publicKey) throw new Error('Recover the key used to save these campaigns.');
    const record = JSON.parse(await Encryption.decryptContent(privateKey, envelope.ciphertext));
    replayCampaign(record, JSON.parse(envelope.scope));
    return record;
  }));
}
