import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  // DoubleSide,
  Float32BufferAttribute,
  LessDepth,
  Mesh,
  MeshDepthMaterial,
  MeshStandardMaterial,
  NearestFilter,
  RGBADepthPacking,
  Vector2
} from 'three';

import constants from '~/lib/constants';
import { addSkirtVertices, getSkirtLayout } from './TerrainSkirts';
import {
  applyDisplacementToGeometry,
  getCachedGeometryAttributes,
  transformStretch
} from './TerrainChunkUtils';

const { SHADOWLESS_NORMAL_SCALE } = constants;

class TerrainChunk {
  constructor(params, config, { materialOverrides, shadowsEnabled, resolution, skirtsEnabled = false }) {
    this._skirtsEnabled = skirtsEnabled;
    this._params = params;
    this._config = config;
    this._materialOverrides = materialOverrides;
    this._shadowsEnabled = shadowsEnabled;
    this._resolution = resolution;
    this.updateDerived();

    // init geometry
    this._geometry = new BufferGeometry();
    this.initGeometry();

    // init material
    const extraMaterialProps = {};
    if (!shadowsEnabled) {
      extraMaterialProps.normalScale = new Vector2(SHADOWLESS_NORMAL_SCALE, SHADOWLESS_NORMAL_SCALE);
    } else {
      // extraMaterialProps.shadowSide = DoubleSide;
      extraMaterialProps.alphaTest = 0.5; // TODO: this may not be needed
    }

    const materialProps = {
      color: 0xffffff,
      depthFunc: LessDepth,
      displacementBias: -1 * this._config.radius * this._config.dispWeight,
      displacementScale: 2 * this._config.radius * this._config.dispWeight,
      dithering: true,
      metalness: 0,
      roughness: 1,
      // wireframe: true,
      // transparent: true, opacity: 0.9,
      ...extraMaterialProps
    }
    if (this._materialOverrides) {
      Object.keys(this._materialOverrides).forEach((k) => materialProps[k] = this._materialOverrides[k]);
    }

    this._material = new MeshStandardMaterial(materialProps);

    // initialize mesh
    this._plane = new Mesh(this._geometry, this._material);

    // add customDepthMaterial
    if (shadowsEnabled) {
      this._plane.castShadow = true;
      this._plane.receiveShadow = true;

      // TODO: this looks better without depthPacking, but might be because not visible at all
      this._plane.customDepthMaterial = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
    }

    // add onBeforeCompile's
    this.applyOnBeforeCompile();
  }

  closeTextureImage(texture) {
    try {
      if (typeof ImageBitmap !== 'undefined' && texture?.image instanceof ImageBitmap) {
        texture.image.close();
      }
    } catch (e) {
      // ignore ImageBitmap close failures; disposal still releases the WebGL texture
    }
  }

  disposeTexture(texture) {
    if (!texture) return;
    this.closeTextureImage(texture);
    texture.dispose();
  }

  disposeMaterialTexture(key) {
    this.disposeTexture(this._material[key]);
    this._material[key] = null;
  }

  getReusableCanvasTexture(key, bitmap, options = {}) {
    const texture = this._material[key];

    if (texture?.userData?.terrainChunkMap === key) {
      this.closeTextureImage(texture);
      texture.image = bitmap;
      Object.keys(options).forEach((k) => texture[k] = options[k]);
      texture.needsUpdate = true;
      return texture;
    }

    const nextTexture = new CanvasTexture(bitmap);
    nextTexture.userData.terrainChunkMap = key;
    Object.keys(options).forEach((k) => nextTexture[k] = options[k]);
    nextTexture.needsUpdate = true;
    return nextTexture;
  }

  updateMaterialTexture(key, source, options = {}) {
    const previous = this._material[key];
    const hadTexture = !!previous;
    let nextTexture = null;

    if (source) {
      if (source.isTexture) {
        nextTexture = source;
      } else {
        nextTexture = this.getReusableCanvasTexture(key, source, options);
      }
    }

    if (previous !== nextTexture) {
      if (previous?.userData?.terrainChunkMap !== key || nextTexture?.userData?.terrainChunkMap !== key) {
        this.disposeTexture(previous);
      }
      this._material[key] = nextTexture;
    }

    return hadTexture !== !!nextTexture;
  }

