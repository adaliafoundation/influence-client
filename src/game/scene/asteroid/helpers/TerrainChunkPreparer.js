import { BufferGeometry, Camera, Mesh, MeshBasicMaterial, Scene, SRGBColorSpace, WebGLRenderTarget } from 'three';
import terrainPerformance from '~/lib/terrainPerformance';

// A zero-count draw uploads attributes and indices through Three's public render
// path without drawing terrain or moving its mesh out of the live scene.
class TerrainChunkPreparer {
  constructor() {
    this.scene = new Scene();
    this.camera = new Camera();
    this.emptyGeometry = new BufferGeometry();
    this.material = new MeshBasicMaterial();
    this.mesh = new Mesh(this.emptyGeometry, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    this.target = new WebGLRenderTarget(1, 1, { colorSpace: SRGBColorSpace });
  }

  prepare(mesh, renderer, camera, scene) {
    const geometry = mesh.geometry;
    const { start, count } = geometry.drawRange;
    const target = renderer.getRenderTarget();
    const cubeFace = renderer.getActiveCubeFace();
    const mipLevel = renderer.getActiveMipmapLevel();
    const autoReset = renderer.info.autoReset;
    const xrEnabled = renderer.xr.enabled;
    try {
      renderer.info.autoReset = false;
      renderer.xr.enabled = false;
      renderer.setRenderTarget(this.target);
      geometry.setDrawRange(0, 0);
      this.mesh.geometry = geometry;
      const uploadStartedAt = terrainPerformance.start();
      renderer.render(this.scene, this.camera);
      terrainPerformance.finish('geometry buffer warmup CPU', uploadStartedAt);

      // Compile for the offscreen postprocessing path and the current target
      // (which may be the canvas when postprocessing is disabled).
      const compileStartedAt = terrainPerformance.start();
      renderer.compile(mesh, camera, scene);
      renderer.setRenderTarget(target, cubeFace, mipLevel);
      renderer.compile(mesh, camera, scene);
      terrainPerformance.finish('material warmup CPU', compileStartedAt);
    } finally {
      geometry.setDrawRange(start, count);
      this.mesh.geometry = this.emptyGeometry;
      renderer.setRenderTarget(target, cubeFace, mipLevel);
      renderer.info.autoReset = autoReset;
      renderer.xr.enabled = xrEnabled;
    }
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
    this.emptyGeometry.dispose();
  }
}

export default TerrainChunkPreparer;
