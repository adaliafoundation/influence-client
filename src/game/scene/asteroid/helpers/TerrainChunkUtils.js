import {
  CanvasTexture,
  Float32BufferAttribute,
  ImageBitmapLoader,
  LinearFilter,
  LinearMipMapLinearFilter,
  Matrix4,
  NearestFilter,
  ShaderMaterial,
  TextureLoader,
  Vector3,
} from 'three';
import colorShader from '~/game/scene/asteroid/shaders/color.glsl';
import heightShader from '~/game/scene/asteroid/shaders/height.glsl';
import heightShaderWithStitching from '~/game/scene/asteroid/shaders/height_w_stitching.glsl';
import normalShader from '~/game/scene/asteroid/shaders/normal.glsl';
import resourceShader from '~/game/scene/asteroid/shaders/resource.glsl';
import rampsDataUri from '~/game/scene/asteroid/helpers/_ramps.png.datauri';
import constants from '~/lib/constants';
import TextureRenderer from '~/lib/graphics/TextureRenderer';

const { CHUNK_RESOLUTION, MIN_CHUNK_SIZE, OVERSAMPLE_CHUNK_TEXTURES } = constants;
const textureOptsDefault = Object.freeze({
  generateMipmaps: true, minFilter: LinearMipMapLinearFilter, magFilter: LinearFilter, needsUpdate: true
});

export const cubeTransforms = [
  (new Matrix4()).makeRotationX(-Math.PI / 2), // +Y
  (new Matrix4()).makeRotationX(Math.PI / 2),  // -Y
  (new Matrix4()).makeRotationY(Math.PI / 2),  // +X
  (new Matrix4()).makeRotationY(-Math.PI / 2), // -X
  new Matrix4(),                               // +Z
  (new Matrix4()).makeRotationY(Math.PI),      // -Z
];

// TODO: remove this debug vvv
// let first = true;
// let totalRuns = 0;
// let totals = {};
// let startTime;
// function benchmark(tag) {
//   if (!tag) {
//     startTime = Date.now();
//     totalRuns++;
//   }
//   else {
//     if (!totals[tag]) totals[tag] = 0;
//     totals[tag] += Date.now() - startTime;
//   }
// }
// setInterval(() => {
//   if (first) {
//     first = false;
//     totals = {};
//     totalRuns = 0;
//     return;
//   }

//   const b = {};
//   let prevTime = 0;
//   Object.keys(totals).forEach((k) => {
//     const thisTime = Math.round(totals[k] / totalRuns);
//     if (k === '_') {
//       b['TOTAL'] = thisTime;
//     } else {
//       b[k] = thisTime - prevTime;
//       prevTime = thisTime;
//     }
//   });
//   console.log(`b ${totalRuns}`, b);
// }, 5000);
// ^^^


// set up texture renderer (ideally w/ offscreen canvas)
let _textureRenderer;
function getTextureRenderer() {
  if (!_textureRenderer) _textureRenderer = new TextureRenderer();
  return _textureRenderer;
}

// load ramps
let ramps;
export async function initChunkTextures(preloadedBitmap) {
  if (!ramps) {
    if (preloadedBitmap) {
      ramps = new CanvasTexture(preloadedBitmap);
      ramps.generateMipmaps = false;
    } else {
      let loader;

      try {
        loader = new TextureLoader();
        ramps = await loader.loadAsync(rampsDataUri);
      } catch (e) {
        loader = new ImageBitmapLoader();
        loader.setOptions({ imageOrientation: 'flipY' });
        ramps = new CanvasTexture(await loader.loadAsync(rampsDataUri));
        ramps.generateMipmaps = false;
      }

      ramps.minFilter = NearestFilter;
      ramps.magFilter = NearestFilter;
    }
  }
}

