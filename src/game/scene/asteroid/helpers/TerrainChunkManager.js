
import TerrainChunk from './TerrainChunk';
import TerrainChunkPreparer from './TerrainChunkPreparer';
import { initChunkTextures, rebuildChunkMaps } from './TerrainChunkUtils';
import constants from '~/lib/constants';
import terrainPerformance from '~/lib/terrainPerformance';

import { WorkerQueuePriority } from '~/lib/workerQueue';

let managerIds = 0;

const {
  ENABLE_TERRAIN_CHUNK_RESOURCE_POOL,
  TERRAIN_CHUNK_POOL_SIZE_MIN,
  TERRAIN_CHUNK_POOL_SIZE_LOOKBACK
} = constants;

class TerrainChunkManager {
  constructor(i, config, textureSize, workerPool, materialOverrides = {}) {
    this.managerId = managerIds++;
    this.chunkTimings = new WeakMap();
    this.asteroidId = i;
    this.config = config;
    this.workerPool = workerPool;
    this.materialOverrides = materialOverrides;

    const {
      ringsMinMax, ringsPresent, ringsVariation, rotationSpeed,
      ...prunedConfig
    } = this.config;
    this.prunedConfig = prunedConfig; // for passing to webworker

    this.disposed = false;
    this.pendingBuilds = new Set();
    this.maxConcurrent = 2;
    this.shadowsEnabled = false;
    this.textureSize = textureSize;
    this.pool = [];
    this.emissivePool = [];
    this.reset();

    this.recentAddAtOnceAmounts = [];
    this.targetPoolSize = TERRAIN_CHUNK_POOL_SIZE_MIN;

    this.ready = false;
    initChunkTextures().then(() => { this.ready = true; });
  }

  dispose() {
    this.disposed = true;
    this.preparer?.dispose();
    // The same asteroid may have a replacement manager or a thumbnail building.
    // Only remove queued jobs belonging to this exact manager instance.
    this.workerPool.cancelBackgroundProcesses((job) => job._terrainManagerId !== this.managerId);
    this.pendingBuilds.forEach(({ maps }) => this.disposeMaps(maps));
    this.pendingBuilds.clear();
    this._old.forEach((chunk) => chunk.dispose());
    let chunk;
    while(chunk = this.pool.pop()) chunk.dispose(); // eslint-disable-line no-cond-assign
    while(chunk = this.emissivePool.pop()) chunk.dispose(); // eslint-disable-line no-cond-assign
    this.reset();
  }

  disposeMaps(maps) {
    Object.values(maps || {}).forEach((map) => {
      if (map?.isTexture) map.dispose();
      else map?.close?.();
    });
  }

  isBusy() {
    return !this.ready || this.waitingOn > this._new.length;
  }

  isUpdating() {
    return this.waitingOn > 0;
  }

  isWaitingOnMaps() {
    return this.waitingOn > 0 && (this._new.length < this.waitingOn);
  }

  reset() {
    this.batchTiming = null;
    this.waitingOn = 0;
    this.preparingChunks = 0;
    this._queued = [];
    this._old = [];
    this._new = [];
  }

  workerTimingOptions(stage) {
    if (!terrainPerformance.enabled) return undefined;
    return {
      onTiming: ({ queueMs, executionMs }) => {
        terrainPerformance.record(`${stage} queue`, queueMs);
        terrainPerformance.record(`${stage} worker round trip`, executionMs);
      }
    };
  }

  markPrepared(chunk) {
    const timing = this.chunkTimings.get(chunk);
    if (timing) timing.preparedAt = terrainPerformance.start();
    this.preparingChunks--;
    this._new.push(chunk);
    if (this.batchTiming && this._new.length === this.waitingOn) {
      this.batchTiming.readyAt = terrainPerformance.start();
      this.batchTiming.lastObservedAt = this.batchTiming.readyAt;
    }
  }

  // Classify waiting exclusively: incomplete batch first, then animation or
  // frame scheduling once the entire replacement is prepared.
  trackSwapWait(animating) {
    const timing = this.batchTiming;
    if (timing?.readyAt === undefined) return;
    const now = terrainPerformance.start();
    if (timing.animating) timing.animationWait += now - timing.lastObservedAt;
    timing.lastObservedAt = now;
    timing.animating = animating;
  }

