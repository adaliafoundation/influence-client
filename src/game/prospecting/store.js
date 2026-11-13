import create from 'zustand';
import { appConfig } from '~/appConfig';
import { Prospecting } from '@influenceth/sdk';
import { reachableSections, selectSection } from './reach';
import { campaignRecord, replayCampaign } from './campaignRecord';
import { DEPTHS, surfaceDistance } from './geometry';

export const prospectingEnabled = () => !!appConfig.get('App.enableDevTools') || prospectingOnchain();
export const prospectingOnchain = () => appConfig.get('App.prospectingMode') === 'chain';
const random = (bytes) =>
  BigInt(
    '0x' +
      Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
        b.toString(16).padStart(2, '0')
      ).join('')
  ).toString();
const initial = () => ({
  active: false,
  storage: null,
  storageStatus: 'locked',
  busy: false,
  pending: null,
  mode: 'local-simulation',
  campaignId: null,
  qualityBps: 10000,
  chainOperation: null,
  asteroidId: null,
  originIndex: null,
  resource: 1,
  depth: 0,
  selected: null,
  source: null,
  patch: null,
  layers: DEPTHS.map(() => []),
  cells: Array.from({ length: Prospecting.MAX_SAMPLES }, () => Array(15).fill(0)),
  history: [],
  context: null,
  message: '',
  finalized: null
});
const refreshReach = (state, changes) => {
  const next = { ...state, ...changes };
  const layers = reachableSections(next);
  const depth = layers[next.depth].length ? next.depth : Math.max(0, layers.findLastIndex((layer) => layer.length));
  return {
    ...changes,
    layers,
    ...selectSection(layers, depth, next.selected?.lot)
  };
};

