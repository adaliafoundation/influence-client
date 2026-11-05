/** @jest-environment node */
import { BufferGeometry, Float32BufferAttribute, DoubleSide, Raycaster, PlaneGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { createTerrainSurface } from './terrainSurface';

it('samples displaced ground in root space, caches bakes, and preserves live geometry', () => {
  const root = new Group();
  root.position.set(1000, -500, 300);
  root.rotation.y = 0.7;
  const chunk = new Mesh(new PlaneGeometry(10, 10), new MeshBasicMaterial());
  chunk.userData.isAsteroidTerrain = true;
  chunk.geometry.translate(0, 0, 5);
  chunk.userData.terrainResolution = 1;
  const displaced = new PlaneGeometry(12, 12);
  displaced.translate(0, 0, 6);
  const dispose = jest.spyOn(displaced, 'dispose');
  chunk.userData.createSurfaceGeometry = jest.fn(() => displaced);
  root.add(chunk);
  const surface = createTerrainSurface(root);
  expect(surface.height(new Vector3(0, 0, 1))).toBeCloseTo(6);
  expect(surface.height(new Vector3(0.1, 0, 1).normalize())).toBeCloseTo(6 * Math.sqrt(1.01));
  expect(chunk.userData.createSurfaceGeometry).toHaveBeenCalledTimes(1);
  expect(chunk.geometry.parameters.width).toBe(10);
  surface.dispose();
  expect(dispose).toHaveBeenCalledTimes(1);
  chunk.geometry.dispose();
  chunk.material.dispose();
});

it('matches full terrain raycasts across a displaced chunk, including edges', () => {
  const resolution = 32;
  const positions = [], indices = [];
  for (let x = 0; x <= resolution; x++) {
    for (let y = 0; y <= resolution; y++) {
      const height = 5 + 0.4 * Math.sin(x * 0.4) * Math.cos(y * 0.3);
      positions.push((x / resolution - 0.5) * height, (y / resolution - 0.5) * height, height);
      if (x < resolution && y < resolution) {
        const a = x * (resolution + 1) + y, b = a + resolution + 1;
        indices.push(a, b + 1, a + 1, b, b + 1, a);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const mesh = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide }));
  mesh.userData.isAsteroidTerrain = true;
  mesh.userData.terrainResolution = resolution;
  mesh.userData.createSurfaceGeometry = () => geometry.clone();
  const root = new Group();
  root.add(mesh);
  const surface = createTerrainSurface(root);
  const ray = new Raycaster();
  for (const x of [-0.499, -0.3, 0, 0.2, 0.499]) {
    for (const y of [-0.499, -0.1, 0.25, 0.499]) {
      const direction = new Vector3(x, y, 1).normalize();
      ray.set(new Vector3(), direction);
      expect(surface.height(direction)).toBeCloseTo(ray.intersectObject(mesh)[0].distance, 5);
    }
  }
  surface.dispose();
  geometry.dispose();
  mesh.material.dispose();
});