export const getSamplingResolution = (radius, minChunkSize = MIN_CHUNK_SIZE) => {
  const targetResolution = 2 * radius / minChunkSize;
  if (targetResolution === 1) return 1;
  if (targetResolution < 32) return 16;
  if (targetResolution < 64) return 32;
  if (targetResolution < 128) return 64;
  if (targetResolution < 256) return 128;
  if (targetResolution < 512) return 256;
  if (targetResolution < 1024) return 512;
  return 1024;
};

export function generateHeightMap(cubeTransform, chunkSize, chunkOffset, chunkResolution, edgeStrides, oversample, config, returnType = 'bitmap') {
  const extraPasses = getExtraPasses(chunkSize, chunkResolution);
  const extraPassesMax = getExtraPasses(getMinChunkSize(config.radius) / (2 * config.radius), chunkResolution) - 1;
  const material = new ShaderMaterial({
    fragmentShader: (edgeStrides.N === 1 && edgeStrides.S === 1 && edgeStrides.E === 1 && edgeStrides.W === 1)
      ? heightShader
      : heightShaderWithStitching,
    uniforms: {
      uChunkOffset: { type: 'v2', value: chunkOffset },
      uChunkSize: { type: 'f', value: chunkSize },
      uCraterCut: { type: 'f', value: config.craterCut },
      uCraterFalloff: { type: 'f', value: config.craterFalloff },
      uCraterPasses: { type: 'i', value: config.craterPasses },
      uCraterPersist: { type: 'f', value: config.craterPersist },
      uCraterSteep: { type: 'f', value: config.craterSteep },
      uDispFreq: { type: 'f', value: config.dispFreq },
      uDispPasses: { type: 'i', value: config.dispPasses },
      uDispPersist: { type: 'f', value: config.dispPersist },
      uDispWeight: { type: 'f', value: config.dispWeight },
      uEdgeStrideN: { type: 'f', value: edgeStrides.N },
      uEdgeStrideS: { type: 'f', value: edgeStrides.S },
      uEdgeStrideE: { type: 'f', value: edgeStrides.E },
      uEdgeStrideW: { type: 'f', value: edgeStrides.W },
      uExtraPasses: { type: 'i', value: extraPasses },
      uExtraPassesMax: { type: 'i', value: extraPassesMax },
      uFeaturesFreq: { type: 'f', value: config.featuresFreq },
      uFeaturesSharpness: { type: 'f', value: config.featuresSharpness },
      uFineDispFraction: { type: 'f', value: config.fineDispFraction },
      uLandscapeWidth: { type: 'f', value: 2 * config.radius },
      uMaxCraterDepth: { type: 'f', value: config.radius * config.dispWeight * config.fineDispFraction },
      uOversampling: { type: 'b', value: oversample },
      uResolution: { type: 'f', value: chunkResolution },
      uRidgeWeight: { type: 'f', value: config.ridgeWeight },
      uRimVariation: { type: 'f', value: config.rimVariation },
      uRimWeight: { type: 'f', value: config.rimWeight },
      uRimWidth: { type: 'f', value: config.rimWidth },
      uSeed: { type: 'v3', value: config.seed },
      uStretch: { type: 'v3', value: config.stretch },
      uTopoDetail: { type: 'i', value: config.topoDetail },
      uTopoFreq: { type: 'f', value: config.topoFreq },
      uTopoWeight: { type: 'f', value: config.topoWeight },
      uTransform: { type: 'mat4', value: cubeTransform },
    }
  });

  const textureRenderer = getTextureRenderer();

  if (returnType === 'texture') {
    const texture = textureRenderer.render(chunkResolution, chunkResolution, material);
    texture.options = { ...textureOptsDefault };
    return texture;
  }

  return textureRenderer.renderBitmap(chunkResolution, chunkResolution, material, { magFilter: NearestFilter });
}

