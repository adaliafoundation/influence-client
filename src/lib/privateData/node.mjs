import { createLibp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import { generateKeyPairFromSeed } from '@libp2p/crypto/keys';

export async function createPrivateDataNode({ seed, privateKey, listen = [] } = {}) {
  const identity = privateKey || (seed ? await generateKeyPairFromSeed('Ed25519', seed) : undefined);
  return createLibp2p({
    ...(identity ? { privateKey: identity } : {}),
    addresses: { listen },
    transports: [webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: { identify: identify() },
    // Peers are explicitly configured, including loopback peers during playtesting.
    connectionGater: { denyDialMultiaddr: () => false }
  });
}
