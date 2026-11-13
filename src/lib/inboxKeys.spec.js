/** @jest-environment node */
import { Encryption } from '@influenceth/sdk';
import { assertInboxKey, recoverInboxKey } from './inboxKeys';
jest.mock('./utils', () => ({ resolveChainId: (id) => id }));

it('preserves the existing inbox recovery message and seed derivation', async () => {
  const seed = 'abcdef0123456789abcdef0123456789';
  const wallet = { signMessage: jest.fn(async () => ['123', '456']) };
  const key = await recoverInboxKey(wallet, '0x1', seed);
  expect(wallet.signMessage).toHaveBeenCalledWith(expect.objectContaining({
    domain: { name: 'Influence', chainId: '0x1', version: '1.1.0' },
    message: { message: 'Messaging Hash', nonce: seed.substr(0, 24) }
  }));
  const expected = await Encryption.generatePrivateKeyFromSeed(seed + BigInt('123456').toString(16));
  expect(key).toBe(expected);
  expect(() => assertInboxKey(key, Encryption.getPublicKeyFromPrivateKey(expected))).not.toThrow();
  const other = await Encryption.generatePrivateKeyFromSeed('other-seed');
  expect(() => assertInboxKey(key, Encryption.getPublicKeyFromPrivateKey(other))).toThrow('published private-data key');
});