export function generateColorMap(heightMap, chunkResolution, oversample, config, returnType = 'bitmap') {
  if (!ramps) throw new Error('Ramps not yet loaded!');

  const material = new ShaderMaterial({
    fragmentShader: colorShader,
    uniforms: {
      tHeightMap: { type: 't', value: heightMap },
      tRamps: { type: 't', value: ramps },
      uOversampling: { type: 'b', value: oversample },
      uResolution: { type: 'f', value: chunkResolution },
      uSpectral: { type: 'f', value: config.spectralType },
      //uSide: { type: 'i', value: side },
    }
  });

  const textureRenderer = getTextureRenderer();
  if (returnType === 'texture') {
    const texture = textureRenderer.render(chunkResolution, chunkResolution, material);
    texture.options = { ...textureOptsDefault };
    return texture;
  }

  return textureRenderer.renderBitmap(chunkResolution, chunkResolution, material);
}

export function generateNormalMap(heightMap, chunkResolution, chunkWidth, oversample, config, returnType = 'bitmap') {
  const material = new ShaderMaterial({
    extensions: { derivatives: true },
    fragmentShader: normalShader,
    uniforms: {
      tHeightMap: { type: 't', value: heightMap },
      uChunkWidth: { type: 'f', value: chunkWidth },
      uDisplacementScale: { type: 'f', value: 2 * config.radius * config.dispWeight },
      uOversampling: { type: 'b', value: oversample },
      uResolution: { type: 'f', value: chunkResolution },
    }
  });

  const textureRenderer = getTextureRenderer();
  if (returnType === 'texture') {
    const texture = textureRenderer.render(chunkResolution, chunkResolution, material);
    texture.options = { ...textureOptsDefault };
    return texture;
  }

  return textureRenderer.renderBitmap(chunkResolution, chunkResolution, material);
}

export function generateEmissiveMap(chunkParams, emissiveParams, returnType = 'bitmap') {
  const material = new ShaderMaterial({
    fragmentShader: resourceShader,
    uniforms: {
      uChunkOffset: { type: 'v2', value: chunkParams.chunkOffset },
      uChunkSize: { type: 'f', value: chunkParams.chunkSize },
      uExtraPasses: { type: 'i', value: chunkParams.extraPasses },
      uExtraPassesMax: { type: 'i', value: chunkParams.extraPassesMax },
      uOversampling: { type: 'b', value: chunkParams.oversample },
      uResolution: { type: 'f', value: chunkParams.chunkResolution },
      uTransform: { type: 'mat4', value: chunkParams.cubeTransform },
      uAbundance: { type: 'f', value: emissiveParams.abundance },
      uOctaves: { type: 'i', value: emissiveParams.octaves },
      uPolyParams: { type: 'fv1', value: emissiveParams.polyParams },
      uPolyLimit: { type: 'f', value: emissiveParams.polyLimit },
      uPers: { type: 'f', value: emissiveParams.persistence },
      uPointScale: { type: 'f', value: emissiveParams.pointScale },
      uPointShift: { type: 'v3', value: emissiveParams.pointShift }
    }
  });

  const textureRenderer = getTextureRenderer();

  if (returnType === 'texture') {
    const texture = textureRenderer.render(chunkParams.chunkResolution, chunkParams.chunkResolution, material);
    texture.options = { ...textureOptsDefault };
    return texture;
  }

  return textureRenderer.renderBitmap(
    chunkParams.chunkResolution, chunkParams.chunkResolution, material, { magFilter: NearestFilter }
  );
}

