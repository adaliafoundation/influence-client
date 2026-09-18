import { ec, hash, shortString } from 'starknet';
import { buildSessionAccount, bytesToHexString, createSession, createSessionRequest, signOutsideExecution } from '@argent/x-sessions';

import { WALLET_IDS } from './walletIds';
import { allowedMethods, areSessionCallsAllowed, buildGameplaySessionPolicies } from './walletPolicies';

const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60;
const SESSION_NETWORKS = {
  '0x534e5f4d41494e': 'mainnet',
  '0x534e5f5345504f4c4941': 'sepolia'
};

// x-sessions builds policy proofs from entrypoint names, including for SNIP-9 calls.
const normalizeSessionCalls = (calls) => calls.map((call) => ({
  ...call,
  entrypoint: allowedMethods.find((method) => hash.getSelectorFromName(method.selector) === call.entrypoint)?.selector || call.entrypoint
}));

export const isReadySessionValid = (session, accountAddress, chainId, now = Date.now()) => {
  if (!session?.sessionKey?.privateKey || !session.authorisationSignature?.length) return false;
  try {
    return BigInt(session.address) === BigInt(accountAddress)
      && BigInt(session.chainId) === BigInt(chainId)
      && Number(session.expiresAt) > Math.floor(now / 1000)
      && session.allowedMethods?.length === allowedMethods.length
      && allowedMethods.every((method) => session.allowedMethods.some((saved) => (
        BigInt(saved['Contract Address']) === BigInt(method['Contract Address']) && saved.selector === method.selector
      )));
  } catch {
    return false;
  }
};

export const supportsReadySessions = async (provider, address) => {
  try {
    const [version, guardian] = await Promise.all([
      provider.callContract({ contractAddress: address, entrypoint: 'getVersion' }),
      provider.callContract({ contractAddress: address, entrypoint: 'get_guardian' })
    ]);
    const [major, minor] = shortString.decodeShortString(version[0]).split('.').map(Number);
    return (major > 0 || minor >= 5) && BigInt(guardian[0]) !== 0n;
  } catch (error) {
    // Undeployed, legacy and non-Ready accounts cannot authorize these sessions.
    if (/Contract not found|ENTRYPOINT_NOT_FOUND|Entry point.*not found/i.test(error.message)) return false;
    throw error;
  }
};

const sessionExpiredError = () => {
  const error = new Error('Wallet session expired.');
  error.userMessage = 'Your wallet session expired. Please try again to approve a new session.';
  return error;
};

class ReadyWalletSession {
  constructor({ wallet, account, provider, chainId, storedSession, serviceUrl, strkToken, onChange, isEnabled, isActive }) {
    Object.assign(this, { wallet, account, provider, chainId, serviceUrl, strkToken, onChange, isEnabled, isActive });
    this.session = isReadySessionValid(storedSession, account.address, chainId) ? storedSession : null;
  }

  get ready() {
    return !!this.serviceUrl && !!SESSION_NETWORKS[this.chainId]
      && isReadySessionValid(this.session, this.account.address, this.chainId);
  }

  async supported() {
    if (!this.serviceUrl || !SESSION_NETWORKS[this.chainId]) return false;
    if (!this.supportsSessions) {
      this.supportsSessions = await supportsReadySessions(this.provider, this.account.address);
    }
    return this.supportsSessions;
  }

  async prepare() {
    if (!this.isEnabled()) return false;
    if (this.ready) return true;
    if (!await this.supported()) return false;
    if (!this.isEnabled()) return false;
    if (!this.preparing) {
      this.preparing = this.authorize().finally(() => { this.preparing = null; });
    }
    return this.preparing;
  }

  async authorize() {
    const privateKey = bytesToHexString(ec.starkCurve.utils.randomPrivateKey());
    const sessionKey = { privateKey, publicKey: ec.starkCurve.getStarkKey(privateKey) };
    const sessionRequest = createSessionRequest({
      chainId: this.chainId,
      sessionParams: {
        sessionKey,
        allowedMethods,
        expiry: BigInt(Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS),
        metaData: {
          projectID: 'influence',
          txFees: [{ tokenAddress: this.strkToken, maxAmount: '1000000000000000000' }]
        }
      }
    });
    const authorisationSignature = await this.wallet.request({
      type: 'wallet_signTypedData', params: sessionRequest.sessionTypedData
    });
    if (!this.isEnabled()) return false;
    this.session = await createSession({
      sessionRequest, authorisationSignature, address: this.account.address, chainId: this.chainId
    });
    this.sessionAccount = null;
    this.onChange(this.session);
    return true;
  }

