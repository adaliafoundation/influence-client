/** @jest-environment node */
import { Asteroid } from '@influenceth/sdk';
import { Vector3 } from 'three';
import { buildPatch, prismEdges, prismGeometry, excavationGeometry, DEPTHS, SURFACE_INSET, FLOOR_CLEARANCE } from './geometry';

it.each([13, 10000, 1768484])(
  'builds bounded cells at actual SDK lot positions for %i lots',
  (tally) => {
    const index = Math.min(50, tally),
      radius = Math.sqrt(tally / (4 * Math.PI)) * 1000;
    const positions = new Float32Array(tally * 3);
    const indices = [
      index,
      ...Asteroid.getClosestLots({
        centerLot: index,
        lotTally: tally,
        findTally: Math.min(tally - 1, 169)
      })
    ];
    indices.forEach((i) =>
      positions.set(
        new Vector3(...Asteroid.getLotPosition(0, i, tally))
          .setLength(radius)
          .toArray(),
        (i - 1) * 3
      )
    );
    const patch = buildPatch(index, positions, tally);
    expect(patch.sites.some((s) => s.index === index)).toBe(true);
    patch.sites.forEach((site) => {
      const polygon = patch.cells.get(site.index);
      expect(polygon.length).toBeGreaterThanOrEqual(3);
      expect(
        polygon.every((v) =>
          patch.sites.every(
            (other) => v.dot(site.normal) >= v.dot(other.normal) - 1e-8
          )
        )
      ).toBe(true);
      expect(polygon.every((v) => v.toArray().every(Number.isFinite))).toBe(
        true
      );
    });
    const vertex = patch.cells.get(index)[0];
    DEPTHS.forEach((bottom) => {
      expect(
        patch
          .surface(vertex, bottom - 100)
          .distanceTo(patch.surface(vertex, bottom))
      ).toBeCloseTo(100, 5);
      expect(
        patch.surface(vertex, 0).length() -
          patch.surface(vertex, bottom).length()
      ).toBeCloseTo(bottom, 5);
    });
    const geometry = prismGeometry(
      patch.cells.get(index),
      patch.surface,
      0,
      100
    );
    expect(
      Array.from(geometry.attributes.position.array).every(Number.isFinite)
    ).toBe(true);
    geometry.dispose();
    const excavation = excavationGeometry(patch);
    const points = excavation.attributes.position;
    expect(Array.from(points.array).every(Number.isFinite)).toBe(true);
    const floorPoint = new Vector3().fromBufferAttribute(points, 0);
    expect(patch.surface(floorPoint.clone().normalize(), 500 + SURFACE_INSET + FLOOR_CLEARANCE).distanceTo(floorPoint)).toBeLessThan(0.1);
    excavation.dispose();
  }
);

it('outlines terrain-following contours without drawing triangulation or extra uprights', () => {
  const corners = [new Vector3(-1, -1, 5), new Vector3(1, -1, 5), new Vector3(1, 1, 5), new Vector3(-1, 1, 5)].map((v) => v.normalize());
  const polygon = corners.flatMap((a, i) => [a, a.clone().add(corners[(i + 1) % 4]).normalize()]);
  const surface = (direction, depth) => direction.clone().multiplyScalar(1000 - depth);
  const edges = prismEdges(polygon, surface, SURFACE_INSET, SURFACE_INSET + 100);
  // Two eight-segment rings, four corner uprights, two vertices per segment.
  expect(edges.attributes.position.count).toBe(40);
  edges.dispose();
});