export function rebuildChunkGeometry({ config, edgeStrides, minHeight, offset, resolution, stretch, width }) {
  const radius = config.radius;
  const undisplacedHeight = minHeight;
  const resolutionPlusOne = resolution + 1;
  const half = width / 2;

  // "+ 1" to avoid seams from rounding differences and z-fighting
  // TODO: is this still necessary? with shadows on, it actually makes seams worse
  const stitchingBias = 1;

  const _P = new Vector3();
  const _S = new Vector3();
  const positions = new Float32Array(resolutionPlusOne * resolutionPlusOne * 3);
  const normals = new Float32Array(resolutionPlusOne * resolutionPlusOne * 3);
  for (let x = 0; x < resolutionPlusOne; x++) {
    const xp = width * x / resolution - half;
    for (let y = 0; y < resolutionPlusOne; y++) {
      const yp = width * y / resolution - half;

      let midStride = false;
      const strideEW = (x === resolution && edgeStrides.E > 1) ? edgeStrides.E : (
        (x === 0 && edgeStrides.W > 1) ? edgeStrides.W : 1
      );
      const strideNS = (y === resolution && edgeStrides.N > 1) ? edgeStrides.N : (
        (y === 0 && edgeStrides.S > 1) ? edgeStrides.S : 1
      );

      // handle stitching on EW
      if (strideEW > 1) {
        const stride = strideEW;
        const strideMod = y % stride;
        // if (debug) console.log(`${debug}: ${x},${y}: x-edge ${strideMod}/${stride}`);
        if (strideMod > 0) {
          midStride = true;

          // set _P to stride-start point, set _S to stride-end point, then lerp between
          const strideMult = width * stride / resolution;
          _P.set(
            xp,
            Math.floor(y / stride) * strideMult - half,
            radius
          );
          _P.add(offset);
          _P.setLength(undisplacedHeight + stitchingBias);

          _S.set(
            xp,
            Math.ceil(y / stride) * strideMult - half,
            radius
          );
          _S.add(offset);
          _S.setLength(undisplacedHeight + stitchingBias);

          _P.lerp(_S, strideMod / stride);
        }
      } else if (strideNS > 1) {
        const stride = strideNS;
        const strideMod = x % stride;

        if (strideMod > 0) {
          midStride = true;

          // set _P to stride-start point, set _S to stride-end point, then lerp between
          const strideMult = width * stride / resolution;
          _P.set(
            Math.floor(x / stride) * strideMult - half,
            yp,
            radius
          );
          _P.add(offset);
          _P.setLength(undisplacedHeight + stitchingBias);

          _S.set(
            Math.ceil(x / stride) * strideMult - half,
            yp,
            radius
          );
          _S.add(offset);
          _S.setLength(undisplacedHeight + stitchingBias);

          _P.lerp(_S, strideMod / stride);
        }
      }

      // handle all other points
      if (!midStride) {
        _P.set(xp, yp, radius);
        _P.add(offset);
        _P.setLength(undisplacedHeight);
      }

      const outputIndex = 3 * (resolutionPlusOne * x + y);
      normals[outputIndex + 0] = _P.x;
      normals[outputIndex + 1] = _P.y;
      normals[outputIndex + 2] = _P.z;

      _P.multiply(stretch);
      positions[outputIndex + 0] = _P.x;
      positions[outputIndex + 1] = _P.y;
      positions[outputIndex + 2] = _P.z;
    }
  }

  return { normals, positions };
}

export function getMinChunkSize(radius) {
  return MIN_CHUNK_SIZE / Math.max(1, 6 - Math.round(Math.log10(radius)))
};

// extra passes added based on resolution of chunk and zoom level of chunk
// i.e. at low user settings, (resolution / CHUNK_RESOLUTION) - 1 is 0, at high is 3
// i.e. each zoom level adds a pass
export function getExtraPasses(chunkSize, resolution) {
  return Math.ceil(Math.log2(1 / chunkSize) + (resolution / CHUNK_RESOLUTION) - 1)
};

export function rebuildChunkEmissiveMap({ config, emissiveParams, groupMatrix, offset, resolution, width }) {
  const localToWorld = groupMatrix;
  const chunkSize = width / (2 * config.radius);
  const chunkOffset = offset.clone().multiplyScalar(1 / config.radius);
  const resolutionPlusOne = resolution + 1;
  const textureResolution = OVERSAMPLE_CHUNK_TEXTURES ? resolutionPlusOne + 2 : resolutionPlusOne;
  const textureSize = OVERSAMPLE_CHUNK_TEXTURES ? chunkSize * (1 + 2 / resolution) : chunkSize;
  return emissiveParams && generateEmissiveMap(
    {
      cubeTransform: localToWorld,
      chunkSize: textureSize,
      chunkOffset,
      chunkResolution: textureResolution,
      extraPasses: getExtraPasses(chunkSize, resolution),
      extraPassesMax: getExtraPasses(getMinChunkSize(config.radius) / (2 * config.radius), resolution) - 1,
      oversample: OVERSAMPLE_CHUNK_TEXTURES
    },
    emissiveParams
  );
}