  allocateChunk(params) {
    this.preparingChunks++;
    const startedAt = terrainPerformance.start();
    const poolToUse = !!params.emissiveParams?.color ? this.emissivePool : this.pool;
    let chunk = poolToUse.pop();
    if (chunk) {
      chunk.reconfigure(params);
    } else {
      chunk = new TerrainChunk(
        params,
        this.config,
        {
          materialOverrides: this.materialOverrides,
          resolution: this.textureSize,
          shadowsEnabled: this.shadowsEnabled,
          skirtsEnabled: this.skirtsEnabled,
        },
        this.workerPool
      );
    }

    if (terrainPerformance.enabled) this.chunkTimings.set(chunk, { startedAt });

    // hide chunk
    chunk.hide();
    chunk.attachToGroup();

    // trigger geometry and map updates (will queue for display when complete)
    const buildState = {
      chunk,
      geometryReady: false,
      positions: null,
      normals: null,
      maps: null,
      mapsReady: false,
      workerError: null
    };
    this.pendingBuilds.add(buildState);
    const queueIfReady = () => {
      if (buildState.geometryReady && buildState.mapsReady) {
        buildState.readyAt = terrainPerformance.start();
        this._queued.push(buildState);
      }
    };

    this.workerPool.processInBackground(
      {
        topic: 'rebuildTerrainGeometry',
        asteroid: {
          key: this.asteroidId,
          config: this.prunedConfig,
        },
        chunk: {
          edgeStrides: chunk._params.stitchingStrides,
          emissiveParams: chunk._params.emissiveParams,
          offset: chunk._params.offset.toArray(),
          width: chunk._params.width,
          groupMatrix: chunk._params.group.matrix.clone(),
          minHeight: chunk._params.minHeight,
          resolution: this.textureSize,
          side: chunk._params.side,
          stretch: chunk._stretch.toArray(),
        },
        _terrainManagerId: this.managerId,
        _cacheable: 'asteroid',
        _concurrencyGroup: 'terrainChunk',
        _maxConcurrent: this.maxConcurrent,
        _priority: WorkerQueuePriority.terrainGeometry
      },
      ({ positions, normals }) => {
        if (this.disposed) return;
        buildState.positions = positions;
        buildState.normals = normals;
        buildState.geometryReady = true;
        queueIfReady();
      },
      undefined,
      this.workerTimingOptions('geometry')
    );

    this.workerPool.processInBackground(
      {
        topic: 'rebuildTerrainMaps',
        asteroid: {
          key: this.asteroidId,
          config: this.prunedConfig,
        },
        chunk: {
          edgeStrides: chunk._params.stitchingStrides,
          emissiveParams: chunk._params.emissiveParams,
          groupMatrix: chunk._params.group.matrix.toArray(),
          offset: chunk._params.offset.toArray(),
          resolution: chunk._resolution,
          side: chunk._params.side,
          width: chunk._params.width
        },
        _terrainManagerId: this.managerId,
        _cacheable: 'asteroid',
        _concurrencyGroup: 'terrainChunk',
        _maxConcurrent: this.maxConcurrent,
        // Keep maps beside their geometry instead of draining all geometry first.
        _priority: WorkerQueuePriority.terrainGeometry
      },
      ({ error, maps }) => {
        if (this.disposed) {
          this.disposeMaps(maps);
          return;
        }
        buildState.maps = maps;
        buildState.workerError = error;
        buildState.mapsReady = true;
        queueIfReady();
      },
      undefined,
      this.workerTimingOptions('maps')
    );

    terrainPerformance.finish('chunk allocation CPU', startedAt);
    if (this.batchTiming) {
      this.batchTiming.allocated++;
      if (this.batchTiming.allocated === this.waitingOn) {
        terrainPerformance.finish('batch allocation span', this.batchTiming.startedAt);
      }
    }
    return chunk;
  }

  waitForChunks(howMany) {
    this.waitingOn = howMany;
    if (terrainPerformance.enabled) {
      this.batchTiming = { startedAt: terrainPerformance.start(), allocated: 0, animationWait: 0 };
      terrainPerformance.record('batch size', howMany, 'chunks');
    }

    this.recentAddAtOnceAmounts.push(howMany);
    if (this.recentAddAtOnceAmounts.length >= TERRAIN_CHUNK_POOL_SIZE_LOOKBACK) {
      this.recentAddAtOnceAmounts = this.recentAddAtOnceAmounts.slice(this.recentAddAtOnceAmounts.length - TERRAIN_CHUNK_POOL_SIZE_LOOKBACK);
      this.targetPoolSize = this.recentAddAtOnceAmounts.reduce((a, b) => Math.max(a, b), TERRAIN_CHUNK_POOL_SIZE_MIN);
    }
  }

  queueForRecycling(chunks) {
    this._old = chunks;
  }

