import {
  Account,
  CairoCustomEnum,
  CairoOption,
  CairoOptionVariant,
  CallData,
  Signer,
  hash,
  num
} from 'starknet';

export const PRIVY_STARKNET_CHAIN_TYPE = 'starknet';
export const READY_V050_ACCOUNT_CLASS_HASH = '0x073414441639dcd11d1846f287650a00c60c416b9d3ba45d31c651672125b2c2';

const stripHexPrefix = (value) => value.startsWith('0x') ? value.slice(2) : value;

export const normalizePrivyStarknetWallet = (wallet) => {
  if (!wallet) return null;

  const chainType = wallet.chainType || wallet.chain_type;
  if (chainType !== PRIVY_STARKNET_CHAIN_TYPE) return null;

  const publicKey = wallet.publicKey || wallet.public_key;
  if (!wallet.address || !publicKey) {
    throw new Error('Privy did not return the Starknet wallet address and public key.');
  }

  return {
    address: wallet.address,
    chainType,
    id: wallet.id,
    publicKey: num.toHex(publicKey)
  };
};

export const findPrivyStarknetWallet = (user) => {
  const wallet = user?.linkedAccounts?.find((account) => (
    account.type === 'wallet'
      && account.chainType === PRIVY_STARKNET_CHAIN_TYPE
      && account.walletClientType?.startsWith('privy')
  ));

  return wallet ? normalizePrivyStarknetWallet(wallet) : null;
};

export const parsePrivyStarkSignature = (signature) => {
  const encoded = stripHexPrefix(signature || '');
  if (!/^[0-9a-fA-F]{128}$/.test(encoded)) {
    throw new Error('Privy returned an invalid Starknet signature.');
  }

  return [
    num.toHex(BigInt(`0x${encoded.slice(0, 64)}`)),
    num.toHex(BigInt(`0x${encoded.slice(64)}`))
  ];
};

export class PrivyStarknetSigner extends Signer {
  constructor({ publicKey, signRawHash }) {
    super('0x1');
    this.publicKey = num.toHex(publicKey);
    this.signRawHash = signRawHash;
  }

  async getPubKey() {
    return this.publicKey;
  }

  async signRaw(messageHash) {
    const response = await this.signRawHash(num.toHex(messageHash));
    return parsePrivyStarkSignature(response?.signature || response);
  }
}

export const getReadyV050ConstructorCalldata = (publicKey) => {
  const owner = new CairoCustomEnum({ Starknet: { pubkey: num.toHex(publicKey) } });
  const guardian = new CairoOption(CairoOptionVariant.None);

  return CallData.compile({ owner, guardian });
};

export const getPrivyReadyAccountDetails = (wallet) => {
  const normalizedWallet = normalizePrivyStarknetWallet(wallet);
  const constructorCalldata = getReadyV050ConstructorCalldata(normalizedWallet.publicKey);
  const salt = normalizedWallet.publicKey;
  const address = hash.calculateContractAddressFromHash(
    salt,
    READY_V050_ACCOUNT_CLASS_HASH,
    constructorCalldata,
    0
  );

  return {
    address,
    constructorCalldata,
    deploymentData: {
      address,
      calldata: constructorCalldata.map(num.toHex),
      class_hash: READY_V050_ACCOUNT_CLASS_HASH,
      salt,
      version: 1
    },
    wallet: normalizedWallet
  };
};

export const createPrivyReadyAccount = ({ provider, paymaster, signRawHash, wallet }) => {
  const details = getPrivyReadyAccountDetails(wallet);
  const signer = new PrivyStarknetSigner({
    publicKey: details.wallet.publicKey,
    signRawHash
  });
  const account = new Account({
    provider,
    address: details.address,
    signer,
    cairoVersion: '1',
    ...(paymaster ? { paymaster } : {})
  });
  if (paymaster) account.paymaster = paymaster;

  return { ...details, account };
};
