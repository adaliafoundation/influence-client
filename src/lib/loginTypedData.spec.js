const { TextDecoder, TextEncoder } = require('util');

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

const { typedData } = require('starknet');
const {
  LOGIN_TYPED_DATA_REVISIONS,
  buildLegacyLoginTypedData,
  buildRevisionOneLoginTypedData,
  getLoginTypedData,
  getLoginSessionVerificationHashes,
  getLoginVerificationParams
} = require('./loginTypedData');

const serverChallenge = {
  domain: {
    name: 'Influence',
    version: '1.1.0',
    chainId: '0x534e5f5345504f4c4941'
  },
  message: {
    message: 'Login to Influence',
    nonce: 'nonce-123'
  },
  primaryType: 'Message',
  types: {
    Message: [
      { name: 'message', type: 'string' },
      { name: 'nonce', type: 'string' }
    ],
    StarkNetDomain: [
      { name: 'name', type: 'felt' },
      { name: 'version', type: 'felt' },
      { name: 'chainId', type: 'felt' }
    ]
  }
};

const accountAddress = '0x06449704e47cff3ce3f9b7070f409c665a6d1fc12434bae54847a747c44a0f40';

test('builds the legacy login typed data from the server challenge', () => {
  expect(buildLegacyLoginTypedData(serverChallenge)).toEqual(serverChallenge);
});

test('builds revision 1 login typed data from the server challenge', () => {
  expect(buildRevisionOneLoginTypedData(serverChallenge)).toEqual({
    ...serverChallenge,
    domain: {
      ...serverChallenge.domain,
      revision: LOGIN_TYPED_DATA_REVISIONS.REVISION_1
    },
    types: {
      Message: serverChallenge.types.Message,
      StarknetDomain: [
        { name: 'name', type: 'shortstring' },
        { name: 'version', type: 'shortstring' },
        { name: 'chainId', type: 'shortstring' },
        { name: 'revision', type: 'shortstring' }
      ]
    }
  });
});

test('uses revision 1 login typed data by default', () => {
  expect(getLoginTypedData(serverChallenge).domain.revision).toBe(LOGIN_TYPED_DATA_REVISIONS.REVISION_1);
});

test('can still build the legacy login typed data explicitly', () => {
  expect(getLoginTypedData(serverChallenge, LOGIN_TYPED_DATA_REVISIONS.LEGACY)).toEqual(serverChallenge);
});

test('builds revision 1 login typed data that starknet v8 can hash', () => {
  const hash = typedData.getMessageHash(
    buildRevisionOneLoginTypedData(serverChallenge),
    accountAddress
  );

  expect(hash).toMatch(/^0x[0-9a-f]+$/);
});

test('builds Cartridge session verification hashes from revision 1 login typed data', () => {
  expect(getLoginSessionVerificationHashes(buildRevisionOneLoginTypedData({
    ...serverChallenge,
    message: {
      message: 'Login to Influence',
      nonce: '4cbpMsEu2caDnn3Kj1Fq9f'
    }
  }))).toEqual({
    domainHash: '0x762761a11394e21c82a042b880d6782ed069f4332b6fabc1609bdaf7492a56d',
    primaryTypeHash: '0xc8fdbb8e1d402108fdcb4456583050b75660c5b8494ef76887bd6cce3164ff',
    scopeHash: '0x4d372c9492b409c9e2be49ecdf7175b847ca7b68c951576d0cf4d2af900ca41',
    typedDataHash: '0x76021cc9ae2be1f0362c30ca1696d1b77cb4f1d01c6ceac965f7d6ea0f4c6e9'
  });
});

test('builds login verification params without sending the typed data payload', () => {
  expect(getLoginVerificationParams({
    signature: ['0x1', '0x2'],
    referredBy: '0xabc',
    typedData: buildRevisionOneLoginTypedData(serverChallenge),
    walletId: 'controller'
  })).toEqual({
    signature: '0x1,0x2',
    referredBy: '0xabc',
    typedDataRevision: LOGIN_TYPED_DATA_REVISIONS.REVISION_1,
    walletId: 'controller'
  });
});
