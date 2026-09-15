import { Matrix4, Vector3 } from 'three';
import TerrainChunkManager from './TerrainChunkManager';
import terrainPerformance from '../../../../lib/terrainPerformance';
import { rebuildChunkMaps } from './TerrainChunkUtils';

jest.mock('~/lib/constants', () => ({
  TERRAIN_CHUNK_POOL_SIZE_MIN: 4,
  TERRAIN_CHUNK_POOL_SIZE_LOOKBACK: 10
}), { virtual: true });
jest.mock('~/lib/workerQueue', () => require('../../../../lib/workerQueue'), { virtual: true });

jest.mock('~/lib/terrainPerformance', () => require('../../../../lib/terrainPerformance'), { virtual: true });

jest.mock('./TerrainChunkUtils', () => ({
  initChunkTextures: () => Promise.resolve(),
  rebuildChunkMaps: jest.fn()
}));
jest.mock('./TerrainChunk', () => function (params) { return {
  _params: params,
  _stretch: { toArray: () => [1, 1, 1] },
  _resolution: 64,
  hide: jest.fn(),
  attachToGroup: jest.fn(),
  updateGeometry: jest.fn(),
  updateMaps: jest.fn(),
  getMesh: jest.fn(() => ({})),
  getTextures: jest.fn(() => ['height', 'color', 'normal']),
  show: jest.fn()
}; });

const setup = () => {
  const jobs = [];
  const manager = new TerrainChunkManager(1, {}, 64, {
    cancelBackgroundProcesses: jest.fn(),
    processInBackground: (message, callback) => jobs.push({ message, callback })
  });
  const chunk = manager.allocateChunk({
    group: { matrix: new Matrix4() },
    offset: new Vector3(),
    stitchingStrides: {},
    width: 100
  });
  manager.waitForChunks(1);
  manager.ready = true;
  return { manager, chunk, jobs };
};

it('stages geometry and uploads before allowing the visible swap', () => {
  const { manager, chunk, jobs } = setup();
  jobs[0].callback({ positions: [1], normals: [2] });
  jobs[1].callback({ maps: {} });
  expect(chunk.updateGeometry).not.toHaveBeenCalled();
  const renderer = { initTexture: jest.fn() };
  const options = { renderer, maxSteps: 1 };
  manager.updateMaps(undefined, options);
  expect(chunk.updateGeometry).toHaveBeenCalledWith([1], [2]);
  expect(renderer.initTexture).not.toHaveBeenCalled();
  for (let i = 0; i < 3; i++) {
    expect(manager.isWaitingOnMaps()).toBe(true);
    manager.update();
    expect(chunk.show).not.toHaveBeenCalled();
    manager.updateMaps(undefined, options);
    expect(renderer.initTexture).toHaveBeenCalledTimes(i + 1);
  }
  manager.update();
  expect(chunk.show).toHaveBeenCalledTimes(1);
});

it('retains the non-renderer preparation path for thumbnails and exports', () => {
  const { manager, chunk, jobs } = setup();
  jobs[1].callback({ maps: {} });
  jobs[0].callback({ positions: [], normals: [] });
  manager.updateMaps();
  manager.update();
  expect(chunk.show).toHaveBeenCalledTimes(1);
});

it('defers main-thread map fallback during animations', () => {
  const { manager, chunk, jobs } = setup();
  jobs[0].callback({ positions: [], normals: [] });
  jobs[1].callback({});
  manager.updateMaps(undefined, { allowFallback: false });
  expect(rebuildChunkMaps).not.toHaveBeenCalled();
  expect(chunk.updateGeometry).not.toHaveBeenCalled();
  expect(manager.isWaitingOnMaps()).toBe(true);
});

it('releases maps received before geometry when disposed', () => {
  const { manager, chunk, jobs } = setup();
  const bitmap = { close: jest.fn() };
  jobs[1].callback({ maps: { heightBitmap: bitmap } });
  manager.dispose();
  jobs[0].callback({ positions: [], normals: [] });
  expect(bitmap.close).toHaveBeenCalledTimes(1);
  expect(chunk.updateGeometry).not.toHaveBeenCalled();
  expect(manager._queued).toHaveLength(0);
});

it('releases maps arriving after disposal', () => {
  const { manager, jobs } = setup();
  manager.dispose();
  const bitmap = { close: jest.fn() };
  jobs[1].callback({ maps: { heightBitmap: bitmap } });
  expect(bitmap.close).toHaveBeenCalledTimes(1);
});


it('cancels only queued jobs owned by the disposed manager', () => {
  const first = setup();
  const replacement = setup();
  first.manager.dispose();
  const [keep] = first.manager.workerPool.cancelBackgroundProcesses.mock.calls[0];
  first.jobs.forEach(({ message }) => expect(keep(message)).toBe(false));
  replacement.jobs.forEach(({ message }) => expect(keep(message)).toBe(true));
  expect(keep({ topic: 'findClosestLots' })).toBe(true);
});


