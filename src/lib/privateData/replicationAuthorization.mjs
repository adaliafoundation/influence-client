import { PrivateData } from '@influenceth/sdk';

const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

export async function createReplicationAuthorization(privateKey, id, peers) {
  const key = await PrivateData.derivePeerPrivateKey(privateKey);
  const grant = {
    ownerPublicKey: hex(key.publicKey.raw),
    peers: [...new Set(peers)].sort(),
    expiresAt: Math.floor(Date.now() / 1000) + 7 * 86400
  };
  // Wire format shared with the independently deployed retention peers.
  const message = await PrivateData.sha256(JSON.stringify([
    'Influence private-data replication v1', id, grant.ownerPublicKey, grant.peers, grant.expiresAt
  ]));
  grant.signature = hex(await key.sign(new TextEncoder().encode(message)));
  return grant;
}