export const useProspecting = create((set, get) => ({
  ...initial(),
  open: (asteroidId, originIndex, resource) => {
    if (!prospectingEnabled()) return;
    const current = get();
    if (
      current.originIndex === originIndex &&
      current.asteroidId === asteroidId &&
      current.resource === resource
    ) {
      set({ active: true });
      return;
    }
    set({
      ...initial(),
      active: true,
      asteroidId,
      originIndex,
      resource,
      selected: { lot: originIndex, depth: 0 },
      context: Prospecting.generateSalt()
    });
  },
  close: () => set({ active: false }),
  attachStorage: async (repository, identity, initialRecord) => {
    if (get().busy) return;
    const storage = { repository, identity, revision: 0 };
    set({ storage, busy: true, storageStatus: 'loading', message: '' });
    try {
      const saved = await repository.load();
      if (get().storage !== storage) return;
      const record = saved?.record || initialRecord;
      const restored = record ? { ...replayCampaign(record, identity), mode: record.mode,
        campaignId: record.campaignId || null, qualityBps: record.qualityBps || 10000,
        chainOperation: record.chainOperation || null } : {};
      storage.revision = saved?.revision || 0;
      const next = { ...get(), ...restored, storage };
      if (!saved || (saved.record.mode === 'local-simulation' && saved.record.pending)) {
        storage.revision = await repository.save(campaignRecord(next), storage.revision);
      }
      if (get().storage !== storage) return;
      set(refreshReach(get(), { ...restored, storage, busy: false, storageStatus: 'ready',
        message: saved ? 'Saved campaign recovered.' : 'Campaign saved locally.' }));
    } catch (error) {
      if (get().storage === storage) set({ busy: false, storageStatus: 'error', message: error.message });
    }
  },
  detachStorage: () => set(initial()),
  applyChainRecord: async (record, storage = get().storage) => {
    if (!storage || get().storage !== storage) throw new Error('Private campaign was locked.');
    storage.revision = await storage.repository.save(record, storage.revision);
    if (get().storage !== storage) throw new Error('Private campaign was locked.');
    set(refreshReach(get(), { ...replayCampaign(record, storage.identity), mode: 'chain',
      campaignId: record.campaignId, qualityBps: record.qualityBps || 10000,
      chainOperation: record.chainOperation || null }));
  },
  lockStorage: () => {
    const { active, asteroidId, originIndex, resource, patch } = get();
    const next = { ...initial(), active, asteroidId, originIndex, resource, patch,
      context: Prospecting.generateSalt(), selected: { lot: originIndex, depth: 0 } };
    set(refreshReach(next, next));
  },
  reset: async () => {
    const current = get();
    if (current.mode === 'chain') return;
    if (current.busy || current.storageStatus !== 'ready') return;
    const { asteroidId, originIndex, resource, patch, storage } = current;
    set({ busy: true });
    const next = { ...initial(), active: true, asteroidId, originIndex, resource, patch,
      storage, storageStatus: 'ready', context: Prospecting.generateSalt(), selected: { lot: originIndex, depth: 0 } };
    try {
      storage.revision = await storage.repository.save(campaignRecord(next), storage.revision);
      if (get().storage === storage) set(refreshReach(next, { ...next, busy: false }));
    } catch (error) {
      if (get().storage === storage) set({ busy: false, storageStatus: 'error', message: error.message });
    }
  },
  setPatch: (patch) => set((s) => refreshReach(s, { patch })),
  setDepth: (depth) =>
    set((s) => s.busy ? {} : selectSection(s.layers, depth, s.selected?.lot)),
  select: (lot, depth) =>
    set((s) => s.busy ? {} : selectSection(s.layers, depth, lot)),
  sample: async (method, abundance, recheck) => {
    const s = get(),
      i = s.history.length;
    if (s.mode === 'chain') return;
    if (s.busy || s.storageStatus !== 'ready' || s.finalized || i >= Prospecting.MAX_SAMPLES || !s.patch || !s.selected) return;
    const site = s.patch.sites.find((v) => v.index === s.selected.lot);
    if (!site) return;
    const target = s.cells.findIndex(
      (c) => c[0] && c[1] === site.index && c[2] === s.selected.depth
    );
    const section = s.layers[s.selected.depth].find((entry) => entry.lot === site.index);
    if (method === 0 && !section?.sources.includes(s.source)) return;
    const action = {
      method,
      target: method === 0 ? i : target,
      source: s.source ?? 0,
      depth: s.selected.depth,
      salt: Prospecting.generateSalt()
    };
    const meta = Prospecting.packMeta({
      lot: site.index,
      x: Math.round(500000 + site.x * 100),
      z: Math.round(500000 + site.z * 100),
      abundance: Math.round(abundance * 1e6)
    });
    let mask = 0n;
    s.history.forEach((h, j) => {
      const previous = s.patch.sites.find((v) => v.index === h.lot);
      if (surfaceDistance(previous.normal, site.normal, s.patch.radius) > Prospecting.MAX_STEP_DISTANCE_METRES)
        mask |= 1n << BigInt(j);
    });
    const storage = s.storage;
    set({ busy: true });
    try {
      const disabledReason = await recheck();
      if (get().storage !== storage) return;
      if (disabledReason) { set({ busy: false, message: disabledReason }); return; }
      // Persist the complete local simulation input before accepting the action.
      // Chain mode will persist a pending commitment before waiting for block entropy.
      const randomness = random(8);
      const pending = { action, meta, mask: mask.toString(), randomness };
      storage.revision = await storage.repository.save(campaignRecord({ ...s, pending }), storage.revision);
      if (get().storage !== storage) return;
      set({ pending });
      const record = Prospecting.appendSample(campaignRecord(s), pending);
      const replayed = Prospecting.replayCampaign(record);
      const result = replayed.history[i];
      const resolved = result.state[action.target];
      const success = method === 0
        ? resolved[3] ? `Grade ${resolved[3]} ore discovered. New routes are available.` : 'Barren section. Continue into a neighboring section.'
        : method === 1
          ? `Width measured: ${resolved[9] / 100}× ore quantity.`
          : `Hardness measured: ${90 + resolved[10]}% extraction rate.`;
      const messages = [
        success,
        'Drill stuck. The sample was spent; you can try again.',
        'Bore collapsed. This approach is now blocked.',
        'Localized cave-in. Recoverable quantity reduced.'
      ];
      const changes = {
        cells: result.state,
        history: [
          ...s.history,
          { ...result, action, meta, mask: mask.toString(), randomness }
        ],
        source: result.state[i][0] ? i : s.source,
        message: messages[result.event],
        pending: null,
        busy: false
      };
      storage.revision = await storage.repository.save(campaignRecord({ ...s, ...changes }), storage.revision);
      if (get().storage === storage) set(refreshReach(s, changes));
    } catch (error) {
      if (get().storage === storage) set({ busy: false, storageStatus: 'error', message: `Cannot sample: ${error.message}.` });
    }
  },
  finalize: async () => {
    const s = get(),
      cell = s.cells.find(
        (c) => c[0] && c[1] === s.selected?.lot && c[2] === s.selected?.depth
      );
    if (s.busy || s.storageStatus !== 'ready' || !cell?.[3] || s.finalized) return;
    const storage = s.storage;
    set({ busy: true });
    try {
      const record = Prospecting.finalizeRecord(campaignRecord(s), s.cells.indexOf(cell));
      const { finalized } = Prospecting.replayCampaign(record);
      const changes = { finalized, message: 'Local claim saved. Generate its proof when ready.' };
      storage.revision = await storage.repository.save(campaignRecord({ ...s, ...changes }), storage.revision);
      if (get().storage === storage) set(refreshReach(s, { ...changes, busy: false }));
    } catch (error) {
      if (get().storage === storage) set({ busy: false, storageStatus: 'error', message: error.message });
    }
  }
}));