  finishPreparation(chunk, renderer, camera, scene) {
    if (renderer && camera && scene) {
      if (!this.preparer) this.preparer = new TerrainChunkPreparer();
      this.preparer.prepare(chunk.getMesh(), renderer, camera, scene);
    }
    this.markPrepared(chunk);
  }

  uploadTexture(renderer, texture) {
    const startedAt = terrainPerformance.start();
    renderer.initTexture(texture);
    terrainPerformance.finish('texture upload submission', startedAt);
  }

  updateMaps(until, { renderer, maxSteps = Infinity, maxPreparedChunks = Infinity, allowFallback = true, completeChunks = false, camera, scene } = {}) {
    let steps = 0;
    const preparedBefore = this._new.length;
    while (this._queued.length > 0 && steps < maxSteps
      && this._new.length - preparedBefore < maxPreparedChunks
      && (until === undefined || Date.now() < until)) {
      const buildState = this._queued.shift();
      if (renderer && buildState.textures) {
        const textures = buildState.textures.splice(0, completeChunks ? Infinity : 1);
        textures.forEach((texture) => this.uploadTexture(renderer, texture));
        if (buildState.textures.length === 0) this.finishPreparation(buildState.chunk, renderer, camera, scene);
        else this._queued.unshift(buildState);
      } else {
        // A worker failure must not move procedural GPU generation onto the
        // main thread during a camera animation.
        if (!buildState.maps && !allowFallback) {
          this._queued.unshift(buildState);
          return;
        }
        terrainPerformance.finish('ready to application wait', buildState.readyAt);
        const applyStartedAt = terrainPerformance.start();
        buildState.chunk.updateGeometry(buildState.positions, buildState.normals);
        let maps = buildState.maps;
        if (!maps) {
          if (buildState.workerError) {
            console.warn('Terrain map worker unavailable; rebuilt chunk maps on main thread.', buildState.workerError);
          }
          maps = rebuildChunkMaps({
            config: this.config,
            edgeStrides: buildState.chunk._params.stitchingStrides,
            emissiveParams: buildState.chunk._params.emissiveParams,
            groupMatrix: buildState.chunk._params.group.matrix.clone(),
            offset: buildState.chunk._params.offset.clone(),
            resolution: buildState.chunk._resolution,
            side: buildState.chunk._params.side,
            width: buildState.chunk._params.width
          });
        }
        buildState.chunk.updateMaps(maps);
        terrainPerformance.finish('geometry and map application', applyStartedAt);
        this.pendingBuilds.delete(buildState);
        buildState.maps = null;
        buildState.positions = null;
        buildState.normals = null;
        if (renderer) {
          buildState.textures = buildState.chunk.getTextures();
          if (completeChunks) {
            buildState.textures.forEach((texture) => this.uploadTexture(renderer, texture));
            this.finishPreparation(buildState.chunk, renderer, camera, scene);
          } else {
            this._queued.unshift(buildState);
          }
        } else {
          this.finishPreparation(buildState.chunk, renderer, camera, scene);
        }
      }
      steps++;
      if (until && Date.now() >= until) break;
    }
  }

  update() {
    if (this.isBusy()) return;

    this.trackSwapWait(false);
    const swapStartedAt = terrainPerformance.start();

    // recycle old chunks
    let chunk;
    while (chunk = this._old.pop()) { // eslint-disable-line
      const poolToUse = !!chunk._params.emissiveParams?.color ? this.emissivePool : this.pool;
      if (ENABLE_TERRAIN_CHUNK_RESOURCE_POOL && chunk.isReusable() && poolToUse.length < this.targetPoolSize) {
        chunk.detachFromGroup();
        poolToUse.push(chunk);
      } else {
        chunk.dispose();
      }
    }

    // show new chunks
    while (chunk = this._new.pop()) { // eslint-disable-line
      chunk.show();
      const timing = this.chunkTimings.get(chunk);
      if (timing) {
        terrainPerformance.finish('prepared to visible swap wait', timing.preparedAt);
        if (this.batchTiming?.readyAt !== undefined) {
          terrainPerformance.record('swap wait: incomplete batch', this.batchTiming.readyAt - timing.preparedAt);
          terrainPerformance.record('swap wait: animation', this.batchTiming.animationWait);
          terrainPerformance.record('swap wait: frame scheduling',
            swapStartedAt - this.batchTiming.readyAt - this.batchTiming.animationWait);
        }
        terrainPerformance.finish('chunk allocation to visible swap', timing.startedAt);
        this.chunkTimings.delete(chunk);
      }
    }

    terrainPerformance.finish('visible swap CPU', swapStartedAt);

    // re-init for next update
    this.reset();
  }
}

export default TerrainChunkManager;
