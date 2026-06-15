import {
  Group,
  Vector3
} from 'three';
import QuadtreeTerrainPlane from './QuadtreeTerrainPlane';
import TerrainChunkManager from './TerrainChunkManager';
import {
  cubeTransforms,
  generateHeightMap,
  getMinChunkSize,
  getSamplingResolution
} from './TerrainChunkUtils';

const STITCHING_DIRECTIONS = ['N', 'S', 'E', 'W'];

const sortQueuedChanges = (changes) => changes.sort((a, b) => a._distance - b._distance);

const mergeQueuedChanges = (changes) => {
  const addByRenderSig = {};
  const removeByKey = new Set();
  let distance = Infinity;

  changes.forEach((change) => {
    distance = Math.min(distance, change._distance ?? Infinity);
    (change.add || []).forEach((node) => {
      addByRenderSig[node.renderSig] = node;
    });
    (change.removeByKey || []).forEach((key) => {
      removeByKey.add(key);
    });
  });

  return {
    _distance: distance === Infinity ? 0 : distance,
    add: Object.values(addByRenderSig).sort((a, b) => a.distanceToCamera - b.distanceToCamera),
    removeByKey: Array.from(removeByKey)
  };
};

// TODO: remove
// let taskTotal = 0;
// let taskTally = 0;
// setInterval(() => {
//   if (taskTally > 0) {
//     console.log(
//       `avg children time (over ${taskTally}): ${Math.round(1000 * taskTotal / taskTally) / 1000}ms`,
//     );
//   }
// }, 5000);
// let active = false;
// const debug = (start) => {
//   if (active) {
//     taskTally++;
//     taskTotal += performance.now() - start;
//   }
// };
// setTimeout(() => active = true, 5000);

class QuadtreeTerrainCube {
  constructor(i, config, textureSize, workerPool, materialOverrides = {}) {
    this.radius = config.radius;
    this.cameraPosition = null;
    this.smallestActiveChunkSize = 2 * this.radius;

    // adjust min chunk size for this asteroid (this is mostly to provide higher resolution for
    // smallest asteroids because user can zoom in proportionally farther)
    // if >30km, x1; if >3k, x0.5; else, x0.33
    this.minChunkSize = getMinChunkSize(this.radius);
    const prerenderResolution = getSamplingResolution(this.radius, this.minChunkSize);

    this.builder = new TerrainChunkManager(
      i,
      config,
      textureSize || prerenderResolution,
      workerPool,
      materialOverrides
    );
    this.groups = [...new Array(6)].map(_ => new Group());
    this.chunks = {};
    this.emissiveParams = null;

    // build the sides of the cube (each a quadtreeplane)
    this.sides = [];
    for (let i in cubeTransforms) {
      const transform = cubeTransforms[i];
      const sideIndex = parseInt(i);
      this.sides.push({
        index: sideIndex,
        transform: transform.clone(),
        quadtree: new QuadtreeTerrainPlane({
          side: sideIndex,
          size: this.radius,
          minChunkSize: this.minChunkSize,
          heightSamples: this.prerenderCoarseGeometry(
            transform.clone(),
            prerenderResolution,
            config
          ),
          sampleResolution: prerenderResolution,
          localToWorld: transform.clone(),
          worldStretch: config.stretch,
        }),
      });

      this.groups[sideIndex].matrix = transform.clone();
      this.groups[sideIndex].matrixAutoUpdate = false;

      // TODO: remove debug
      // if (this.sides.length === 5) break;
    }
  }

  dispose() {
    if (this.chunks) Object.values(this.chunks).forEach(({ chunk }) => chunk.dispose());
    if (this.builder) this.builder.dispose();
  }

