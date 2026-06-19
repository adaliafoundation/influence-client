import { Matrix4, Vector3 } from 'three';

import * as utils from '~/lib/geometryUtils';
import porkchop from '~/lib/porkchop';
import {
  initChunkTextures,
  rebuildChunkGeometry,
  rebuildChunkMaps
} from '~/game/scene/asteroid/helpers/TerrainChunkUtils';
import { getLotGeometry, getLotRegions, getClosestLots } from '~/game/scene/asteroid/helpers/LotGeometry';

let cache = {
  asteroid: {},
  asteroids: {},
  planets: {},
};

onmessage = function(event) {
  switch (event.data.topic) {
    case 'updateAsteroidPositions':
      if (event.data.asteroids) cache.asteroids = event.data.asteroids;
      updateAsteroidPositions(cache.asteroids?.orbitals, event.data.elapsed);
      break;
    case 'updatePlanetPositions':
      if (event.data.planets) cache.planets = event.data.planets;
      updatePlanetPositions(cache.planets?.orbitals, event.data.elapsed);
      break;
    case 'rebuildTerrainGeometry':
      if (event.data.asteroid) cache.asteroid = event.data.asteroid;
      rebuildTerrainGeometry({
        ...cache.asteroid,
        ...event.data.chunk
      });
      break;
    case 'rebuildTerrainMaps':
      if (event.data.asteroid) cache.asteroid = event.data.asteroid;
      rebuildTerrainMaps({
        ...cache.asteroid,
        ...event.data.chunk
      });
      break;
    case 'buildLotGeometry':
      if (event.data.asteroid) cache.asteroid = event.data.asteroid;
      buildLotGeometry({
        aboveSurface: event.data.aboveSurface,
        heightMaps: event.data.heightMaps,
        textureQuality: event.data.textureQuality,
        ...cache.asteroid,
      });
      break;
    case 'buildLotRegions':
      buildLotRegions(event.data.data);
      break;
    case 'findClosestLots':
      findClosestLots(event.data.data);
      break;
    case 'calculatePorkchop':
      calculatePorkchop(event.data.data);
      break;
    default:
      console.error('Method not supported');
  }
};

const updateAsteroidPositions = function(orbitals, elapsed = 0) {
  const positions = utils.getUpdatedAsteroidPositions(orbitals, elapsed);
  postMessage({
    topic: 'asteroidPositions',
    positions
  }, [positions.buffer]);
};

const updatePlanetPositions = function(orbitals, elapsed = 0) {
  const positions = utils.getUpdatedPlanetPositions(orbitals, elapsed);
  postMessage({
    topic: 'planetPositions',
    positions
  }, [positions.buffer]);
};

// TODO: remove debug
// let taskTotal = 0;
// let taskTally = 0;
// setInterval(() => {
//   if (taskTally > 0) {
//     console.log(
//       `avg execution time (internal, over ${taskTally}): ${Math.round(taskTotal / taskTally)}ms`,
//     );
//   }
// }, 5000);

const rebuildTerrainGeometry = function (chunk) {
  chunk.offset = new Vector3(chunk.offset[0], chunk.offset[1], chunk.offset[2]);
  chunk.stretch = new Vector3(chunk.stretch[0], chunk.stretch[1], chunk.stretch[2]);
  const { positions, normals } = rebuildChunkGeometry(chunk);
  postMessage({
    topic: 'rebuiltTerrainChunkGeometry',
    positions,
    normals
  }, [
    positions.buffer,
    normals.buffer
  ]);
}

const rebuildTerrainMaps = function (chunk) {
  chunk.offset = new Vector3(chunk.offset[0], chunk.offset[1], chunk.offset[2]);
  chunk.groupMatrix = (new Matrix4()).fromArray(chunk.groupMatrix);

  initChunkTextures().then(() => {
    const maps = rebuildChunkMaps(chunk);
    const transferable = [
      maps.colorBitmap,
      maps.heightBitmap,
      maps.normalBitmap,
      maps.emissiveBitmap,
    ].filter((bitmap) => typeof ImageBitmap !== 'undefined' && bitmap instanceof ImageBitmap);

    postMessage({
      topic: 'rebuiltTerrainChunkMaps',
      maps
    }, transferable);
  }).catch((e) => {
    postMessage({
      topic: 'rebuiltTerrainChunkMaps',
      error: e?.message || 'Unable to rebuild terrain maps in worker'
    });
  });
}

const buildLotGeometry = function({ aboveSurface, config, heightMaps, textureQuality }) {
  const { positions, orientations } = getLotGeometry({
    config,
    aboveSurface,
    prebuiltHeightMaps: heightMaps,
    textureQuality
  });
  postMessage({
    topic: 'builtLotGeometry',
    positions,
    orientations
  }, [
    positions.buffer,
    orientations.buffer
  ]);
}

const buildLotRegions = function ({ positions, regionTally }) {
  const regions = getLotRegions(positions, regionTally);
  postMessage({
    topic: 'gotLotRegions',
    regions
  }, [
    regions.buffer
  ])
};

const findClosestLots = function(data) {
  const lots = getClosestLots(data);
  postMessage({ topic: 'foundClosestLots', lots });
}

const calculatePorkchop = async function(data) {
  const deltaVs = await porkchop(data);
  postMessage({
    topic: 'calculatedPorkchop',
    deltaVs
  }, [
    deltaVs.buffer
  ]);
};