export function rebuildChunkMaps({ config, edgeStrides, emissiveParams, groupMatrix, offset, resolution, width }) {
  const localToWorld = groupMatrix;
  const chunkSize = width / (2 * config.radius);
  const chunkOffset = offset.clone().multiplyScalar(1 / config.radius);

  const resolutionPlusOne = resolution + 1;
  const textureResolution = OVERSAMPLE_CHUNK_TEXTURES ? resolutionPlusOne + 2 : resolutionPlusOne;
  const textureSize = OVERSAMPLE_CHUNK_TEXTURES ? chunkSize * (1 + 2 / resolution) : chunkSize;

  const heightBitmap = generateHeightMap(
    localToWorld,
    textureSize,
    chunkOffset,
    textureResolution,
    edgeStrides,
    OVERSAMPLE_CHUNK_TEXTURES,
    config
  );

  const heightTexture = heightBitmap.image ? heightBitmap : new CanvasTexture(heightBitmap);

  // (both color and normal maps are built from height map data, so do not need to separately
  //  stitch color and normal maps since they are built from the stitched height map values)
  const colorBitmap = generateColorMap(heightTexture, textureResolution, OVERSAMPLE_CHUNK_TEXTURES, config);
  const normalBitmap = generateNormalMap(
    heightTexture, textureResolution, textureSize * (2 * config.radius), OVERSAMPLE_CHUNK_TEXTURES, config
  );

  const emissiveBitmap = rebuildChunkEmissiveMap({ config, emissiveParams, groupMatrix, offset, resolution, width });

  // done with interim data textures
  heightTexture.dispose();

  return { heightBitmap, colorBitmap, normalBitmap, emissiveBitmap };
}

export function applyDisplacementToGeometry(geometry, resolution, radius, stretch, { displacementMap, displacementBias, displacementScale }) {
  const resolutionPlusOne = resolution + 1;
  const positions = geometry.getAttribute('position').array;

  const displacementData = getTextureRenderer().textureToDataBuffer(displacementMap);
  if (!displacementData) return;

  const _P = new Vector3();
  const osAdd = OVERSAMPLE_CHUNK_TEXTURES ? 1 : 0;
  const osResolution = resolutionPlusOne + (OVERSAMPLE_CHUNK_TEXTURES ? 2 : 0);
  for (let x = 0; x < resolutionPlusOne; x++) {
    for (let y = 0; y < resolutionPlusOne; y++) {
      const positionIndex = 3 * (resolutionPlusOne * x + y);
      const textureIndex = 4 * (osResolution * (y + osAdd) + (x + osAdd));
      const displacementTextureValue = (displacementData[textureIndex + 0] + displacementData[textureIndex + 1] / 255) / 256;

      _P.set(
        positions[positionIndex + 0],
        positions[positionIndex + 1],
        positions[positionIndex + 2],
      );

      // TODO (enhancement): stretch is applied when geometry initialized, in displacement map, and here
      //  (that's why this divide is necessary)... does the geometry initialization require it?
      _P.divide(stretch);
      _P.setLength(radius + displacementTextureValue * displacementScale + displacementBias);
      _P.multiply(stretch);

      positions[positionIndex + 0] = _P.x;
      positions[positionIndex + 1] = _P.y;
      positions[positionIndex + 2] = _P.z;
    }
  }

  // update geometry
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.attributes.position.needsUpdate = true;
}

export function transformStretch(stretch, side) {
  if ([0,1].includes(side)) {
    return new Vector3(stretch.x, stretch.z, stretch.y);
  } else if ([2,3].includes(side)) {
    return new Vector3(stretch.z, stretch.y, stretch.x);
  }
  return stretch.clone();
}

