import { Group, InstancedMesh, Mesh, MeshBasicMaterial, PlaneGeometry, Texture } from 'three';
import { disposeLotMeshes } from './disposeLotMeshes';

test('repeated lot rebuilds release instance buffers and shared geometry without disposing cached textures', () => {
  const parent = new Group();
  const texture = new Texture();
  const textureDisposed = jest.fn();
  texture.addEventListener('dispose', textureDisposed);

  for (let i = 0; i < 20; i++) {
    const geometry = new PlaneGeometry();
    const geometryDisposed = jest.fn();
    geometry.addEventListener('dispose', geometryDisposed);
    const meshes = [1, 2].map(() => new InstancedMesh(geometry, new MeshBasicMaterial({ map: texture }), 8));
    const instanceDisposals = meshes.map(mesh => {
      const disposed = jest.fn();
      mesh.addEventListener('dispose', disposed);
      return disposed;
    });
    const materialDisposals = meshes.map(mesh => {
      const disposed = jest.fn();
      mesh.material.addEventListener('dispose', disposed);
      return disposed;
    });
    parent.add(...meshes);

    disposeLotMeshes(meshes);

    expect(parent.children).toHaveLength(0);
    expect(geometryDisposed).toHaveBeenCalledTimes(1);
    [...instanceDisposals, ...materialDisposals].forEach(disposed => expect(disposed).toHaveBeenCalledTimes(1));
    expect(textureDisposed).not.toHaveBeenCalled();
  }
});

test('reticule cleanup releases its privately loaded texture, geometry and material', () => {
  const texture = new Texture();
  const mesh = new Mesh(new PlaneGeometry(), new MeshBasicMaterial({ map: texture }));
  const parent = new Group();
  parent.add(mesh);
  const disposed = [texture, mesh.geometry, mesh.material].map(resource => {
    const listener = jest.fn();
    resource.addEventListener('dispose', listener);
    return listener;
  });

  disposeLotMeshes([mesh], [texture]);

  expect(parent.children).toHaveLength(0);
  disposed.forEach(listener => expect(listener).toHaveBeenCalledTimes(1));
});
