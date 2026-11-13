import { CatmullRomCurve3, Color, Float32BufferAttribute, IcosahedronGeometry, TubeGeometry, Vector3 } from 'three';
import { SURFACE_INSET } from './geometry';

const pointKey = (point) => point.toArray().map((n) => n.toFixed(6)).join(',');
const cellKey = (cell) => `${cell[1]}:${cell[2]}`;
const gradeColor = (grade) => new Color([null, '#36a7cd', '#88e675', '#faaf42'][grade]);

function random(seed) {
  let state = 2166136261;
  for (const character of seed) state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

// Only join face neighbors: a shared Voronoi edge on one layer, or one vertical step.
export function adjacentVeinCells(a, b, patch) {
  if (a[1] === b[1]) return Math.abs(a[2] - b[2]) === 1;
  if (a[2] !== b[2]) return false;
  const boundary = new Set(patch.cells.get(a[1]).map(pointKey));
  return patch.cells.get(b[1]).filter((point) => boundary.has(pointKey(point))).length >= 2;
}

function tube(points, radius, seed, startColor, endColor, normal) {
  const draw = random(seed);
  const curve = new CatmullRomCurve3(points);
  const geometry = new TubeGeometry(curve, 24, radius, 12, false);
  const position = geometry.attributes.position;
  const colors = [];
  const phase = draw() * Math.PI * 2;
  for (let ring = 0; ring <= 24; ring++) {
    const t = ring / 24;
    const center = curve.getPointAt(t);
    const width = 0.85 + 0.12 * Math.sin(t * 13 + phase) + 0.06 * Math.sin(t * 29 + phase);
    for (let side = 0; side <= 12; side++) {
      const index = ring * 13 + side;
      const angle = side / 12 * Math.PI * 2;
      const irregularity = width * (1 + 0.1 * Math.sin(angle * 3 + t * 9 + phase));
      const offset = new Vector3().fromBufferAttribute(position, index).sub(center);
      // Flatten the seam along the local radial direction into a mineral ribbon.
      const radial = offset.dot(normal);
      offset.addScaledVector(normal, -radial * 0.65);
      const vertex = offset.multiplyScalar(irregularity).add(center);
      position.setXYZ(index, vertex.x, vertex.y, vertex.z);
      const color = startColor.clone().lerp(endColor, t)
        .multiplyScalar(0.72 + 0.22 * (0.5 + 0.5 * Math.cos(angle - 0.7)));
      colors.push(color.r, color.g, color.b);
    }
  }
  // Cap the ends so isolated discoveries read as solid ore, including from above.
  const vertices = Array.from(position.array);
  const indices = Array.from(geometry.index.array);
  for (const [ring, color] of [[0, startColor], [24, endColor]]) {
    const centerIndex = vertices.length / 3;
    vertices.push(...curve.getPointAt(ring / 24).toArray());
    colors.push(color.r, color.g, color.b);
    for (let side = 0; side < 12; side++) {
      const a = ring * 13 + side;
      indices.push(centerIndex, ring === 0 ? a + 1 : a, ring === 0 ? a : a + 1);
    }
  }
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.setAttribute('uv', new Float32BufferAttribute([...geometry.attributes.uv.array, 0.5, 0.5, 0.5, 0.5], 2));
  geometry.deleteAttribute('normal');
  // Preserve the mesh's smooth shape while giving the unlit cutaway some volume.
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildVeinGeometry(cells, patch, context) {
  const nodes = cells.filter((cell) => cell[0] && cell[3]).map((cell) => {
    const key = cellKey(cell);
    const polygon = patch.cells.get(cell[1]);
    const normal = polygon.reduce((sum, point) => sum.add(point), new Vector3()).normalize();
    const center = patch.surface(normal, SURFACE_INSET + cell[2] * 100 + 50);
    const radius = Math.min(...polygon.map((point) =>
      patch.surface(point, SURFACE_INSET + cell[2] * 100 + 50).distanceTo(center)
    )) * 0.18;
    const east = new Vector3().crossVectors(normal,
      Math.abs(normal.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)).normalize();
    const north = new Vector3().crossVectors(normal, east).normalize();
    const draw = random(`${context}:${key}`);
    const angle = draw() * Math.PI * 2;
    const major = east.clone().multiplyScalar(Math.cos(angle)).addScaledVector(north, Math.sin(angle));
    const minor = new Vector3().crossVectors(normal, major).normalize();
    const geometry = new IcosahedronGeometry(1, 2);
    const position = geometry.attributes.position;
    const colors = [];
    const phase = draw() * 7;
    for (let i = 0; i < position.count; i++) {
      const v = new Vector3().fromBufferAttribute(position, i);
      const ripple = 1 + 0.16 * Math.sin(v.x * 7 + phase) * Math.cos(v.y * 5 - phase)
        + 0.08 * Math.sin(v.z * 11 + phase);
      const point = center.clone()
        .addScaledVector(major, v.x * radius * 1.5 * ripple)
        .addScaledVector(minor, v.y * radius * 0.65 * ripple)
        .addScaledVector(normal, v.z * 24 * ripple);
      position.setXYZ(i, point.x, point.y, point.z);
      const color = gradeColor(cell[3]).multiplyScalar(0.65 + 0.3 * (v.z + 1) / 2 + 0.05 * Math.sin(v.x * 15 + phase));
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return { key, cell, center, normal, radius, geometry };
  }).sort((a, b) => a.key.localeCompare(b.key));
  const links = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      if (!adjacentVeinCells(a.cell, b.cell, patch)) continue;
      const key = `${a.key}|${b.key}`;
      const draw = random(`${context}:${key}`);
      const axis = b.center.clone().sub(a.center).normalize();
      const normal = a.normal.clone().add(b.normal).normalize();
      const lateral = new Vector3().crossVectors(axis, normal);
      if (lateral.lengthSq() < 1e-8) lateral.crossVectors(axis, Math.abs(axis.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0));
      lateral.normalize();
      const points = [0, 0.25, 0.5, 0.75, 1].map((t) => {
        const point = a.center.clone().lerp(b.center, t);
        // Follow asteroid curvature instead of cutting straight through its interior.
        point.setLength(a.center.length() * (1 - t) + b.center.length() * t);
        const envelope = Math.sin(t * Math.PI);
        return point.addScaledVector(lateral, (draw() - 0.5) * Math.min(a.radius, b.radius) * envelope)
          .addScaledVector(normal, (draw() - 0.5) * 12 * envelope);
      });
      links.push({ key, cells: [a.cell, b.cell],
        geometry: tube(points, Math.min(a.radius, b.radius) * 0.65,
          `${context}:${key}:shape`, gradeColor(a.cell[3]), gradeColor(b.cell[3]), normal) });
    }
  }
  return { nodes, links };
}
