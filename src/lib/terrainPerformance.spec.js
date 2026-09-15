import { TerrainPerformance } from './terrainPerformance';

it('does not collect timing data when disabled', () => {
  const profiler = new TerrainPerformance();
  expect(profiler.start()).toBeUndefined();
  profiler.record('maps queue', 10);
  expect(profiler.report()).toEqual([]);
});

it('bounds recent samples while preserving aggregate statistics', () => {
  const profiler = new TerrainPerformance(true);
  for (let i = 1; i <= 200; i++) profiler.record('maps queue', i);
  expect(profiler.stages.get('maps queue').recent).toHaveLength(120);
  expect(profiler.report()).toEqual([{
    stage: 'maps queue', count: 200, averageMs: 100.5, maxMs: 200, recentP95Ms: 194
  }]);
  profiler.reset();
  expect(profiler.report()).toEqual([]);
});

it('labels batch sizes as chunks rather than milliseconds', () => {
  const profiler = new TerrainPerformance(true);
  profiler.record('batch size', 64, 'chunks');
  expect(profiler.report()).toEqual([{
    stage: 'batch size', count: 1, averageChunks: 64, maxChunks: 64, recentP95Chunks: 64
  }]);
});
