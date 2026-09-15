// Keep aggregate timings and a bounded recent sample for each fixed stage.
export class TerrainPerformance {
  constructor(enabled = false) {
    this.enabled = enabled;
    this.stages = new Map();
  }

  start() {
    return this.enabled ? performance.now() : undefined;
  }

  finish(stage, startedAt) {
    if (startedAt !== undefined) this.record(stage, performance.now() - startedAt);
  }

  record(stage, duration, unit = 'ms') {
    if (!this.enabled) return;
    const entry = this.stages.get(stage) || { count: 0, total: 0, max: 0, recent: [], unit };
    entry.count++;
    entry.total += duration;
    entry.max = Math.max(entry.max, duration);
    entry.recent[(entry.count - 1) % 120] = duration;
    this.stages.set(stage, entry);
  }

  report() {
    return Array.from(this.stages, ([stage, entry]) => {
      const sorted = [...entry.recent].sort((a, b) => a - b);
      const suffix = entry.unit === 'chunks' ? 'Chunks' : 'Ms';
      return {
        stage,
        count: entry.count,
        [`average${suffix}`]: entry.total / entry.count,
        [`max${suffix}`]: entry.max,
        [`recentP95${suffix}`]: sorted[Math.ceil(sorted.length * 0.95) - 1]
      };
    });
  }

  reset() {
    this.stages.clear();
  }
}

const terrainPerformance = new TerrainPerformance(localStorage.getItem('terrainPerformance') === '1');
if (terrainPerformance.enabled) window.terrainPerformance = terrainPerformance;

export default terrainPerformance;
