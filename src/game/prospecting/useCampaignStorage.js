import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Address } from '@influenceth/sdk';
import useSession from '~/hooks/useSession';
import { appConfig } from '~/appConfig';
import useUser from '~/hooks/useUser';
import { campaignIdentity } from './campaignIdentity';
import usePrivateDataKey from '~/hooks/usePrivateDataKey';
import { assertInboxKey } from '~/lib/inboxKeys';
import { useProspecting } from './store';
import { createCampaignRepository } from './campaignRepository';
import { scopeKey } from './campaignRecord';

const peerAddresses = () => appConfig.get('App.privateDataPeers').split(',').map((address) => address.trim()).filter(Boolean);

export default function useCampaignStorage({ mode = 'local-simulation', campaignId, initialRecord, validateNewRecord } = {}) {
  const { accountAddress, chainId } = useSession(false);
  const { data: user } = useUser();
  const { privateKey, unlock } = usePrivateDataKey();
  const active = useProspecting((s) => s.active);
  const asteroidId = useProspecting((s) => s.asteroidId);
  const originIndex = useProspecting((s) => s.originIndex);
  const resource = useProspecting((s) => s.resource);
  const attach = useProspecting((s) => s.attachStorage);
  const detach = useProspecting((s) => s.detachStorage);
  const [error, setError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [backup, setBackup] = useState({ phase: 'unconfigured', error: '' });
  const identity = useMemo(() => campaignIdentity({
    chainId, dispatcher: appConfig.get('Starknet.Address.dispatcher'), owner: accountAddress,
    asteroidId, originIndex, resource
  }), [accountAddress, chainId, asteroidId, originIndex, resource]);

  const connect = useCallback(async () => {
    setError('');
    setUnlocking(true);
    try {
      if (!accountAddress || !user?.publicKey) throw new Error('Set up private data encryption before saving a campaign.');
      if (!privateKey) await unlock();
      else setAttempt((value) => value + 1);
    } catch (e) { setError(e.message); }
    finally { setUnlocking(false); }
  }, [accountAddress, user?.publicKey, privateKey, unlock]);

  useEffect(() => {
    if (!active || !privateKey || !identity || !user?.publicKey) return undefined;
    if (mode === 'chain' && (!campaignId || !initialRecord)) return undefined;
    try { assertInboxKey(privateKey, user.publicKey); }
    catch (e) { setError(e.message); return undefined; }
    const repository = createCampaignRepository(identity, user.publicKey, privateKey, mode === 'chain' ? campaignId : undefined);
    const localLoad = repository.load;
    const peers = peerAddresses();
    let cancelled = false, transport, flushing = false, observedRevision = -1;
    const updateBackup = (phase, detail = '') => { if (!cancelled) setBackup({ phase, error: detail }); };
    async function flush() {
      const current = useProspecting.getState();
      if (cancelled || !transport || flushing || current.storage?.repository !== repository || current.storageStatus !== 'ready') return;
      flushing = true;
      let more = false;
      try {
        updateBackup('pending');
        await repository.replicate(transport);
        more = !!await repository.pendingEnvelope();
        updateBackup(more ? 'pending' : 'synced');
      } catch (e) { updateBackup('pending', e.message); }
      finally { flushing = false; }
      if (more) queueMicrotask(flush);
    }
    repository.load = async () => {
      let remote;
      if (peers.length) {
        updateBackup('connecting');
        try {
          const { createPrivateDataTransport } = await import('~/lib/privateData/transport.mjs');
          transport = await createPrivateDataTransport({ privateKey, peers });
          if (cancelled) { await transport.stop(); return null; }
          remote = await transport.get(scopeKey(identity, mode === 'chain' ? campaignId : undefined), user.publicKey);
        } catch (e) {
          if (e.code === 'PRIVATE_DATA_INVALID_RECORD') throw e;
          updateBackup('pending', e.message);
        }
        // Network availability never gates a local save. Invalid/conflicting recovered
        // data does: it must not silently replace an unsynced device transcript.
        if (remote && !cancelled) await repository.restore(remote);
      } else updateBackup('unconfigured');
      const saved = await localLoad();
      if (!saved && mode === 'chain') await validateNewRecord();
      return saved;
    };
    const unsubscribe = useProspecting.subscribe((state) => {
      if (state.storage?.repository === repository && state.storageStatus === 'ready' &&
          state.storage.revision !== observedRevision) {
        observedRevision = state.storage.revision;
        flush();
      }
    });
    const timer = setInterval(flush, 15000);
    window.addEventListener('online', flush);
    attach(repository, identity, initialRecord);
    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(timer);
      window.removeEventListener('online', flush);
      transport?.stop().catch(() => {});
      if (useProspecting.getState().storage?.repository === repository) useProspecting.getState().lockStorage();
    };
  }, [active, privateKey, identity, user?.publicKey, attach, attempt, mode, campaignId, initialRecord, validateNewRecord]);

  const owner = accountAddress ? Address.toStandard(accountAddress) : null;
  useEffect(() => () => detach(), [owner, detach]);
  const previousChain = useRef(null);
  useEffect(() => {
    if (previousChain.current && identity?.chainId && previousChain.current !== identity.chainId) detach();
    if (identity?.chainId) previousChain.current = identity.chainId;
  }, [identity?.chainId, detach]);
  const backupLabel = ({
    unconfigured: 'Encrypted local save · backup peers not configured',
    connecting: 'Encrypted local save · checking remote backup',
    pending: 'Encrypted local save · remote backup pending',
    synced: 'Encrypted local save · backed up to configured peers'
  })[backup.phase];
  return { connect, error, unlocking, backupLabel, backupError: backup.error,
    unlocked: !!privateKey,
    canRecover: !!(accountAddress && user?.hasSeed && user?.publicKey) };
}
