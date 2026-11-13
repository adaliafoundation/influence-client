import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3 } from 'three';
import { createTerrainPresentation } from './terrainPresentation';

it('restores terrain properties, includes late LOD chunks, and leaves other meshes alone', () => {
  const root = new Group(),
    terrain = new Mesh(
      new PlaneGeometry(100, 100, 24, 24),
      new MeshBasicMaterial({ opacity: 0.75, alphaTest: 0.5 })
    );
  terrain.userData.isAsteroidTerrain = true;
  terrain.userData.terrainResolution = 24;
  const originalIndex = terrain.geometry.index;
  const compile = jest.fn();
  terrain.material.onBeforeCompile = compile;
  const originalProgramKey = terrain.material.customProgramCacheKey;

  const icon = new Mesh(undefined, new MeshBasicMaterial());
  const face = new Group();
  face.rotation.x = Math.PI / 2;
  face.add(terrain);
  root.rotation.y = 0.7;
  root.position.set(100000, 200000, 300000);
  root.add(face, icon);
  const site = { index: 1, normal: new Vector3(0, 0, 1) };
  const presentation = createTerrainPresentation({
    sites: [site],
    boundarySites: [site]
  });
  presentation.update(root);
  expect(terrain.material.wireframe).toBe(false);
  expect(terrain.material.transparent).toBe(false);
  expect(terrain.material.alphaTest).toBe(0.5);
  expect(terrain.material.opacity).toBe(0.75);
  const shader = {
    uniforms: {},
    vertexShader: '#include <project_vertex>',
    fragmentShader: '#include <clipping_planes_fragment>'
  };
  terrain.material.onBeforeCompile(shader);
  expect(compile).toHaveBeenCalled();
  expect(shader.vertexShader).toContain(
    'localToProspecting * vec4(transformed, 1.0)'
  );
  expect(shader.fragmentShader).toContain('if (cut > 0.5) discard');
  expect(shader.uniforms.prospectingSeeds.value[0].w).toBe(1);
  presentation.setVisibleLots([]);
  expect(shader.uniforms.prospectingSeeds.value[0].w).toBe(0);
  presentation.setVisibleLots([1]);
  expect(shader.uniforms.prospectingSeeds.value[0].w).toBe(1);
  const transformed = new Vector3(0, 1, 0).applyMatrix4(
    shader.uniforms.localToProspecting.value
  );
  expect(transformed.distanceTo(new Vector3(0, 0, 1))).toBeLessThan(1e-8);
  expect(terrain.material.customProgramCacheKey()).toContain(
    'prospecting-cutaway'
  );
  expect(terrain.geometry.index).toBe(originalIndex);
  expect(terrain.material.depthWrite).toBe(true);
  expect(icon.material.wireframe).toBe(false);
  const late = terrain.clone();
  late.material = new MeshBasicMaterial();
  late.geometry = terrain.geometry.clone();
  root.add(late);
  presentation.update(root);
  expect(late.material.opacity).toBe(1);
  presentation.restore();
  expect(terrain.geometry.index).toBe(originalIndex);
  expect(terrain.material.onBeforeCompile).toBe(compile);
  expect(terrain.material.customProgramCacheKey).toBe(originalProgramKey);
  expect(terrain.material.opacity).toBe(0.75);
  expect(terrain.material.alphaTest).toBe(0.5);
  expect(terrain.material.wireframe).toBe(false);
  expect(terrain.material.depthWrite).toBe(true);
  expect(late.material.opacity).toBe(1);
  expect(late.material.transparent).toBe(false);
  [terrain, late, icon].forEach((mesh) => {
    mesh.geometry.dispose();
    mesh.material.dispose();
  });
});
