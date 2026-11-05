import { DEPTHS, surfaceDistance } from './geometry';
import { followError } from './followApproach';

export function reachableSections({ patch, originIndex, cells, history, finalized }) {
  const layers = DEPTHS.map(() => []);
  if (!patch) return layers;
  const surveyed = cells.flatMap((cell, index) => cell[0] ? [{ cell, index }] : []);
  for (const { cell } of surveyed) {
    layers[cell[2]].push({ lot: cell[1], depth: cell[2], cell, sources: [] });
  }
  if (finalized || history.length >= 10) return layers;
  if (!surveyed.length) {
    layers[0].push({ lot: originIndex, depth: 0, sources: [null] });
    return layers;
  }

  const sites = new Map(patch.sites.map((site) => [site.index, site]));
  for (const site of patch.sites) {
    const nearby = surveyed.filter(({ cell }) =>
      surfaceDistance(sites.get(cell[1]).normal, site.normal, patch.radius) <= 1500
    );
    layers.forEach((layer, depth) => {
      const sources = nearby
        .filter(({ cell }) => !followError(cells, history, originIndex, cell, site.index, depth, false))
        .map(({ index }) => index);
      if (sources.length) layer.push({ lot: site.index, depth, sources });
    });
  }
  return layers;
}

export function selectSection(layers, depth, lot, preferredSource) {
  const layer = layers[depth] || [];
  const section = layer.find((entry) => entry.lot === lot) || layer[0];
  return {
    depth,
    selected: section ? { lot: section.lot, depth } : null,
    source: section?.sources.includes(preferredSource)
      ? preferredSource
      : section?.sources[0] ?? null
  };
}
