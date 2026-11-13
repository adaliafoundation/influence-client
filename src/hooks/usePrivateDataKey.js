import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Address } from '@influenceth/sdk';
import useSession from './useSession';
import useUser from './useUser';
import useStore from './useStore';
import api from '../lib/api';
import { resolveChainId } from '../lib/utils';
import { assertInboxKey, recoverInboxKey } from '../lib/inboxKeys';

// One account/chain-scoped memory key for inbox and private campaign data.
// The legacy signing message is unchanged so existing keys remain recoverable.
export default function usePrivateDataKey() {
  const { accountAddress, chainId, walletAccount, refreshWalletConnection } = useSession(false);
  const { data: user } = useUser();
  const cached = useStore((s) => s.privateDataKey);
  const dispatchKey = useStore((s) => s.dispatchPrivateDataKey);
  const owner = accountAddress ? Address.toStandard(accountAddress) : null;
  const chain = chainId ? resolveChainId(chainId, 'hex') : null;
  const current = useRef();
  current.current = { owner, chain, publicKey: user?.publicKey };
  const pending = useRef(null);
  const mounted = useRef(true);
  const [requestVersion, setRequestVersion] = useState(0);
  const [phase, setPhase] = useState('locked');
  const [error, setError] = useState('');
  const privateKey = useMemo(() => {
    if (cached?.owner !== owner || cached?.chainId !== chain || !user?.publicKey) return null;
    try {
      assertInboxKey(cached.privateKey, user.publicKey);
      return cached.privateKey;
    } catch { return null; }
  }, [cached, owner, chain, user?.publicKey]);

  const fail = useCallback((request, cause) => {
    if (pending.current !== request) return;
    pending.current = null;
    if (mounted.current) { setPhase('locked'); setError(cause.message); }
    request.reject(cause);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (pending.current) fail(pending.current, new Error('Private-data unlock cancelled.'));
    };
  }, [fail]);

  const remember = useCallback((key) => {
    if (!mounted.current || current.current.owner !== owner || current.current.chain !== chain) return;
    dispatchKey(key ? { privateKey: key, owner, chainId: chain } : null);
  }, [dispatchKey, owner, chain]);

  const requestKey = useCallback((seed, verifyPublished) => {
    if (pending.current) return pending.current.promise;
    let resolve, reject;
    const promise = new Promise((accept, decline) => { resolve = accept; reject = decline; });
    const request = { owner, publicKey: user?.publicKey, seed, verifyPublished, resolve, reject, promise, processing: false };
    pending.current = request;
    setError('');
    if (!owner) fail(request, new Error('Sign in to your Starknet account before unlocking private data.'));
    else if (verifyPublished && !user?.publicKey) fail(request, new Error('Set up private data encryption first.'));
    else {
      setPhase(walletAccount && chain ? 'loading' : 'connecting');
      setRequestVersion((version) => version + 1);
      if (!walletAccount || !chain) {
        if (!refreshWalletConnection) fail(request, new Error('Reconnect your wallet before unlocking private data.'));
        else Promise.resolve(refreshWalletConnection()).then((restored) => {
          if (!restored) fail(request, new Error('Could not reconnect your wallet. Open your wallet and retry Unlock Private Data.'));
        }).catch((cause) => fail(request, cause));
      }
    }
    return promise;
  }, [owner, chain, user?.publicKey, walletAccount, refreshWalletConnection, fail]);

  // Continue only once React has received the restored account and chain.
  useEffect(() => {
    const request = pending.current;
    if (!request || request.processing) return;
    if (owner !== request.owner || user?.publicKey !== request.publicKey) {
      fail(request, new Error('Account changed while unlocking private data.'));
      return;
    }
    if (!walletAccount || !chain) return;
    request.processing = true;
    const recover = async () => {
      setPhase('loading');
      const seed = request.seed || await api.getInboxSeed();
      if (!seed) throw new Error('Private data recovery seed is unavailable.');
      if (pending.current !== request) return;
      setPhase('signing');
      const key = await recoverInboxKey(walletAccount, chainId, seed);
      if (!key) throw new Error('Wallet did not sign the recovery message.');
      if (request.verifyPublished) assertInboxKey(key, request.publicKey);
      const live = current.current;
      if (!mounted.current || live.owner !== owner || live.chain !== chain ||
          live.publicKey !== request.publicKey) throw new Error('Account changed while unlocking private data.');
      if (pending.current !== request) return;
      if (request.verifyPublished) remember(key);
      pending.current = null;
      setPhase('unlocked');
      request.resolve(key);
    };
    recover().catch((cause) => fail(request, cause));
  }, [requestVersion, owner, chain, chainId, user?.publicKey, walletAccount, remember, fail]);
  const unlock = useCallback(() => requestKey(null, true), [requestKey]);
  const deriveKey = useCallback((seed) => requestKey(seed, false), [requestKey]);
  return { privateKey, deriveKey, publicKey: user?.publicKey, unlock, remember, unlocking: ['connecting', 'loading', 'signing'].includes(phase), phase, error };
}
