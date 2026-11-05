import create from 'zustand';
import { appConfig } from '~/appConfig';
import { zero, transition, packMeta, claim } from './rules';
import { reachableSections, selectSection } from './reach';
import { DEPTHS, surfaceDistance } from './geometry';

export const prospectingEnabled = () => !!appConfig.get('App.enableDevTools');
const random = (bytes) =>
  BigInt(
    '0x' +
      Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
        b.toString(16).padStart(2, '0')
      ).join('')
  ).toString();
const initial = () => ({
  active: false,
  asteroidId: null,
  originIndex: null,
  resource: 1,
  depth: 0,
  selected: null,
  source: null,
  patch: null,
  layers: DEPTHS.map(() => []),
  cells: Array.from({ length: 10 }, zero),
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
    ...selectSection(layers, depth, next.selected?.lot, next.source)
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
      context: random(16)
    });
  },
  close: () => set({ active: false }),
  reset: () => {
    const { asteroidId, originIndex, resource, patch } = get();
    set(refreshReach(initial(), { active: true, asteroidId, originIndex, resource, patch, context: random(16) }));
  },
  setPatch: (patch) => set((s) => refreshReach(s, { patch })),
  setDepth: (depth) =>
    set((s) => selectSection(s.layers, depth, s.selected?.lot, s.source)),
  select: (lot, depth) =>
    set((s) => selectSection(s.layers, depth, lot, s.source)),
  setSource: (source) => set({ source }),
  sample: (method, abundance) => {
    const s = get(),
      i = s.history.length;
    if (s.finalized || i >= 10 || !s.patch || !s.selected) return;
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
      salt: random(16)
    };
    const state = s.cells.map((c) => c.slice());
    state.origin = s.originIndex;
    const meta = packMeta({
      lot: site.index,
      x: Math.round(500000 + site.x * 100),
      z: Math.round(500000 + site.z * 100),
      abundance: Math.round(abundance * 1e6)
    });
    let mask = 0n;
    s.history.forEach((h, j) => {
      const previous = s.patch.sites.find((v) => v.index === h.lot);
      if (surfaceDistance(previous.normal, site.normal, s.patch.radius) > 1500)
        mask |= 1n << BigInt(j);
    });
    try {
      const randomness = random(8);
      const result = transition(
        state,
        s.history,
        s.context,
        i,
        action,
        meta,
        mask.toString(),
        randomness
      );
      const messages = [
        'Sample resolved.',
        'Drill stuck. The sample was spent; you can try again.',
        'Bore collapsed. This approach is now blocked.',
        'Localized cave-in. Recoverable quantity reduced.'
      ];
      set(refreshReach(s, {
        cells: result.state,
        history: [
          ...s.history,
          { ...result, action, meta, mask: mask.toString(), randomness }
        ],
        source: result.state[i][0] ? i : s.source,
        message: messages[result.event]
      }));
    } catch (error) {
      set({ message: `Cannot sample: ${error.message}.` });
    }
  },
  finalize: (abundance) => {
    const s = get(),
      cell = s.cells.find(
        (c) => c[0] && c[1] === s.selected?.lot && c[2] === s.selected?.depth
      );
    if (!cell?.[3] || s.finalized) return;
    const result = claim(cell, Math.round(abundance * 1e6));
    set(refreshReach(s, {
      finalized: { ...result, quantity: Math.floor(result.quantity * 1.5) },
      message:
        'Local claim selected. Proof integration is the next implementation stage.'
    }));
  }
}));