  getOnBeforeCompile(material, updateVNormal = true) {
    const uniforms = this._terrainUniforms;
    const skirtsEnabled = this._skirtsEnabled;
    return function (shader) {
      shader.uniforms.uRadius = uniforms.uRadius;
      shader.uniforms.uStretch = uniforms.uStretch;
      if (skirtsEnabled) shader.uniforms.uSkirtDepth = uniforms.uSkirtDepth;
      shader.vertexShader = `
        ${skirtsEnabled ? 'attribute float skirt; uniform float uSkirtDepth;' : ''}
        uniform float uRadius;
        uniform vec3 uStretch;
        ${shader.vertexShader.replace(
          '#include <displacementmap_vertex>',
          `#ifdef USE_DISPLACEMENTMAP
            vec2 disp16 = texture2D(displacementMap, vDisplacementMapUv).xy;
            float disp = (disp16.x * 255.0 + disp16.y) / 256.0;
            // set height along normal (which is set to spherical position)
            transformed = normalize(objectNormal) * (uRadius + disp * displacementScale + displacementBias);
            ${skirtsEnabled ? 'transformed -= normalize(objectNormal) * skirt * uSkirtDepth;' : ''}
            // stretch according to config
            transformed *= uStretch;
            // re-init pre-normalmap normal to match stretched position (b/f application of normalmap)
            ${updateVNormal ? 'vNormal = normalize( normalMatrix * vec3(transformed.xyz) );' : ''}
          #endif`
        )}
      `;
      material.userData.shader = shader;
    };
  }

  applyOnBeforeCompile() {
    this._material.onBeforeCompile = this.getOnBeforeCompile(
      this._material
    );
    this._material.customProgramCacheKey = () => `${this._material.onBeforeCompile.toString()}:skirts=${this._skirtsEnabled}`;
    if (this._plane.customDepthMaterial) {
      this._plane.customDepthMaterial.customProgramCacheKey = () => `${this._plane.customDepthMaterial.onBeforeCompile.toString()}:skirts=${this._skirtsEnabled}`;
      this._plane.customDepthMaterial.onBeforeCompile = this.getOnBeforeCompile(
        this._plane.customDepthMaterial,
        false
      );
    }
  }

  // it's possible in a race-condition that a chunk is constructed but never rendered
  // and is thus somehow compiled without onBeforeCompile ever running... these chunks
  // are not reusable and should be disposed
  isReusable() {
    return !!this._material?.userData?.shader
      && (!this._shadowsEnabled || !!this._plane?.customDepthMaterial?.userData?.shader);
  }

  // NOTE: if limit resource pooling to by side, these updates aren't necessary BUT uniforms
  //  are sent either way, so it probably doesn't matter
  updateDerived() {
    this._stretch = transformStretch(this._config.stretch, this._params.side);

    // Warmup can compile multiple output variants. Keep their uniforms shared
    // so reusing a chunk updates every variant, including the depth material.
    if (!this._terrainUniforms) {
      this._terrainUniforms = { uRadius: { value: 0 }, uStretch: { value: null } };
    }
    if (this._skirtsEnabled) {
      if (!this._terrainUniforms.uSkirtDepth) this._terrainUniforms.uSkirtDepth = { value: 0 };
      this._terrainUniforms.uSkirtDepth.value = Math.min(this._config.radius * 0.25, this._params.width * 0.1);
    }
    this._terrainUniforms.uRadius.value = this._config.radius;
    this._terrainUniforms.uStretch.value = this._stretch;
  }

  reconfigure(newParams) {
    this._params = newParams;
    this.updateDerived();
  }

  attachToGroup() {
    this._params.group.add(this._plane);
  }

  detachFromGroup() {
    this._params.group.remove(this._plane);
  }

  dispose() {
    this.detachFromGroup();
    
    this._geometry.dispose();

    if (this._plane.customDepthMaterial) this._plane.customDepthMaterial.dispose();

    // textures do not automatically get disposed by material.dispose
    this.disposeMaterialTexture('displacementMap');
    this.disposeMaterialTexture('emissiveMap');
    this.disposeMaterialTexture('map');
    this.disposeMaterialTexture('normalMap');
    this._material.dispose();
  }

  hide() {
    this._plane.visible = false;
  }

  show() {
    if (!this._plane.visible) {
      this._plane.visible = true;
    }
  }

  initGeometry() {
    // update geometry
    let attr = getCachedGeometryAttributes(this._resolution);
    if (this._skirtsEnabled) {
      this._skirtLayout = getSkirtLayout(this._resolution, attr);
      attr = this._skirtLayout;
      this._geometry.setAttribute('skirt', new BufferAttribute(attr.skirt, 1));
    }
    this._geometry.setIndex(new BufferAttribute(attr.indices, 1));
    this._geometry.setAttribute('uv', new Float32BufferAttribute(attr.uvs, 2));
    this._geometry.attributes.uv.needsUpdate = true;
  }

  updateGeometry(positions, normals) {
    if (this._skirtsEnabled) {
      ({ positions, normals } = addSkirtVertices(
        positions, normals, this._skirtLayout, this._terrainUniforms.uSkirtDepth.value, this._stretch
      ));
    }

    // update positions (these are already stretched so not culled inappropriately)
    this._geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    this._geometry.attributes.position.needsUpdate = true;

    // update normals (these are unstretched so displacement map can displace, then stretch)
    this._geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    this._geometry.attributes.normal.needsUpdate = true;

    // if reusing geometry (i.e. by resource pooling), then must re-compute bounding sphere or else
    // chunk will be culled by camera as-if in prior position
    this._geometry.computeBoundingSphere();
  }

  updateMaps(data) {
    // Map sources can be worker-built ImageBitmaps or fallback Texture instances.
    let materialNeedsUpdate = false;
    materialNeedsUpdate = this.updateMaterialTexture(
      'displacementMap',
      data.heightBitmap,
      { magFilter: NearestFilter },
    ) || materialNeedsUpdate;
    materialNeedsUpdate = this.updateMaterialTexture(
      'map',
      data.colorBitmap,
    ) || materialNeedsUpdate;
    materialNeedsUpdate = this.updateMaterialTexture(
      'normalMap',
      data.normalBitmap,
    ) || materialNeedsUpdate;

    this._material.color.setHex(0xffffff);
    this._material.emissive.setHex(0x000000);
    this._material.emissiveIntensity = 0;
    materialNeedsUpdate = this.updateMaterialTexture('emissiveMap', null) || materialNeedsUpdate;

    if (this._params.emissiveParams && data.emissiveBitmap) {
      this._material.color.setHex(0x222222); // darker modulation for color map so light doesn't wash out emissivity map
      this._material.emissive.set(this._params.emissiveParams.color);
      materialNeedsUpdate = this.updateMaterialTexture(
        'emissiveMap',
        data.emissiveBitmap,
      ) || materialNeedsUpdate;
      this._material.emissiveIntensity = 0.05 * (this._params.emissiveParams.intensityMult || 1);
    }

    if (this._materialOverrides) {
      this._material.setValues(this._materialOverrides);
    }
    if (materialNeedsUpdate) {
      this._material.needsUpdate = true;
    }
  }

  getMesh() {
    return this._plane;
  }

  getTextures() {
    return ['displacementMap', 'map', 'normalMap', 'emissiveMap']
      .map((key) => this._material[key])
      .filter(Boolean);
  }

  makeExportable() {
    applyDisplacementToGeometry(
      this._geometry,
      this._resolution,
      this._config.radius,
      this._stretch,
      {
        displacementMap: this._material.displacementMap,
        displacementBias: this._material.displacementBias,
        displacementScale: this._material.displacementScale,
      }
    );

    // compute accurate normals since displacement now in geometry data
    this._geometry.computeVertexNormals();
    this._geometry.attributes.normal.needsUpdate = true;

    // flip color map, remove displacement and normal maps since now in geometry data
    this._material.map.flipY = false;
    this._material.map.needsUpdate = true;
    this._material.setValues({ displacementMap: null, normalMap: null });
    this._material.needsUpdate = true;
  }
}

export default TerrainChunk;
