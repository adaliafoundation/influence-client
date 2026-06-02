
import TerrainChunk from './TerrainChunk';
import { initChunkTextures, rebuildChunkMaps } from './TerrainChunkUtils';
import constants from '~/lib/constants';
import { WorkerQueuePriority } from '~/lib/workerQueue';

const {
  ENABLE_TERRAIN_CHUNK_RESOURCE_POOL,
  TERRAIN_CHUNK_POOL_SIZE_MIN,
  TERRAIN_CHUNK_POOL_SIZE_LOOKBACK
} = constants;

// // TODO: remove
// let taskTotal = 0;
// let taskTally = 0;
// setInterval(() => {
//   if (taskTally > 0) {
//     console.log(
//       `avg new chunk time (over ${taskTally}): ${Math.round(taskTotal / taskTally)}ms`,
//     );
//   }
// }, 5000);

class TerrainChunkManager {
  constructor(i, config, textureSize, workerPool, materialOverrides = {}) {
    this.asteroidId = i;
    this.config = config;
    this.workerPool = workerPool;
    this.materialOverrides = materialOverrides;

    const {
      ringsMinMax, ringsPresent, ringsVariation, rotationSpeed,
      ...prunedConfig
    } = this.config;
    this.prunedConfig = prunedConfig; // for passing to webworker

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
    let chunk;
    while(chunk = this.pool.pop()) chunk.dispose(); // eslint-disable-line no-cond-assign
    while(chunk = this.emissivePool.pop()) chunk.dispose(); // eslint-disable-line no-cond-assign
    this.reset(); // (not sure if this is necessary)
  }

  isBusy() {
    return !this.ready || this.waitingOn > this._new.length;
  }

  isUpdating() {
    return this.waitingOn > 0;
  }

  isWaitingOnMaps() {
    // TODO (enhancement): ">=" should be "===" but occasionally on initial asteroid load, extra 6 (initial sides) get put in _new
    //  (should track down at some point)
    return this.waitingOn > 0 && (this._new.length < this.waitingOn);
  }

  reset() {
    this.waitingOn = 0;
    this._queued = [];
    this._old = [];
    this._new = [];
  }

  allocateChunk(params) {
    const poolToUse = !!params.emissiveParams?.color ? this.emissivePool : this.pool;
    let chunk = poolToUse.pop();
    if (chunk) { // console.log('reuse', this.pool.length);
      chunk.reconfigure(params);
    } else { // console.log('create', this.pool.length);
      chunk = new TerrainChunk(
        params,
        this.config,
        {
          materialOverrides: this.materialOverrides,
          resolution: this.textureSize,
          shadowsEnabled: this.shadowsEnabled,
        },
        this.workerPool
      );
    }

    // hide chunk
    chunk.hide();
    chunk.attachToGroup();

    // trigger geometry and map updates (will queue for display when complete)
    const scope = this;
    const buildState = {
      chunk,
      geometryReady: false,
      maps: null,
      mapsReady: false,
      workerError: null
    };
    const queueIfReady = () => {
      if (buildState.geometryReady && buildState.mapsReady) {
        scope._queued.push(buildState);
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
        _cacheable: 'asteroid',
        _concurrencyGroup: 'terrainChunk',
        _maxConcurrent: 2,
        _priority: WorkerQueuePriority.terrainGeometry
      },
      ({ positions, normals }) => {
        chunk.updateGeometry(positions, normals);
        buildState.geometryReady = true;
        queueIfReady();
      }
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
        _cacheable: 'asteroid',
        _concurrencyGroup: 'terrainChunk',
        _maxConcurrent: 2,
        _priority: WorkerQueuePriority.terrainMaps
      },
      ({ error, maps }) => {
        buildState.maps = maps;
        buildState.workerError = error;
        buildState.mapsReady = true;
        queueIfReady();
      }
    );

    return chunk;
  }

  waitForChunks(howMany) {
    this.waitingOn = howMany;

    this.recentAddAtOnceAmounts.push(howMany);
    if (this.recentAddAtOnceAmounts.length >= TERRAIN_CHUNK_POOL_SIZE_LOOKBACK) {
      this.recentAddAtOnceAmounts = this.recentAddAtOnceAmounts.slice(this.recentAddAtOnceAmounts.length - TERRAIN_CHUNK_POOL_SIZE_LOOKBACK);
      this.targetPoolSize = this.recentAddAtOnceAmounts.reduce((a, b) => Math.max(a, b), TERRAIN_CHUNK_POOL_SIZE_MIN);
      // console.log(`targetPoolSize: ${this.targetPoolSize}`);
    }
  }

  queueForRecycling(chunks) {
    // this._old = [...chunks];
    this._old = chunks; // doesn't seem like this needs clone, so not wasting resources
  }

  updateMaps(until) {
    let buildState;

    // NOTE: deliberately always do at least one
    while (buildState = this._queued.pop()) { // eslint-disable-line
      let maps = buildState.maps;
      if (!maps) {
        if (buildState.workerError) {
          console.warn('Terrain map worker unavailable; rebuilt chunk maps on main thread.', buildState.workerError);
        }
        maps = rebuildChunkMaps(
          {
            config: this.config,
            edgeStrides: buildState.chunk._params.stitchingStrides,
            emissiveParams: buildState.chunk._params.emissiveParams,
            groupMatrix: buildState.chunk._params.group.matrix.clone(),
            offset: buildState.chunk._params.offset.clone(),
            resolution: buildState.chunk._resolution,
            side: buildState.chunk._params.side,
            width: buildState.chunk._params.width
          },
        );
      }
      buildState.chunk.updateMaps(maps);
      this._new.push(buildState.chunk);

      // limit processing time (i.e. for FPS)
      if (until && Date.now() > until) {
        // console.log('truncate processing', this._new.length);
        break;
      }
    }
  }

  update() {
    if (this.isBusy()) return;
    // console.log(`adding ${this._new.length} chunks, removing ${this._old.length} chunks`);
    // console.log(`update: add ${this._new.length}, remove ${this._old.length}, pool ${this.pool.length}, emissivePool ${this.emissivePool.length}, waitingOn ${this.waitingOn}, queued ${this._queued.length}`);

    // recycle old chunks
    let chunk;
    while (chunk = this._old.pop()) { // eslint-disable-line
      const poolToUse = !!chunk._params.emissiveParams?.color ? this.emissivePool : this.pool;
      if (ENABLE_TERRAIN_CHUNK_RESOURCE_POOL && chunk.isReusable() && poolToUse.length < this.targetPoolSize) {
        // console.log('REUSE');
        chunk.detachFromGroup();
        poolToUse.push(chunk);
      } else {
        // console.log('TRASH');
        chunk.dispose();
      }
    }

    // show new chunks
    while (chunk = this._new.pop()) { // eslint-disable-line
      chunk.show();
    }

    // re-init for next update
    this.reset();
  }
}

export default TerrainChunkManager;
