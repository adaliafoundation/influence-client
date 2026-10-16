const { TextDecoder, TextEncoder } = require('util');

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

const { num, typedData } = require('starknet');
const { buildRevisionOneLoginTypedData } = require('./loginTypedData');
const {
  PrivyStarknetSigner,
  READY_V040_ACCOUNT_CLASS_HASH,
  READY_V050_ACCOUNT_CLASS_HASH,
  createPrivyReadyAccount,
  getPrivyReadyAccountDetails,
  normalizePrivyStarknetWallet,
  parsePrivyStarkSignature
} = require('./privyWallet');

const wallet = {
  address: '0xabc',
  chain_type: 'starknet',
  id: 'wallet-id',
  public_key: '0x123'
};

test('normalizes Privy extended-chain wallet responses', () => {
  expect(normalizePrivyStarknetWallet(wallet)).toEqual({
    address: '0xabc',
    chainType: 'starknet',
    id: 'wallet-id',
    publicKey: '0x123'
  });
});

test('derives the Ready v0.4 account and AVNU deployment data', () => {
  const details = getPrivyReadyAccountDetails(wallet);

  expect(READY_V040_ACCOUNT_CLASS_HASH).toBe(
    '0x036078334509b514626504edc9fb252328d1a240e4e948bef8d0c08dff45927f'
  );
  expect(details.address).toBe('0x364e72b471b9eca2b6979c4bf6c9ae3e3ed3e4083af8cbf7e236577c3bdaaac');
  expect(details.deploymentData).toEqual({
    address: details.address,
    calldata: ['0x0', '0x123', '0x1'],
    class_hash: READY_V040_ACCOUNT_CLASS_HASH,
    salt: '0x123',
    version: 1
  });
});

test('keeps the authenticated paymaster instance on the Privy account', async () => {
  const paymaster = { buildTransaction: jest.fn(), executeTransaction: jest.fn() };
  const accountDetails = await createPrivyReadyAccount({
    paymaster,
    provider: { getClassHashAt: jest.fn().mockRejectedValue({ code: 20 }) },
    signRawHash: jest.fn(),
    wallet
  });

  expect(accountDetails.account.paymaster).toBe(paymaster);
});

test('parses Privy Stark signatures into Starknet felts', () => {
  const signature = `0x${'1'.padStart(64, '0')}${'2'.padStart(64, '0')}`;
  expect(parsePrivyStarkSignature(signature)).toEqual(['0x1', '0x2']);
  expect(() => parsePrivyStarkSignature('0x1234')).toThrow('invalid Starknet signature');
});

test('uses Starknet.js hashing before asking Privy to sign', async () => {
  const rawSignature = `0x${'1'.padStart(64, '0')}${'2'.padStart(64, '0')}`;
  const signRawHash = jest.fn().mockResolvedValue({ signature: rawSignature });
  const signer = new PrivyStarknetSigner({
    publicKey: wallet.public_key,
    signRawHash
  });
  const accountAddress = '0x456';
  const loginMessage = buildRevisionOneLoginTypedData({
    domain: {
      chainId: '0x534e5f5345504f4c4941',
      name: 'Influence',
      version: '1.1.0'
    },
    message: {
      message: 'Login to Influence',
      nonce: 'test-nonce'
    }
  });

  await expect(signer.signMessage(loginMessage, accountAddress)).resolves.toEqual(['0x1', '0x2']);
  expect(signRawHash).toHaveBeenCalledWith(num.toHex(
    typedData.getMessageHash(loginMessage, accountAddress)
  ));
});


test.each([READY_V050_ACCOUNT_CLASS_HASH, '0x999'])('preserves deployed v0.5 addresses even after upgrades (%s)', async (classHash) => {
  const provider = { getClassHashAt: jest.fn().mockResolvedValue(classHash) };
  const details = await createPrivyReadyAccount({ provider, wallet, signRawHash: jest.fn() });
  const legacyAddress = '0xd18c60431c8eda775605cafc445959c09733f2448d221f9ce64fd8cec40975';
  expect(provider.getClassHashAt).toHaveBeenCalledWith(legacyAddress);
  expect(details.address).toBe(legacyAddress);
  expect(details.account.address).toBe(legacyAddress);
  expect(details.deploymentData.class_hash).toBe(READY_V050_ACCOUNT_CLASS_HASH);
});

test.each([{ code: 20 }, new Error('Contract not found')])('uses v0.4 only when the legacy account is undeployed (%s)', async (error) => {
  const provider = { getClassHashAt: jest.fn().mockRejectedValue(error) };
  const details = await createPrivyReadyAccount({ provider, wallet, signRawHash: jest.fn() });
  expect(details.address).toBe(getPrivyReadyAccountDetails(wallet).address);
  expect(details.deploymentData.class_hash).toBe(READY_V040_ACCOUNT_CLASS_HASH);
});

test('does not switch addresses when the deployment lookup fails', async () => {
  const error = new Error('RPC unavailable');
  const provider = { getClassHashAt: jest.fn().mockRejectedValue(error) };
  await expect(createPrivyReadyAccount({ provider, wallet, signRawHash: jest.fn() })).rejects.toBe(error);
});