  async getAccount(calls, { requireExplicitSignature } = {}) {
    if (!this.isEnabled() || requireExplicitSignature || !areSessionCallsAllowed(calls)) return this.account;
    if (!await this.prepare()) return this.account;
    if (!this.isEnabled()) return this.account;
    if (!this.sessionAccount) {
      const session = this.session;
      const account = await buildSessionAccount({
        session, sessionKey: session.sessionKey, provider: this.provider,
        argentSessionServiceBaseUrl: this.serviceUrl
      });
      account.paymaster = this.account.paymaster;
      const signTransaction = account.signer.signTransaction.bind(account.signer);
      const assertAuthorized = () => {
        if (!this.isActive()) throw new Error('Account is disconnected');
        if (!this.ready || this.session !== session) throw sessionExpiredError();
        if (!this.isEnabled()) throw new Error('Wallet session is not authorized for this transaction.');
      };
      account.signer.signTransaction = async (transactions, details) => {
        assertAuthorized();
        if (!areSessionCallsAllowed(transactions)) throw new Error('Transaction is outside the wallet session policy.');
        const signature = await signTransaction(normalizeSessionCalls(transactions), details);
        assertAuthorized();
        return signature;
      };
      account.signMessage = async (typedData) => {
        if (!this.isActive()) throw new Error('Account is disconnected');
        const calls = typedData.primaryType === 'OutsideExecution'
          ? normalizeSessionCalls(typedData.message.Calls.map((call) => ({
            contractAddress: call.To, entrypoint: call.Selector, calldata: call.Calldata
          }))) : [];
        // Paid paymasters may append a token transfer outside the gameplay policy.
        // Those transactions require the wallet's normal confirmation.
        if (!this.isEnabled() || !areSessionCallsAllowed(calls)) return this.account.signMessage(typedData);
        assertAuthorized();
        const signature = await signOutsideExecution({
          session, sessionKey: session.sessionKey, calls, outsideExecutionTypedData: typedData,
          argentSessionServiceUrl: this.serviceUrl,
          network: SESSION_NETWORKS[this.chainId]
        });
        assertAuthorized();
        return signature;
      };
      for (const method of ['execute', 'executePaymasterTransaction']) {
        const execute = account[method].bind(account);
        account[method] = async (...args) => {
          if (!this.isActive()) throw new Error('Account is disconnected');
          try {
            return await execute(...args);
          } catch (error) {
            if (this.session === session && /session\/(revoked|expired)/i.test(error.message)) {
              this.session = null;
              this.sessionAccount = null;
              this.onChange(null);
            }
            throw error;
          }
        };
      }
      this.sessionAccount = account;
    }
    return this.sessionAccount;
  }
}

class CartridgeWalletSession {
  constructor({ wallet, account, isEnabled, isActive, approvedOnConnect }) {
    Object.assign(this, { wallet, account, isEnabled, isActive });
    this.ready = approvedOnConnect;
  }

  async supported() { return true; }

  async prepare() {
    if (!this.isEnabled()) return false;
    if (!this.ready) this.ready = !!await this.wallet.updateSession({ policies: buildGameplaySessionPolicies() });
    if (!this.ready) throw new Error('Gameplay session approval was not completed.');
    return true;
  }

  async getAccount(calls, options = {}) {
    if (this.isEnabled() && !options.requireExplicitSignature && areSessionCallsAllowed(calls)) {
      await this.prepare();
    }
    const account = Object.create(this.account);
    account.execute = async (transactions, details) => {
      if (!this.isActive()) throw new Error('Account is disconnected');
      if (this.isEnabled() && !options.requireExplicitSignature && areSessionCallsAllowed(transactions)) {
        return this.account.execute(transactions, details);
      }
      const result = await this.wallet.openExecute(transactions);
      if (!result?.status || !result.transactionHash) throw new Error('User rejected transaction');
      return { transaction_hash: result.transactionHash };
    };
    return account;
  }
}

export const createWalletSession = ({ walletId, ...options }) => {
  if (walletId === WALLET_IDS.ARGENT_X) return new ReadyWalletSession(options);
  if (walletId === WALLET_IDS.CONTROLLER) return new CartridgeWalletSession(options);
  return null;
};