  // preprocess geometry from high-res texture
  prerenderCoarseGeometry(sideTransform, resolution, config) {
    // const s = Date.now();
    const heightMap = generateHeightMap(
      sideTransform,
      1,
      new Vector3(0, 0, 0),
      resolution,
      { N: 1, S: 1, E: 1, W: 1 },
      false,
      config,
      'texture'
    );
    // console.log('time for coarse', Date.now() - s);

    const heightSamples = [];
    for (let y = 0; y < resolution; y++) {
      for (let x = 0; x < resolution; x++) {
        const bi = (resolution * (resolution - y - 1) + x) * 4; // (flip y)
        const disp = -1 + (heightMap.buffer[bi] + heightMap.buffer[bi + 1] / 255) / 127.5; // (seems like this should be 128)
        heightSamples.push(config.radius * (1 + disp * config.dispWeight));
      }
    }
    return heightSamples;
  }

  setEmissiveParams(params) {
    this.emissiveParams = params;
  }

  setShadowsEnabled(state) {
    this.builder.shadowsEnabled = !!state;
  }

  setCameraPosition(cameraPosition) {
    this.cameraPosition = cameraPosition;

    // vvv BENCHMARK 0.3 - 0.7ms (depending on zoom) -- 95% of that is setCameraPosition
    // TODO: could we move setCameraPosition to a webworker for an improvement?
    for (let s of this.sides) {
      s.quadtree.setCameraPosition(cameraPosition);
      s.quadtree.populateEdges();
    }
    // ^^^

    // vvv BENCHMARK 0.05ms
    // populate cross-side neighbors (now that all sides' chunks are ready)
    for (let s of this.sides) {
      s.quadtree.populateNonsideNeighbors(this.sides);
    }
    // ^^^

    // vvv BENCHMARK 0.1ms (zoomed out) --> 5.5ms (zoomed in)
    // TODO: can we improve the zoomed-in benchmark? probably related
    //  to multiple-array traversals per loop... potentially could
    //  put into a more usable data structure and get better performance
    // const x = performance.now();

    // create a list of changes to make, sorted by closest to farthest
    const queuedChangesObj = {};
    let hasStitchingTransition = false;

    const updatedChunks = {};
    this.sides.forEach((side) => {
      const sideChunks = side.quadtree.getChildren();
      Object.keys(sideChunks).forEach((k) => {
        const node = sideChunks[k];
        const stitchingStrides = {};
        STITCHING_DIRECTIONS.forEach((orientation) => {
          stitchingStrides[orientation] = Math.max(1, (node.neighbors[orientation]?.size?.x || 0) / node.size.x);
        });
        node.stitchingStrides = stitchingStrides;
        node.emissiveParams = this.emissiveParams && { ...this.emissiveParams, k };
        node.stitchingSig = STITCHING_DIRECTIONS.map((orientation) => node.stitchingStrides[orientation]).join('');
        node.emissiveSig = node.emissiveParams?.resource || '';
        node.renderSig = `${node.key} [${node.stitchingSig}] [${node.emissiveSig}]`;
        updatedChunks[k] = node;
      });
    });

    // if no chunks, then single update with all children
    if (Object.keys(this.chunks).length === 0) {
      queuedChangesObj.initial = {
        _distance: 0,
        add: Object.values(updatedChunks)
      };

    // else, walk through existing chunks...
    } else {
      Object.keys(this.chunks).forEach((renderSig) => {
        const chunk = this.chunks[renderSig];

        // if this existing chunk still exists in updatedChunks, will either need to update
        // due to stitching or emissive change, or don't need to do anything
        if (updatedChunks[chunk.key]) {

          // calculate "renderSig"... if not same as old chunk, needs rebuild
          // TODO: since this group can get big, might be good to break up by side before swap
          if (updatedChunks[chunk.key].renderSig !== renderSig) {
            if (updatedChunks[chunk.key].stitchingSig !== chunk.stitchingSig) {
              hasStitchingTransition = true;
            }
            if (!queuedChangesObj.rebuild) {
              queuedChangesObj.rebuild = { add: [], removeByKey: [] };
            }
            queuedChangesObj.rebuild.add.push(updatedChunks[chunk.key]);
            queuedChangesObj.rebuild.removeByKey.push(renderSig);
          }

        // else, this existing chunk is gone (either splitting into smaller or collapsing into larger)
        } else {

          // if splitting (i.e. zooming in), removing current and adding sub-quads (sub-quads will have a key that extends this one)
          const descendents = Object.keys(updatedChunks).reduce((acc, cur) => {
            if (cur.indexOf(`${chunk.key}.`) === 0) acc.push(updatedChunks[cur]);
            return acc;
          }, []);
          if (descendents.length > 0) {
            queuedChangesObj[chunk.key] = {
              _distance: descendents.reduce((acc, cur) => Math.min(acc, cur.distanceToCamera), Infinity),
              removeByKey: [renderSig],
              add: descendents,
            };

          // else, collapsing (i.e. zooming out), adding ancestor and removing current (w/ siblings)
          } else {
            const closestAncestorKey = Object.keys(updatedChunks)
              .filter((k) => chunk.key === `${k}` || (chunk.key.indexOf(`${k}.`) === 0))
              .sort((a, b) => b.length - a.length)
              .shift();
            if (closestAncestorKey) {
              if (!queuedChangesObj[closestAncestorKey]) {
                queuedChangesObj[closestAncestorKey] = {
                  _distance: updatedChunks[closestAncestorKey].distanceToCamera,
                  add: [updatedChunks[closestAncestorKey]],
                  removeByKey: []
                }
              }
              queuedChangesObj[closestAncestorKey].removeByKey.push(renderSig);
            }
          }
        }
      });

      if (queuedChangesObj.rebuild) {
        queuedChangesObj.rebuild._distance = queuedChangesObj.rebuild.add.reduce((acc, cur) => Math.min(acc, cur.distanceToCamera), Infinity);
      }
    }

    const queuedChanges = sortQueuedChanges(Object.values(queuedChangesObj));
    // Stitching changes must land in the same visible swap as the LOD changes that caused them.
    // If they are spread across frames, neighboring chunks can briefly disagree about their edge
    // stride and expose a thin background crack.
    this.queuedChanges = hasStitchingTransition
      ? [mergeQueuedChanges(queuedChanges)]
      : queuedChanges;

    // debug(x);
    // ^^^
  }

