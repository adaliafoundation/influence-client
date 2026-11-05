import { Matrix4, Vector4 } from 'three';

// Three reuses each material’s shader uniforms when reopening the same variant.
const cutUniforms = new WeakMap();

export function createTerrainPresentation(patch) {
  const originals = new Map();
  const transforms = new Map();
  const inverseRoot = new Matrix4();
  const visible = new Set(patch.sites.map((site) => site.index));
  const seeds = patch.boundarySites.map(
    (site) =>
      new Vector4(
        site.normal.x,
        site.normal.y,
        site.normal.z,
        visible.has(site.index) ? 1 : 0
      )
  );
  const cutaway = `
    vec3 direction = normalize(vProspectingPosition);
    float nearest = -2.0;
    float cut = 0.0;
    for (int i = 0; i < ${seeds.length}; i++) {
      float proximity = dot(direction, prospectingSeeds[i].xyz);
      if (proximity > nearest) {
        nearest = proximity;
        cut = prospectingSeeds[i].w;
      }
    }
    if (cut > 0.5) discard;
  `;
  const apply = (material, transform) => {
    if (!material || originals.has(material)) return;
    const props = {
      onBeforeCompile: material.onBeforeCompile,
      customProgramCacheKey: material.customProgramCacheKey
    };
    originals.set(material, props);
    const key = material.customProgramCacheKey();
    const variant = `${key}:prospecting-cutaway-v2:${seeds.length}`;
    if (!cutUniforms.has(material)) cutUniforms.set(material, new Map());
    const variants = cutUniforms.get(material);
    if (!variants.has(variant)) {
      variants.set(variant, { prospectingSeeds: {}, localToProspecting: {} });
    }
    const uniforms = variants.get(variant);
    uniforms.prospectingSeeds.value = seeds;
    uniforms.localToProspecting.value = transform;
    material.onBeforeCompile = function (shader, renderer) {
      props.onBeforeCompile.call(this, shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      // Terrain chunks live in rotated cube-face groups; compare in the lot coordinate system.
      shader.vertexShader =
        'varying vec3 vProspectingPosition; uniform mat4 localToProspecting;\n' +
        shader.vertexShader.replace(
          '#include <project_vertex>',
          'vProspectingPosition = (localToProspecting * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>'
        );
      shader.fragmentShader =
        `varying vec3 vProspectingPosition;
        uniform vec4 prospectingSeeds[${seeds.length}];\n` +
        shader.fragmentShader.replace(
          '#include <clipping_planes_fragment>',
          '#include <clipping_planes_fragment>\n' + cutaway
        );
    };
    material.customProgramCacheKey = () => variant;
    material.needsUpdate = true;
  };
  return {
    setVisibleLots(lots) {
      const visibleLots = new Set(lots);
      patch.boundarySites.forEach((site, i) => {
        seeds[i].w = visibleLots.has(site.index) ? 1 : 0;
      });
    },
    update(root) {
      root.updateWorldMatrix(true, true);
      inverseRoot.copy(root.matrixWorld).invert();
      root.traverse((object) => {
        if (!object.userData.isAsteroidTerrain) return;
        if (!transforms.has(object)) transforms.set(object, new Matrix4());
        const transform = transforms.get(object);
        transform.multiplyMatrices(inverseRoot, object.matrixWorld);
        apply(object.material, transform);
        apply(object.customDepthMaterial, transform);
      });
    },
    restore() {
      originals.forEach((props, material) => {
        Object.assign(material, props, { needsUpdate: true });
      });
      originals.clear();
      transforms.clear();
    }
  };
}
