import { Asteroid } from '@influenceth/sdk';
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';

export const SURFACE_INSET = 25;
export const FLOOR_CLEARANCE = 2;
export const REACH = 3500;
export const DEPTHS = [100, 200, 300, 400, 500];
export const surfaceDistance = (a, b, radius) => a.angleTo(b) * radius;

// Spherical bisectors keep cells disjoint even when a small asteroid's whole
// surface fits inside campaign reach. The outer candidate ring is not drawn.
export function sphericalCell(site, sites, maxAngle = 0.12) {
  const neighbors = sites
    .filter((s) => s.index !== site.index)
    .sort(
      (a, b) => site.normal.angleTo(a.normal) - site.normal.angleTo(b.normal)
    )
    .slice(0, 16);
  const planes = neighbors.map((s) => site.normal.clone().sub(s.normal));
  const vertices = [];
  for (let i = 0; i < planes.length; i++)
    for (let j = i + 1; j < planes.length; j++) {
      const cross = new Vector3().crossVectors(planes[i], planes[j]);
      if (cross.lengthSq() < 1e-18) continue;
      cross.normalize();
      for (const sign of [1, -1]) {
        const vertex = cross.clone().multiplyScalar(sign);
        const score = vertex.dot(site.normal);
        if (
          sites.every((s) => score >= vertex.dot(s.normal) - 1e-9) &&
          !vertices.some((v) => v.distanceToSquared(vertex) < 1e-16)
        )
          vertices.push(vertex);
      }
    }
  const east = new Vector3()
    .crossVectors(
      Math.abs(site.normal.y) < 0.95
        ? new Vector3(0, 1, 0)
        : new Vector3(1, 0, 0),
      site.normal
    )
    .normalize();
  const north = new Vector3().crossVectors(site.normal, east).normalize();
  vertices.sort(
    (a, b) =>
      Math.atan2(a.dot(north), a.dot(east)) -
      Math.atan2(b.dot(north), b.dot(east))
  );
  const polygon = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i],
      b = vertices[(i + 1) % vertices.length];
    const steps = Math.max(1, Math.ceil(a.angleTo(b) / maxAngle));
    for (let j = 0; j < steps; j++)
      polygon.push(
        a
          .clone()
          .lerp(b, j / steps)
          .normalize()
      );
  }
  return polygon;
}

export function buildPatch(originIndex, positions, lotTally, terrainHeight) {
  const point = (index) => new Vector3().fromArray(positions, (index - 1) * 3);
  const origin = point(originIndex),
    normal = origin.clone().normalize(),
    radius = origin.length();
  const east = new Vector3()
    .crossVectors(
      Math.abs(normal.y) < 0.95 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0),
      normal
    )
    .normalize();
  const north = new Vector3().crossVectors(normal, east).normalize();
  const indices = [
    originIndex,
    ...Asteroid.getClosestLots({
      centerLot: originIndex,
      lotTally,
      findTally: Math.min(lotTally - 1, 169)
    })
  ];
  const sites = indices.map((index) => {
    const position = point(index),
      unit = position.clone().normalize();
    const tangent = unit
      .clone()
      .addScaledVector(normal, -unit.dot(normal))
      .normalize();
    const distance = surfaceDistance(normal, unit, radius);
    return {
      index,
      normal: unit,
      x: tangent.dot(east) * distance,
      z: tangent.dot(north) * distance,
      height: position.length(),
      distance
    };
  });
  const visible = sites.filter((s) => s.distance <= REACH);
  const cells = new Map(
    visible.map((site) => [site.index, sphericalCell(site, sites, Math.min(0.12, 100 / radius))])
  );
  // A shared radial interpolation gives identical heights on shared boundaries.
  const surface = (direction, depth) => {
    if (terrainHeight) return direction.clone().multiplyScalar(terrainHeight(direction) - depth);
    const near = sites
      .map((s) => ({ s, d: s.normal.distanceTo(direction) * radius }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
    const weights = near.map((v) => 1 / Math.max(1, v.d) ** 2);
    const height =
      near.reduce((sum, v, i) => sum + v.s.height * weights[i], 0) /
      weights.reduce((a, b) => a + b, 0);
    return direction.clone().multiplyScalar(height - depth);
  };
  return {
    origin,
    radius,
    sites: visible,
    boundarySites: sites,
    cells,
    surface
  };
}

export function prismGeometry(polygon, surface, top, bottom) {
  const vertices = [];
  const upper = polygon.map((v) => surface(v, top)),
    lower = polygon.map((v) => surface(v, bottom));
  const center = polygon
    .reduce((sum, v) => sum.add(v), new Vector3())
    .normalize();
  const centerTop = surface(center, top),
    centerBottom = surface(center, bottom);
  const triangle = (a, b, c) =>
    vertices.push(...a.toArray(), ...b.toArray(), ...c.toArray());
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    triangle(centerTop, upper[i], upper[j]);
    triangle(centerBottom, lower[j], lower[i]);
    triangle(upper[i], lower[i], lower[j]);
    triangle(upper[i], lower[j], upper[j]);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// Close the excavation at its deepest layer and along its outer boundary.
export function excavationGeometry(patch, depth = DEPTHS.length - 1) {
  const vertices = [];
  const edges = new Map();
  const bottom = SURFACE_INSET + DEPTHS[depth] + FLOOR_CLEARANCE;
  const key = (v) =>
    v
      .toArray()
      .map((n) => n.toFixed(7))
      .join(',');
  const triangle = (a, b, c) =>
    vertices.push(...a.toArray(), ...b.toArray(), ...c.toArray());
  for (const polygon of patch.cells.values()) {
    const center = polygon
      .reduce((sum, v) => sum.add(v), new Vector3())
      .normalize();
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i],
        b = polygon[(i + 1) % polygon.length];
      triangle(
        patch.surface(center, bottom),
        patch.surface(a, bottom),
        patch.surface(b, bottom)
      );
      const edgeKey = [key(a), key(b)].sort().join('|');
      const edge = edges.get(edgeKey);
      if (edge) edge.count++;
      else edges.set(edgeKey, { a, b, count: 1 });
    }
  }
  for (const { a, b, count } of edges.values()) {
    if (count !== 1) continue;
    const upperA = patch.surface(a, 0),
      upperB = patch.surface(b, 0);
    const lowerA = patch.surface(a, bottom),
      lowerB = patch.surface(b, bottom);
    triangle(upperA, lowerA, lowerB);
    triangle(upperA, lowerB, upperB);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// Draw only cell contours and true corners, not the terrain triangulation.
export function prismEdges(polygon, surface, top, bottom) {
  const vertices = [];
  const segment = (a, b) => vertices.push(...a.toArray(), ...b.toArray());
  for (let i = 0; i < polygon.length; i++) {
    const previous = polygon[(i + polygon.length - 1) % polygon.length];
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    segment(surface(a, top), surface(b, top));
    segment(surface(a, bottom), surface(b, bottom));
    const incoming = new Vector3().crossVectors(previous, a).normalize();
    const outgoing = new Vector3().crossVectors(a, b).normalize();
    if (incoming.dot(outgoing) < 0.99999) segment(surface(a, top), surface(a, bottom));
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  return geometry;
}
