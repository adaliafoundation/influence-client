import { Vector3 } from 'three';
import { createLotCameraPath } from './LotCameraPath';

const makePath = (angle, options = {}) => {
  const radius = options.radius || 376000;
  return createLotCameraPath({
    start: new Vector3(0, 0, radius + 5000),
    end: new Vector3(Math.sin(angle), 0, Math.cos(angle)).multiplyScalar(radius + 5000),
    radius,
    stretch: new Vector3(1, 1, 1),
    rotationAxis: new Vector3(0, 1, 0),
    rotation: 0,
    displacement: 0,
    ...options
  });
};

it.each([0, 0.001, 0.8, Math.PI])('preserves arrival and departure for angle %s', (angle) => {
  const path = makePath(angle);
  expect(path(0, new Vector3()).toArray()).toEqual([0, 0, 381000]);
  const end = new Vector3(Math.sin(angle), 0, Math.cos(angle)).multiplyScalar(381000);
  expect(path(1, new Vector3()).distanceTo(end)).toBe(0);
  for (let i = 0; i <= 100; i++) {
    expect(path(i / 100, new Vector3()).length()).toBeGreaterThanOrEqual(381000 - 1e-8);
  }
});

it('starts and finishes with vanishing speed', () => {
  const path = makePath(0.8);
  const a = new Vector3();
  const b = new Vector3();
  const distance = (t1, t2) => path(t1, a).distanceTo(path(t2, b));
  expect(distance(0, 0.001)).toBeLessThan(distance(0.499, 0.5) * 0.01);
  expect(distance(0.999, 1)).toBeLessThan(distance(0.5, 0.501) * 0.01);
});

it('gives long routes a broad crest while keeping nearby hops low', () => {
  const shortHeight = makePath(0.001)(0.5, new Vector3()).length();
  const longHeight = makePath(0.8)(0.5, new Vector3()).length();
  expect(shortHeight - 381000).toBeGreaterThan(188 * 0.75);
  expect(shortHeight - 381000).toBeLessThan(188 * 0.76);
  expect(longHeight - 381000).toBeCloseTo(150400);
  expect(makePath(Math.PI)(0.5, new Vector3()).length() - 381000).toBeCloseTo(282000);
});

it('clears the bulge between endpoints on a stretched asteroid', () => {
  const stretch = new Vector3(2, 1, 1);
  const path = makePath(Math.PI, { stretch });
  const position = new Vector3();
  for (let i = 0; i <= 100; i++) {
    path(i / 100, position);
    const surfaceHeight = 376000 / position.clone().normalize().divide(stretch).length();
    expect(position.length() - surfaceHeight).toBeGreaterThanOrEqual(5000 - 1e-8);
  }
});

it('descends from an overview without changing its exact arrival altitude', () => {
  const path = makePath(0.2, { start: new Vector3(0, 0, 1e6) });
  expect(path(0, new Vector3()).length()).toBe(1e6);
  expect(path(1, new Vector3()).length()).toBeCloseTo(381000);
  expect(path(0.999, new Vector3()).distanceTo(path(1, new Vector3()))).toBeLessThan(10);
});

it.each([450000, 531400, 800000])('accounts for starting height %s without bringing the midpoint below the usual apex', (height) => {
  const path = makePath(0.8, { start: new Vector3(0, 0, height) });
  const expectedApex = Math.max(height, 531400);
  expect(path(0.5, new Vector3()).length()).toBeCloseTo(expectedApex);
  let previous = height;
  for (let i = 1; i <= 50; i++) {
    const current = path(i / 100, new Vector3()).length();
    expect(current).toBeGreaterThanOrEqual(previous - 1e-8);
    expect(current).toBeLessThanOrEqual(expectedApex + 1e-8);
    previous = current;
  }
  for (let i = 51; i <= 100; i++) {
    const current = path(i / 100, new Vector3()).length();
    expect(current).toBeLessThanOrEqual(previous + 1e-8);
    previous = current;
  }
});
