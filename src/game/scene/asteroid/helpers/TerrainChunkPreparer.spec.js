import { BufferGeometry, Mesh, MeshBasicMaterial } from 'three';
import TerrainChunkPreparer from './TerrainChunkPreparer';

jest.mock('~/lib/terrainPerformance', () => require('../../../../lib/terrainPerformance'), { virtual: true });

it.each([false, true])('restores geometry and renderer state after warmup (failure: %s)', (fail) => {
  const preparer = new TerrainChunkPreparer();
  const geometry = new BufferGeometry();
  geometry.setDrawRange(6, 30);
  const mesh = new Mesh(geometry, new MeshBasicMaterial());
  const parent = mesh.parent;
  const target = {};
  const renderer = {
    getRenderTarget: () => target,
    getActiveCubeFace: () => 2,
    getActiveMipmapLevel: () => 1,
    setRenderTarget: jest.fn(),
    info: { autoReset: true },
    xr: { enabled: true },
    render: jest.fn(() => {
      expect(geometry.drawRange).toEqual({ start: 0, count: 0 });
      expect(preparer.mesh.geometry).toBe(geometry);
      if (fail) throw new Error('test render failure');
    }),
    compile: jest.fn()
  };
  try {
    let errorMessage = null;
    try {
      preparer.prepare(mesh, renderer, {}, {});
    } catch (error) {
      errorMessage = error.message;
    }
    expect(errorMessage).toBe(fail ? 'test render failure' : null);
    expect(renderer.compile).toHaveBeenCalledTimes(fail ? 0 : 2);
    expect(geometry.drawRange).toEqual({ start: 6, count: 30 });
    expect(mesh.parent).toBe(parent);
    expect(preparer.mesh.geometry).toBe(preparer.emptyGeometry);
    expect(renderer.setRenderTarget).toHaveBeenLastCalledWith(target, 2, 1);
    expect(renderer.info.autoReset).toBe(true);
    expect(renderer.xr.enabled).toBe(true);
  } finally {
    preparer.dispose();
    geometry.dispose();
    mesh.material.dispose();
  }
});
