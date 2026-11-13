/** @jest-environment node */
import { Vector3 } from 'three';
import { adjacentVeinCells, buildVeinGeometry } from './veinGeometry';

const polygon = (left, right, bottom = -0.1, top = 0.1) =>
  [[left, bottom], [right, bottom], [right, top], [left, top]]
    .map(([x, y]) => new Vector3(x, y, 1).normalize());
const patch = {
  cells: new Map([
    [1, polygon(-0.1, 0)],
    [2, polygon(0, 0.1)],
    [3, polygon(0.1, 0.2)],
    [4, polygon(-0.2, -0.1, 0.1, 0.2)]
  ]),
  surface: (direction, depth) => direction.clone().multiplyScalar(10000 - depth)
};
const cell = (lot, depth = 0, grade = 1) => [1, lot, depth, grade];
const dispose = (network) => [...network.nodes, ...network.links].forEach(({ geometry }) => geometry.dispose());

it('joins face neighbors, excluding corner touches and diagonal depth moves', () => {
  expect(adjacentVeinCells(cell(1), cell(2), patch)).toBe(true);
  expect(adjacentVeinCells(cell(1), cell(3), patch)).toBe(false);
  expect(adjacentVeinCells(cell(1), cell(4), patch)).toBe(false);
  expect(adjacentVeinCells(cell(1), cell(1, 1), patch)).toBe(true);
  expect(adjacentVeinCells(cell(1), cell(2, 1), patch)).toBe(false);
  expect(adjacentVeinCells(cell(1), cell(1, 2), patch)).toBe(false);
});

it('keeps discovered shapes stable as the network expands and hides barren sections', () => {
  const original = buildVeinGeometry([cell(1)], patch, 'campaign');
  const expanded = buildVeinGeometry([cell(2), cell(1), cell(3, 0, 0)], patch, 'campaign');
  const repeat = buildVeinGeometry([cell(1), cell(2)], patch, 'campaign');
  const changedSeed = buildVeinGeometry([cell(1)], patch, 'other-campaign');
  expect(expanded.nodes).toHaveLength(2);
  expect(expanded.links).toHaveLength(1);
  expect(expanded.nodes[0].geometry.attributes.position.array).toEqual(original.nodes[0].geometry.attributes.position.array);
  expect(expanded.links[0].geometry.attributes.position.array).toEqual(repeat.links[0].geometry.attributes.position.array);
  expect(changedSeed.nodes[0].geometry.attributes.position.array).not.toEqual(original.nodes[0].geometry.attributes.position.array);
  for (const piece of [...expanded.nodes, ...expanded.links]) {
    expect(Array.from(piece.geometry.attributes.position.array).every(Number.isFinite)).toBe(true);
    expect(piece.geometry.attributes.normal.count).toBe(piece.geometry.attributes.position.count);
    expect(piece.geometry.attributes.uv.count).toBe(piece.geometry.attributes.position.count);
    expect(piece.geometry.attributes.color.count).toBe(piece.geometry.attributes.position.count);
  }
  [original, expanded, repeat, changedSeed].forEach(dispose);
});
