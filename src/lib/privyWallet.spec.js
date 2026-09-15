const { TextDecoder, TextEncoder } = require('util');

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

const { num, typedData } = require('starknet');
const { buildRevisionOneLoginTypedData } = require('./loginTypedData');
const {
  PrivyStarknetSigner,
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

test('derives the Ready v0.5 account and AVNU deployment data', () => {
  const details = getPrivyReadyAccountDetails(wallet);

  expect(READY_V050_ACCOUNT_CLASS_HASH).toBe(
    '0x073414441639dcd11d1846f287650a00c60c416b9d3ba45d31c651672125b2c2'
  );
  expect(details.address).toBe('0xd18c60431c8eda775605cafc445959c09733f2448d221f9ce64fd8cec40975');
  expect(details.deploymentData).toEqual({
    address: details.address,
    calldata: ['0x0', '0x123', '0x1'],
    class_hash: READY_V050_ACCOUNT_CLASS_HASH,
    salt: '0x123',
    version: 1
  });
});

test('keeps the authenticated paymaster instance on the Privy account', () => {
  const paymaster = { buildTransaction: jest.fn(), executeTransaction: jest.fn() };
  const accountDetails = createPrivyReadyAccount({
    paymaster,
    provider: {},
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
