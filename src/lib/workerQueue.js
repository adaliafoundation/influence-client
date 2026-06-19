// Worker priorities are intentionally broad bands, not a precise schedule.
// Higher-priority jobs run first when a worker is available; concurrency groups
// still cap expensive categories so one subsystem cannot monopolize the pool.
//
// Band guide:
// - immediateInteraction: pointer/selection work that should feel synchronous.
// - renderCritical: scene positions needed to avoid visible stale frames.
// - lotGeometry/lotRegions: asteroid surface overlay setup after terrain work.
// - sceneSort: camera-dependent ordering that can trail interaction slightly.
// - terrainGeometry/terrainMaps: chunk rebuilds that are visible but bursty.
// - background: analysis/planning work that should yield to live rendering.
export const WorkerQueuePriority = {
  immediateInteraction: 90,
  renderCritical: 80,
  lotGeometry: 70,
  lotRegions: 65,
  sceneSort: 40,
  terrainGeometry: 30,
  terrainMaps: 20,
  background: -30,
};
