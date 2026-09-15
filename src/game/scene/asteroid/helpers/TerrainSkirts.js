const layouts = new Map();

export function getSkirtLayout(resolution, attributes) {
  if (layouts.has(resolution)) return layouts.get(resolution);
  const stride = resolution + 1;
  const surfaceVertices = stride * stride;
  const edge = [];
  for (let x = 0; x < resolution; x++) edge.push(x * stride);
  for (let y = 0; y < resolution; y++) edge.push(resolution * stride + y);
  for (let x = resolution; x > 0; x--) edge.push(x * stride + resolution);
  for (let y = resolution; y > 0; y--) edge.push(y);

  const skirt = new Float32Array(surfaceVertices + edge.length);
  skirt.fill(1, surfaceVertices);
  const uvs = new Float32Array(skirt.length * 2);
  uvs.set(attributes.uvs);
  const indices = new Uint32Array(attributes.indices.length + edge.length * 6);
  indices.set(attributes.indices);
  edge.forEach((vertex, i) => {
    uvs.set(attributes.uvs.subarray(vertex * 2, vertex * 2 + 2), (surfaceVertices + i) * 2);
    const next = (i + 1) % edge.length;
    indices.set([
      vertex, surfaceVertices + i, edge[next],
      edge[next], surfaceVertices + i, surfaceVertices + next
    ], attributes.indices.length + i * 6);
  });
  const layout = { edge, surfaceVertices, skirt, uvs, indices };
  layouts.set(resolution, layout);
  return layout;
}

export function addSkirtVertices(positions, normals, layout, depth, stretch) {
  const nextPositions = new Float32Array(layout.skirt.length * 3);
  const nextNormals = new Float32Array(nextPositions.length);
  nextPositions.set(positions);
  nextNormals.set(normals);
  layout.edge.forEach((vertex, i) => {
    const source = vertex * 3;
    const target = (layout.surfaceVertices + i) * 3;
    const length = Math.hypot(normals[source], normals[source + 1], normals[source + 2]);
    for (let axis = 0; axis < 3; axis++) {
      nextNormals[target + axis] = normals[source + axis];
      nextPositions[target + axis] = positions[source + axis]
        - normals[source + axis] / length * depth * stretch.getComponent(axis);
    }
  });
  return { positions: nextPositions, normals: nextNormals };
}
