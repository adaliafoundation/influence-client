import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Address, Entity, Lot, Prospecting } from '@influenceth/sdk';
import { useInfiniteQuery } from '@tanstack/react-query';
import { appConfig } from '~/appConfig';
import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useSession from '~/hooks/useSession';
import useCrewContext from '~/hooks/useCrewContext';
import api from '~/lib/api';
import { campaignIdentity } from './campaignIdentity';
import { campaignRecord } from './campaignRecord';
import { createChainCampaign } from './chainCampaign';
import { useProspecting, prospectingOnchain } from './store';

export default function useChainCampaign(recheck) {
  const p = useProspecting();
  const { provider, accountAddress, chainId } = useSession(false);
  const { crew } = useCrewContext();
  const { execute, getStatus } = useContext(ChainTransactionContext);
  const enabled = prospectingOnchain();
  const [known, setKnown] = useState(null);
  const [state, setState] = useState({ campaign: null, occupying: null, error: '', loading: false });
  const running = useRef(false);
  const scope = `${chainId}:${accountAddress}:${crew?.id}:${p.asteroidId}:${p.originIndex}:${p.resource}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const game = useMemo(() => provider && Prospecting.Game.createClient({
    dispatcher: appConfig.get('Starknet.Address.dispatcher'), provider
  }), [provider]);
  const knownId = known?.scope === scope ? known.id : null;
  const historyQuery = useInfiniteQuery({
    queryKey: ['prospectingHistory', chainId, appConfig.get('Api.influence'), accountAddress, p.asteroidId, p.originIndex],
    queryFn: ({ pageParam = 1 }) => api.getProspectingCampaigns({ owner: accountAddress,
      originId: Lot.toId(p.asteroidId, p.originIndex), page: pageParam }),
    getNextPageParam: last => last.hasMore ? last.page + 1 : undefined,
    enabled: !!(enabled && p.active && accountAddress && p.originIndex)
  });
  const history = historyQuery.data?.pages.flatMap(page => page.campaigns)
    .filter(campaign => campaign.resource === p.resource && Number(campaign.crew?.id) === Number(crew?.id)) || [];
  const refresh = useCallback(async () => {
    if (!enabled || !game || !p.active || !p.originIndex) return;
    setState(s => ({ ...s, loading: true }));
    try {
      const origin = { label: Entity.IDS.LOT, id: Lot.toId(p.asteroidId, p.originIndex) };
      const id = await game.origin(origin);
      const occupying = id === '0' ? null : await game.campaign(id);
      const candidate = knownId && (id === '0' || known?.pinned) ? await game.campaign(knownId) : occupying;
      const matches = candidate && candidate.resource === p.resource && Number(candidate.crew.id) === Number(crew?.id)
        && Address.areEqual(candidate.owner, accountAddress);
      if (currentScope.current !== scope) return;
      if (matches && candidate.id !== knownId) setKnown({ scope, id: candidate.id });
      setState({ scope, campaign: matches ? candidate : null, occupying, loading: false, error: '' });
    } catch (error) { if (currentScope.current === scope) setState(s => ({ ...s, loading: false, error: error.message })); }
  }, [enabled, game, p.active, p.asteroidId, p.originIndex, p.resource, crew?.id, accountAddress, knownId, known?.pinned, scope]);
  const latestHistoryId = history[0]?.campaignId;
  useEffect(() => {
    if (state.scope === scope && !state.loading && !state.error && !state.occupying && !knownId && !known?.awaitingStart && latestHistoryId) {
      setKnown({ scope, id: latestHistoryId, pinned: true });
    }
  }, [state.scope, state.loading, state.error, state.occupying, scope, knownId, known?.awaitingStart, latestHistoryId]);
  useEffect(() => {
    if (!enabled || !p.active) return undefined;
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, [enabled, p.active, refresh]);
  const visibleState = state.scope === scope ? state : { campaign: null, occupying: null, error: '', loading: enabled && p.active };
  const c = visibleState.campaign;
  const campaignId = c?.id, owner = c?.owner, context = c?.context, qualityBps = c?.qualityBps;
  const identity = useMemo(() => owner && campaignIdentity({ chainId, dispatcher: game.dispatcher, owner,
    asteroidId: p.asteroidId, originIndex: p.originIndex, resource: p.resource }),
  [owner, chainId, game, p.asteroidId, p.originIndex, p.resource]);
  const initialRecord = useMemo(() => campaignId && identity && Prospecting.createRecord({ identity,
    mode: 'chain', campaignId, context, qualityBps }), [campaignId, context, qualityBps, identity]);
  const validateNewRecord = useCallback(async () => {
    const current = await game.campaign(campaignId);
    if (current.sampleCount) throw new Error('Private sample data is missing. Reconnect its backup before continuing.');
  }, [game, campaignId]);
  const controller = useMemo(() => {
    if (!enabled || !game || !p.storage || p.mode !== 'chain' || !crew?.id || p.campaignId !== campaignId) return null;
    const storage = p.storage;
    return createChainCampaign({ game, provider, crew: { label: Entity.IDS.CREW, id: crew.id }, execute, recheck,
      read: () => {
        if (useProspecting.getState().storage !== storage) throw new Error('Private data was locked.');
        return campaignRecord(useProspecting.getState());
      }, save: record => useProspecting.getState().applyChainRecord(record, storage) });
  }, [enabled, game, provider, p.storage, p.mode, p.campaignId, campaignId, crew?.id, execute, recheck]);
  const run = useCallback(async fn => {
    if (running.current) return;
    running.current = true;
    useProspecting.setState({ busy: true });
    try { return await fn(); }
    catch (error) { useProspecting.setState({ message: error.message }); }
    finally { running.current = false; useProspecting.setState({ busy: false }); refresh(); }
  }, [refresh]);
  useEffect(() => {
    if (!controller || p.storageStatus !== 'ready') return undefined;
    run(() => controller.synchronize(true));
    const timer = setInterval(() => {
      if (useProspecting.getState().pending || useProspecting.getState().chainOperation) run(() => controller.synchronize());
    }, 15000);
    return () => clearInterval(timer);
  }, [controller, p.storageStatus, run]);
  const start = () => run(async () => {
    const origin = { label: Entity.IDS.LOT, id: Lot.toId(p.asteroidId, p.originIndex) };
    if (getStatus('ProspectingStart', { origin }) === 'pending') return;
    const submission = await execute('ProspectingStart', { origin, resource: p.resource, caller_crew: { label: Entity.IDS.CREW, id: crew.id } });
    if (submission?.status === 'submitted') setKnown({ scope, id: knownId, pinned: false, awaitingStart: true });
    const id = await game.origin(origin);
    if (id !== '0') setKnown({ scope, id });
  });
  return { enabled, ...visibleState, initialRecord, validateNewRecord, start,
    history, historyError: historyQuery.error?.message || '', moreHistory: historyQuery.hasNextPage,
    loadHistory: historyQuery.fetchNextPage, viewCampaign: id => setKnown({ scope, id, pinned: true }),
    starting: enabled && p.originIndex && getStatus('ProspectingStart', {
      origin: { label: Entity.IDS.LOT, id: Lot.toId(p.asteroidId, p.originIndex) } }) === 'pending',
    sample: (method, supply) => run(() => controller.sample({ method,
      target: method === 0 ? p.history.length : p.cells.findIndex(cell => cell[0] && cell[1] === p.selected.lot && cell[2] === p.depth),
      source: p.source ?? 0, depth: p.depth },
    { label: Entity.IDS.LOT, id: Lot.toId(p.asteroidId, p.selected.lot) }, supply)),
    retry: () => run(() => controller.submitSavedSample()), finalize: proof => run(() => controller.finalize(proof)),
    abandon: () => run(() => controller.abandon()) };
}
