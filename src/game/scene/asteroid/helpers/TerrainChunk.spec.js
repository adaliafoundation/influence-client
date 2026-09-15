import TerrainChunk from './TerrainChunk';

jest.mock('~/lib/constants', () => ({}), { virtual: true });
jest.mock('./TerrainChunkUtils', () => ({ transformStretch: (stretch, side) => ({ stretch, side }) }));

it('updates every compiled shader variant when a pooled chunk changes sides', () => {
  const chunk = Object.create(TerrainChunk.prototype);
  chunk._config = { radius: 100, stretch: [1, 2, 3] };
  chunk._params = { side: 0 };
  chunk.updateDerived();
  const compile = chunk.getOnBeforeCompile({ userData: {} });
  const shaders = Array.from({ length: 2 }, () => ({ uniforms: {}, vertexShader: '#include <displacementmap_vertex>' }));
  shaders.forEach(compile);
  chunk.reconfigure({ side: 3 });
  shaders.forEach((shader) => {
    expect(shader.uniforms.uStretch.value.side).toBe(3);
    expect(shader.uniforms.uRadius.value).toBe(100);
  });
  expect(shaders[0].uniforms.uStretch).toBe(shaders[1].uniforms.uStretch);
});

it('subtracts skirt depth after height displacement in both surface and shadow shaders', () => {
  const chunk = Object.create(TerrainChunk.prototype);
  chunk._skirtsEnabled = true;
  chunk._config = { radius: 100, stretch: [1, 1, 1] };
  chunk._params = { side: 0, width: 50 };
  chunk.updateDerived();
  [true, false].forEach((surface) => {
    const shader = { uniforms: {}, vertexShader: '#include <displacementmap_vertex>' };
    chunk.getOnBeforeCompile({ userData: {} }, surface)(shader);
    expect(shader.vertexShader).toContain('transformed -= normalize(objectNormal) * skirt * uSkirtDepth;');
    expect(shader.uniforms.uSkirtDepth.value).toBe(5);
  });
  chunk.reconfigure({ side: 1, width: 100 });
  expect(chunk._terrainUniforms.uSkirtDepth.value).toBe(10);
});