  // TODO (enhancement): could pre-populate the pool more
  processNextQueuedChange() {
    if (!this.queuedChanges || this.queuedChanges.length === 0) {
      // console.log('FINISHED!');
      return;
    }
    // console.log('queue length', this.queuedChanges.length);

    const { add, removeByKey } = this.queuedChanges.shift();

    // TODO: (redo) vvv BENCHMARK trends to <0.6ms as chunk pool is established
    // TODO (enhancement): could pre-build more chunks for pool?

    // kick-off chunks to rebuild
    add.forEach((node) => {
      this.chunks[node.renderSig] = {
        key: node.key,
        position: [node.center.x, node.center.z],
        renderSig: node.renderSig,
        size: node.size.x,
        sphereCenter: node.sphereCenter,
        sphereCenterHeight: node.sphereCenterHeight,
        stitchingSig: node.stitchingSig,
        chunk: this.builder.allocateChunk({
          emissiveParams: node.emissiveParams,
          group: this.groups[node.side],
          minHeight: node.unstretchedMin,
          offset: new Vector3(node.center.x, node.center.y, node.center.z),
          radius: this.radius,
          side: node.side,
          stitchingStrides: node.stitchingStrides,
          shadowsEnabled: this.shadowsEnabled,
          width: node.size.x
        })
      };
    });
    this.builder.waitForChunks(add.length);

    // kick-off chunks to recycle
    const removeChunks = (removeByKey || []).map((k) => this.chunks[k]);
    this.builder.queueForRecycling(removeChunks.map((n) => n.chunk));

    // remove references to recycled chunks
    // TODO: make sure this doesn't delete the removeChunks records
    removeChunks.forEach((c) => {
      delete this.chunks[c.renderSig];
    });
    // console.log('now chunks', Object.keys(this.chunks).length);

    // recalculate smallest active chunk
    this.smallestActiveChunkSize = Object.values(this.chunks).reduce((acc, node) => {
      return (acc === null || node.size < acc) ? node.size : acc;
    }, null);
  }
}

export default QuadtreeTerrainCube;
