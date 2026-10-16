// Building textures belong to useTexture's cache. Only dispose explicitly owned textures.
export const disposeLotMeshes = (meshes, ownedTextures = []) => {
  const geometries = new Set();
  const materials = new Set();
  for (const mesh of meshes) {
    mesh.removeFromParent();
    if (mesh.isInstancedMesh) mesh.dispose();
    geometries.add(mesh.geometry);
    materials.add(mesh.material);
  }
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  new Set(ownedTextures).forEach(texture => texture.dispose());
};
