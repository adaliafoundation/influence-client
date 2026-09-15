import { Vector3 } from 'three';
import { getSkirtLayout, addSkirtVertices } from './TerrainSkirts';

it('adds a closed perimeter with matching UVs and valid triangles', () => {
  const resolution = 2;
  const uvs = Float32Array.from({ length: 18 }, (_, i) => i);
  const base = new Uint32Array([0, 4, 1]);
  const layout = getSkirtLayout(resolution, { indices: base, uvs });
  expect(layout.edge).toHaveLength(8);
  expect(new Set(layout.edge).size).toBe(8);
  expect(layout.skirt.length).toBe(17);
  expect(layout.indices.length).toBe(base.length + 48);
  expect(Math.max(...layout.indices)).toBeLessThan(17);
  layout.edge.forEach((vertex, i) => {
    expect(Array.from(layout.uvs.slice((9 + i) * 2, (10 + i) * 2)))
      .toEqual(Array.from(uvs.slice(vertex * 2, vertex * 2 + 2)));
  });
  expect(Array.from(layout.indices.slice(-6))).toEqual([layout.edge[7], 16, layout.edge[0], layout.edge[0], 16, 9]);
});

it('extends only perimeter vertices inward and preserves displacement directions', () => {
  const layout = getSkirtLayout(1, { indices: new Uint32Array([0, 3, 1, 2, 3, 0]), uvs: new Float32Array(8) });
  const normals = new Float32Array([0, 0, 10, 0, 0, 10, 0, 0, 10, 0, 0, 10]);
  const positions = normals.map((v) => v * 2);
  const result = addSkirtVertices(positions, normals, layout, 3, new Vector3(1, 1, 2));
  expect(Array.from(result.positions.slice(0, 12))).toEqual(Array.from(positions));
  for (let i = 4; i < 8; i++) {
    expect(result.positions[i * 3 + 2]).toBe(14);
    expect(result.normals[i * 3 + 2]).toBe(10);
  }
});
