import { Box2, DoubleSide, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Vector2, Vector3 } from 'three';

// Sample displaced terrain in asteroid-local space, without mutating the live meshes.
// Only bake chunks intersected by the patch, and reuse each bake for all its vertices.
export function createTerrainSurface(root) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const material = new MeshBasicMaterial({ side: DoubleSide });
  const chunks = [];
  const baked = new Map();
  const heights = new Map();
  const raycaster = new Raycaster();
  root.traverseVisible((object) => {
    if (!object.userData.isAsteroidTerrain) return;
    const mesh = new Mesh(object.geometry, material);
    mesh.matrixWorld.copy(new Matrix4().multiplyMatrices(inverse, object.matrixWorld));
    const bounds = new Box2();
    const positions = object.geometry.getAttribute('position');
    const count = (object.userData.terrainResolution + 1) ** 2;
    for (let i = 0; i < count; i++) {
      bounds.expandByPoint(new Vector2(positions.getX(i) / positions.getZ(i), positions.getY(i) / positions.getZ(i)));
    }
    chunks.push({ object, mesh, bounds, inverse: mesh.matrixWorld.clone().invert() });
  });
  return {
    height(direction) {
      const key = direction.toArray().map((n) => n.toFixed(10)).join(',');
      if (heights.has(key)) return heights.get(key);
      raycaster.set(new Vector3(), direction);
      // Cube-face angular bounds avoid ray-testing every triangle of every chunk.
      const candidates = chunks.filter(({ bounds, inverse }) => {
        const local = direction.clone().transformDirection(inverse);
        return local.z > 0 && bounds.containsPoint(new Vector2(local.x / local.z, local.y / local.z));
      });
      const hits = candidates.flatMap(({ object, mesh, bounds, inverse }) => {
        if (!baked.has(object)) {
          const surface = new Mesh(object.userData.createSurfaceGeometry(), material);
          surface.matrixWorld.copy(mesh.matrixWorld);
          baked.set(object, surface);
        }
        const surface = baked.get(object);
        const local = direction.clone().transformDirection(inverse);
        const resolution = object.userData.terrainResolution;
        const x = Math.min(resolution - 1, Math.max(0, Math.floor((local.x / local.z - bounds.min.x) / (bounds.max.x - bounds.min.x) * resolution)));
        const y = Math.min(resolution - 1, Math.max(0, Math.floor((local.y / local.z - bounds.min.y) / (bounds.max.y - bounds.min.y) * resolution)));
        const hits = [];
        // Terrain is a regular cube-face grid. Test the intersected quad and
        // its neighbors (LOD stitching can shift an edge), rather than the whole chunk.
        for (let i = Math.max(0, x - 1); i <= Math.min(resolution - 1, x + 1); i++) {
          surface.geometry.setDrawRange((i * resolution + Math.max(0, y - 1)) * 6,
            (Math.min(resolution - 1, y + 1) - Math.max(0, y - 1) + 1) * 6);
          hits.push(...raycaster.intersectObject(surface));
        }
        return hits;
      });
      if (!hits.length) throw new Error('Prospecting surface is outside the loaded terrain');
      const height = Math.max(...hits.map((hit) => hit.distance));
      heights.set(key, height);
      return height;
    },
    dispose() {
      baked.forEach((mesh) => mesh.geometry.dispose());
      material.dispose();
    }
  };
}