it('reports preparation and visible-swap stages when profiling is enabled', () => {
  terrainPerformance.enabled = true;
  try {
    const { manager, jobs } = setup();
    jobs[0].callback({ positions: [], normals: [] });
    jobs[1].callback({ maps: {} });
    manager.updateMaps(undefined, { renderer: { initTexture: jest.fn() } });
    manager.update();
    expect(terrainPerformance.report().map(({ stage }) => stage)).toEqual(expect.arrayContaining([
      'ready to application wait',
      'geometry and map application',
      'texture upload submission',
      'prepared to visible swap wait',
      'chunk allocation to visible swap',
      'visible swap CPU'
    ]));
  } finally {
    terrainPerformance.enabled = false;
    terrainPerformance.reset();
  }
});

it('separates incomplete-batch, animation, and frame-scheduling wait', () => {
  let now = 0;
  const clock = jest.spyOn(performance, 'now').mockImplementation(() => now);
  terrainPerformance.enabled = true;
  try {
    const { manager, jobs } = setup();
    manager.waitForChunks(2);
    jobs[0].callback({ positions: [], normals: [] });
    jobs[1].callback({ maps: {} });
    now = 10;
    manager.updateMaps();
    manager.trackSwapWait(true);
    const second = { show: jest.fn() };
    manager.chunkTimings.set(second, { startedAt: 0 });
    now = 40;
    manager.markPrepared(second);
    manager.trackSwapWait(true);
    now = 70;
    manager.trackSwapWait(false);
    now = 80;
    manager.update();
    const report = Object.fromEntries(terrainPerformance.report().map((row) => [row.stage, row]));
    expect(report['swap wait: incomplete batch'].averageMs).toBe(15);
    expect(report['swap wait: animation'].averageMs).toBe(30);
    expect(report['swap wait: frame scheduling'].averageMs).toBe(10);
  } finally {
    clock.mockRestore();
    terrainPerformance.enabled = false;
    terrainPerformance.reset();
  }
});

it('prepares a complete chunk per flight step, including all textures', () => {
  const { manager, chunk, jobs } = setup();
  jobs[0].callback({ positions: [], normals: [] });
  jobs[1].callback({ maps: {} });
  // A second ready chunk must wait for the next frame.
  const second = { ...manager._queued[0], chunk: { ...chunk, updateGeometry: jest.fn() } };
  manager._queued.push(second);
  manager.waitForChunks(2);
  const renderer = { initTexture: jest.fn() };
  manager.updateMaps(undefined, { renderer, maxSteps: 1, completeChunks: true, allowFallback: false });
  expect(renderer.initTexture).toHaveBeenCalledTimes(3);
  expect(manager._new).toEqual([chunk]);
  expect(second.chunk.updateGeometry).not.toHaveBeenCalled();
  expect(manager.isWaitingOnMaps()).toBe(true);
});

it('finishes a partially uploaded chunk when a flight starts', () => {
  const { manager, jobs } = setup();
  jobs[0].callback({ positions: [], normals: [] });
  jobs[1].callback({ maps: {} });
  const renderer = { initTexture: jest.fn() };
  manager.updateMaps(undefined, { renderer, maxSteps: 1 });
  manager.updateMaps(undefined, { renderer, maxSteps: 1 });
  expect(renderer.initTexture).toHaveBeenCalledTimes(1);
  manager.updateMaps(undefined, { renderer, maxSteps: 1, completeChunks: true });
  expect(renderer.initTexture).toHaveBeenCalledTimes(3);
  expect(manager.isWaitingOnMaps()).toBe(false);
});


it('finishes the active chunk before later ready results and bounds pending preparation', () => {
  const { manager, chunk, jobs } = setup();
  jobs[0].callback({ positions: [], normals: [] });
  jobs[1].callback({ maps: {} });
  const renderer = { initTexture: jest.fn() };
  manager.updateMaps(undefined, { renderer, maxSteps: 1 });
  const later = { ...manager._queued[0], chunk: { ...chunk, updateGeometry: jest.fn() }, textures: undefined };
  manager._queued.push(later);
  expect(manager.preparingChunks).toBe(1);
  manager.preparer = { prepare: jest.fn() };
  manager.updateMaps(undefined, { renderer, completeChunks: true, camera: {}, scene: {}, maxPreparedChunks: 1 });
  expect(manager.preparer.prepare).toHaveBeenCalledTimes(1);
  expect(manager._new).toEqual([chunk]);
  expect(manager._queued).toEqual([later]);
  expect(manager.preparingChunks).toBe(0);
});

it.each([
  [2, 100, 2],
  [Infinity, 9, 3],
  [Infinity, 0, 0]
])('respects a completion cap of %s and deadline of %s', (maxPreparedChunks, deadline, expected) => {
  let now = 0;
  const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
  try {
    const { manager, jobs } = setup();
    jobs[0].callback({ positions: [], normals: [] });
    jobs[1].callback({ maps: {} });
    const ready = manager._queued[0];
    manager._queued = Array.from({ length: 5 }, () => ({
      ...ready,
      chunk: { ...ready.chunk, updateGeometry: () => { now += 3; } }
    }));
    manager.waitForChunks(5);
    manager.preparingChunks = 5;
    manager.preparer = { prepare: jest.fn() };
    manager.updateMaps(deadline, {
      renderer: { initTexture: jest.fn() }, camera: {}, scene: {},
      completeChunks: true, maxPreparedChunks
    });
    expect(manager._new).toHaveLength(expected);
    expect(manager.preparer.prepare).toHaveBeenCalledTimes(expected);
    expect(manager._queued).toHaveLength(5 - expected);
  } finally {
    clock.mockRestore();
  }
});