const GEO_ATTR_CACHE = {};
export function getCachedGeometryAttributes(resolution) {
  // using cache since these should be same for every chunk
  if (!GEO_ATTR_CACHE[resolution]) {
    const resolutionPlusOne = resolution + 1;

    // init uv's
    // NOTE: could probably flip y in these UVs instead of in every shader
    const uvs = new Float32Array(resolutionPlusOne * resolutionPlusOne * 2);
    for (let x = 0; x < resolutionPlusOne; x++) {
      for (let y = 0; y < resolutionPlusOne; y++) {
        const outputIndex = (resolutionPlusOne * x + y) * 2;
        if (OVERSAMPLE_CHUNK_TEXTURES) {
          uvs[outputIndex + 0] = (x + 1.5) / (resolutionPlusOne + 2);
          uvs[outputIndex + 1] = (y + 1.5) / (resolutionPlusOne + 2);
          // (alternative):
          // uvs[outputIndex + 0] = (x + 1.0) / (resolution + 2);
          // uvs[outputIndex + 1] = (y + 1.0) / (resolution + 2);
        } else {
          uvs[outputIndex + 0] = (x + 0.5) / resolutionPlusOne;
          uvs[outputIndex + 1] = (y + 0.5) / resolutionPlusOne;
          // (alternative):
          // uvs[outputIndex + 0] = x / resolution;
          // uvs[outputIndex + 1] = y / resolution;
        }
      }
    }

    // init indices
    const indices = new Uint32Array(resolution * resolution * 3 * 2);
    for (let i = 0; i < resolution; i++) {
      for (let j = 0; j < resolution; j++) {
        const outputIndex = (resolution * i + j) * 6;
        indices[outputIndex + 0] = i * resolutionPlusOne + j;
        indices[outputIndex + 1] = (i + 1) * resolutionPlusOne + j + 1;
        indices[outputIndex + 2] = i * resolutionPlusOne + j + 1;
        indices[outputIndex + 3] = (i + 1) * resolutionPlusOne + j;
        indices[outputIndex + 4] = (i + 1) * resolutionPlusOne + j + 1;
        indices[outputIndex + 5] = i * resolutionPlusOne + j;
      }
    }

    GEO_ATTR_CACHE[resolution] = { uvs, indices };
  }
  return GEO_ATTR_CACHE[resolution];
}


/* DEBUGGING HELPERS (drop into rebuildChunkMaps):
  // (output data)
  if (debug) {
    const t = generateHeightMap(
      localToWorld,
      textureSize,
      chunkOffset,
      textureResolution,
      edgeStrides,
      OVERSAMPLE_CHUNK_TEXTURES,
      config,
      'texture'
    );

    // height
    const tx = [];
    for (let y = 0; y < textureResolution; y++) {
      tx[y] = [];
      for (let x = 0; x < textureResolution; x++) {
        const outputIndex = 4 * (textureResolution * y + x);
        const height = (t.buffer[outputIndex + 0] + t.buffer[outputIndex + 1] / 255) / 256;
        tx[y][x] = height.toFixed(3);
      }
    }
    console.log(tx.map((xx) => xx.join('\t')).join('\n'));
  }

  // (draw texture)
  if (debug) {
    const debugBitmap = generateNormalMap(
      heightTexture,
      textureResolution,
      OVERSAMPLE_CHUNK_TEXTURES,
      config,
      {
        cubeTransform: localToWorld,
        chunkSize: textureSize,
        chunkOffset,
        side
      }
    );
    const canvas = document.getElementById('test_canvas');
    if (!!canvas) {
      canvas.style.height = `${debugBitmap.height}px`;
      canvas.style.width = `${debugBitmap.width}px`;
      canvas.style.zoom = 300 / debugBitmap.width;
      const ctx = canvas.getContext('bitmaprenderer');
      ctx.transferFromImageBitmap(debugBitmap);
    } else {
      console.log('#test_canvas not found!');
    }
  }
*/