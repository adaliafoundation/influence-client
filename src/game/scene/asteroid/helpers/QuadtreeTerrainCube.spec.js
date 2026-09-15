import { Group, Vector3 } from 'three';
import QuadtreeTerrainCube from './QuadtreeTerrainCube';

jest.mock('~/lib/terrainPerformance', () => require('../../../../lib/terrainPerformance'), { virtual: true });

jest.mock('./QuadtreeTerrainPlane', () => jest.fn());
jest.mock('./TerrainChunkUtils', () => ({}));
jest.mock('./TerrainChunkManager', () => jest.fn());

const node = (key) => ({
  key,
  renderSig: key,
  side: 0,
  center: new Vector3(),
  size: new Vector3(100, 100, 0),
  stitchingStrides: {}
});

it('records the complete replacement while allocating only one chunk per step', () => {
  const cube = Object.create(QuadtreeTerrainCube.prototype);
  const oldChunk = { dispose: jest.fn() };
  cube.radius = 100;
  cube.groups = [new Group()];
  cube.chunks = { old: { chunk: oldChunk } };
  cube.builder = {
    waitForChunks: jest.fn(),
    queueForRecycling: jest.fn(),
    allocateChunk: jest.fn(() => ({ dispose: jest.fn() })),
    dispose: jest.fn()
  };
  cube.queuedChanges = [{ add: [node('0.0'), node('0.1')], removeByKey: ['old'] }];
  cube.processNextQueuedChange(1);
  expect(cube.builder.waitForChunks).toHaveBeenCalledWith(2);
  expect(cube.builder.queueForRecycling).toHaveBeenCalledWith([oldChunk]);
  expect(Object.keys(cube.chunks)).toEqual(['0.0', '0.1']);
  expect(cube.builder.allocateChunk).toHaveBeenCalledTimes(1);

  // Retargeting can replace the next plan without dropping pending allocations.
  cube.queuedChanges = [];
  cube.processNextQueuedChange(1);
  expect(cube.builder.allocateChunk).toHaveBeenCalledTimes(2);
  expect(cube.pendingChange).toBeNull();
  expect(cube.builder.waitForChunks).toHaveBeenCalledTimes(1);
});

it('can dispose a partially allocated replacement', () => {
  const cube = Object.create(QuadtreeTerrainCube.prototype);
  const chunk = { dispose: jest.fn() };
  cube.chunks = { allocated: { chunk }, pending: { chunk: null } };
  cube.builder = { dispose: jest.fn() };
  cube.dispose();
  expect(chunk.dispose).toHaveBeenCalledTimes(1);
  expect(cube.builder.dispose).toHaveBeenCalledTimes(1);
});

it('stops a burst at its deadline without dropping pending chunks', () => {
  let now = 0;
  const clock = jest.spyOn(performance, 'now').mockImplementation(() => now);
  try {
    const cube = Object.create(QuadtreeTerrainCube.prototype);
    const records = Array.from({ length: 6 }, () => ({ record: {}, params: {} }));
    cube.pendingChange = [...records];
    cube.builder = { allocateChunk: jest.fn(() => { now += 1.2; return {}; }) };
    cube.processNextQueuedChange(4, 2);
    expect(cube.builder.allocateChunk).toHaveBeenCalledTimes(2);
    expect(cube.pendingChange).toHaveLength(4);
    cube.processNextQueuedChange(4, now);
    expect(cube.builder.allocateChunk).toHaveBeenCalledTimes(2);
    cube.processNextQueuedChange(4, Infinity);
    expect(cube.pendingChange).toBeNull();
    expect(records.every(({ record }) => record.chunk)).toBe(true);
  } finally {
    clock.mockRestore();
  }
});

it('caps a burst even when allocations are fast', () => {
  const cube = Object.create(QuadtreeTerrainCube.prototype);
  cube.pendingChange = Array.from({ length: 6 }, () => ({ record: {}, params: {} }));
  cube.builder = { allocateChunk: jest.fn(() => ({})) };
  cube.processNextQueuedChange(4);
  expect(cube.builder.allocateChunk).toHaveBeenCalledTimes(4);
  expect(cube.pendingChange).toHaveLength(2);
});

it('leaves pending allocations untouched when backpressure grants no capacity', () => {
  const cube = Object.create(QuadtreeTerrainCube.prototype);
  cube.pendingChange = [{ record: {}, params: {} }];
  cube.builder = { allocateChunk: jest.fn() };
  cube.processNextQueuedChange(0);
  expect(cube.builder.allocateChunk).not.toHaveBeenCalled();
  expect(cube.pendingChange).toHaveLength(1);
});

it('schedules neighboring edge rebuilds independently', () => {
  const cube = Object.create(QuadtreeTerrainCube.prototype);
  const nodes = Object.fromEntries(['a', 'b'].map((key) => [key, {
    ...node(key), distanceToCamera: key === 'a' ? 1 : 2,
    neighbors: { N: { size: new Vector3(200, 200, 0) } }
  }]));
  cube.builder = {};
  cube.chunks = Object.fromEntries(['a', 'b'].map((key) => [`${key} [1111] []`, { key, stitchingSig: '1111' }]));
  cube.sides = [{ quadtree: {
    setCameraPosition: jest.fn(), populateEdges: jest.fn(), populateNonsideNeighbors: jest.fn(),
    getChildren: () => nodes
  } }];
  cube.setCameraPosition(new Vector3());
  expect(cube.queuedChanges).toHaveLength(2);
  expect(cube.queuedChanges[0].add).toHaveLength(1);
});
