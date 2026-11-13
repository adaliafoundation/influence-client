/** @jest-environment node */
import { Vector3 } from 'three';
import { reachableSections, selectSection } from './reach';

const state = {
  originIndex: 1,
  patch: {
    radius: 10000,
    sites: [0, 0.1, 0.2].map((angle, i) => ({
      index: i + 1,
      normal: new Vector3(Math.sin(angle), 0, Math.cos(angle))
    }))
  },
  cells: [],
  history: []
};
const lotsByLayer = (layers) => layers.map((layer) => layer.map(({ lot }) => lot));

it('starts at the origin and opens the first ring and one deeper slice after drilling', () => {
  expect(lotsByLayer(reachableSections(state))).toEqual([[1], [], [], [], []]);
  const layers = reachableSections({ ...state, cells: [[1, 1, 0, 0]] });
  expect(lotsByLayer(layers)).toEqual([[1, 2], [1, 2], [], [], []]);
  expect(selectSection(layers, 1, 3)).toEqual({
    depth: 1, selected: { lot: 1, depth: 1 }, source: 0
  });
});

it('opens deep sideways options without exposing shallow tiles or collapsed routes', () => {
  const layers = reachableSections({
    ...state,
    cells: [[1, 2, 3, 1]],
    history: [{ event: 2, sourceLot: 2, sourceDepth: 3, lot: 3, depth: 4 }]
  });
  expect(layers[0]).toEqual([]);
  expect(layers[1]).toEqual([]);
  expect(layers[3].find(({ lot }) => lot === 3).sources).toEqual([0]);
  expect(layers[4].some(({ lot }) => lot === 3)).toBe(false);
  expect(layers[4].some(({ lot }) => lot === 2)).toBe(true);
});

it('automatically selects the closest valid bore, including vertical distance', () => {
  const current = {
    ...state,
    cells: [[1, 1, 0, 1], [1, 2, 1, 1]],
    history: []
  };
  const layers = reachableSections(current);
  const target = layers[0].find(({ lot }) => lot === 2);
  expect(target.sources).toEqual([1, 0]);
  expect(selectSection(layers, 0, 2).source).toBe(1);

  const blocked = reachableSections({
    ...current,
    history: [{ event: 2, sourceLot: 2, sourceDepth: 1, lot: 2, depth: 0 }]
  });
  expect(selectSection(blocked, 0, 2).source).toBe(0);
});

it('breaks equal-distance ties consistently by sample index', () => {
  const layers = reachableSections({
    ...state,
    cells: [[1, 2, 0, 1], [1, 2, 2, 1]]
  });
  expect(selectSection(layers, 1, 2).source).toBe(0);
});
