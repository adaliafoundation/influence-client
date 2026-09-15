import { hash, typedData } from 'starknet';

export const LOGIN_TYPED_DATA_REVISIONS = {
  LEGACY: '0',
  REVISION_1: '1'
};

export const DEFAULT_LOGIN_TYPED_DATA_REVISION = LOGIN_TYPED_DATA_REVISIONS.REVISION_1;

const LOGIN_PRIMARY_TYPE = 'Message';

const loginMessageFields = [
  { name: 'message', type: 'string' },
  { name: 'nonce', type: 'string' }
];

const legacyDomainFields = [
  { name: 'name', type: 'felt' },
  { name: 'version', type: 'felt' },
  { name: 'chainId', type: 'felt' }
];

const revisionOneDomainFields = [
  { name: 'name', type: 'shortstring' },
  { name: 'version', type: 'shortstring' },
  { name: 'chainId', type: 'shortstring' },
  { name: 'revision', type: 'shortstring' }
];

const getPrimaryType = (challenge) => challenge?.primaryType || LOGIN_PRIMARY_TYPE;

const getMessageFields = (challenge) => {
  const primaryType = getPrimaryType(challenge);
  return challenge?.types?.[primaryType] || loginMessageFields;
};

const assertChallengeShape = (challenge) => {
  if (!challenge?.domain?.chainId) throw new Error('Login challenge is missing a chain ID.');
  if (!challenge?.message?.nonce) throw new Error('Login challenge is missing a nonce.');
};

export const buildLegacyLoginTypedData = (challenge) => {
  assertChallengeShape(challenge);

  const primaryType = getPrimaryType(challenge);

  return {
    domain: {
      name: challenge.domain.name || 'Influence',
      version: challenge.domain.version || '1.1.0',
      chainId: challenge.domain.chainId
    },
    message: { ...challenge.message },
    primaryType,
    types: {
      [primaryType]: getMessageFields(challenge),
      StarkNetDomain: legacyDomainFields
    }
  };
};

export const buildRevisionOneLoginTypedData = (challenge) => {
  assertChallengeShape(challenge);

  const primaryType = getPrimaryType(challenge);

  return {
    domain: {
      name: challenge.domain.name || 'Influence',
      version: challenge.domain.version || '1.1.0',
      chainId: challenge.domain.chainId,
      revision: LOGIN_TYPED_DATA_REVISIONS.REVISION_1
    },
    message: { ...challenge.message },
    primaryType,
    types: {
      [primaryType]: getMessageFields(challenge),
      StarknetDomain: revisionOneDomainFields
    }
  };
};

export const getLoginTypedData = (
  challenge,
  revision = DEFAULT_LOGIN_TYPED_DATA_REVISION
) => {
  if (revision === LOGIN_TYPED_DATA_REVISIONS.LEGACY) {
    return buildLegacyLoginTypedData(challenge);
  }

  return buildRevisionOneLoginTypedData(challenge);
};

export const getLoginTypedDataRevision = (typedData) => (
  typedData?.domain?.revision || LOGIN_TYPED_DATA_REVISIONS.LEGACY
);

const getDomainType = (loginTypedData) => (
  getLoginTypedDataRevision(loginTypedData) === LOGIN_TYPED_DATA_REVISIONS.REVISION_1
    ? 'StarknetDomain'
    : 'StarkNetDomain'
);

export const getLoginSessionVerificationHashes = (loginTypedData) => {
  const revision = getLoginTypedDataRevision(loginTypedData);
  const domainHash = typedData.getStructHash(
    loginTypedData.types,
    getDomainType(loginTypedData),
    loginTypedData.domain,
    revision
  );
  const primaryTypeHash = typedData.getTypeHash(
    loginTypedData.types,
    loginTypedData.primaryType,
    revision
  );

  return {
    domainHash,
    primaryTypeHash,
    scopeHash: hash.computePoseidonHash(domainHash, primaryTypeHash),
    typedDataHash: typedData.getStructHash(
      loginTypedData.types,
      loginTypedData.primaryType,
      loginTypedData.message,
      revision
    )
  };
};

export const getLoginVerificationParams = ({ signature, referredBy, typedData, walletId }) => ({
  signature: Array.isArray(signature) ? signature.join(',') : signature,
  referredBy,
  typedDataRevision: getLoginTypedDataRevision(typedData),
  walletId
});
