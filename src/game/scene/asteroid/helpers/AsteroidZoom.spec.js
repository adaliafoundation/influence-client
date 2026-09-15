import { Vector3 } from 'three';
import { createAsteroidZoomPath, getZoomPointOpacity, pointOpacityForDistance, zoomDistance } from './AsteroidZoom';

it.each([[1e12, 1e6, 376000], [1e9, 6000, 1000], [20000, 6000, 1000], [1e12, 1e10, 1000]])(
  'traverses distances monotonically and reversibly (%s to %s)', (far, near, radius) => {
    let last = far;
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const d = zoomDistance(far, near, radius, 50, t);
      expect(d).toBeLessThanOrEqual(last * (1 + 1e-12));
      expect(d).toBeGreaterThanOrEqual(near * (1 - 1e-12));
      expect(zoomDistance(near, far, radius, 50, 1 - t) / d).toBeCloseTo(1, 10);
      last = d;
    }
    expect(zoomDistance(far, near, radius, 50, 0)).toBe(far);
    expect(zoomDistance(far, near, radius, 50, 1)).toBe(near);
  }
);

it('joins travel and visible approach without a speed discontinuity', () => {
  const distance = (t) => zoomDistance(1e12, 1e6, 376000, 50, t);
  const dt = 1e-6;
  const left = (distance(0.35) - distance(0.35 - dt)) / dt;
  const right = (distance(0.35 + dt) - distance(0.35)) / dt;
  expect(left / right).toBeCloseTo(1, 3);
});

it('spends the visible approach on growth instead of astronomical travel', () => {
  const radius = 376000;
  const d = zoomDistance(1e12, 1e6, radius, 50, 0.65);
  const fraction = radius / (d * Math.tan(50 * Math.PI / 360));
  expect(fraction).toBeGreaterThan(0.2);
  expect(pointOpacityForDistance(d, radius, 50)).toBe(0);
  expect(pointOpacityForDistance(1e12, radius, 50)).toBe(1);
});

it('preserves saved endpoints and accounts for scene translation', () => {
  const center = new Vector3(1e11, -2e11, 0);
  const start = { scene: new Vector3(), position: new Vector3(0, 0, 3e11), up: new Vector3(0, 0, 1) };
  const end = { scene: center.clone().negate(), position: new Vector3(0, 0, 1e6), up: new Vector3(0, 1, 0) };
  const sample = createAsteroidZoomPath({ center, start, end, radius: 376000, fov: 50 });
  const camera = { position: new Vector3(), up: new Vector3() };
  const scene = { position: new Vector3() };
  sample(0, camera, scene);
  expect(camera.position).toEqual(start.position);
  expect(scene.position).toEqual(start.scene);
  const distance = sample(0.6, camera, scene);
  expect(camera.position.distanceTo(center.clone().add(scene.position)) / distance).toBeCloseTo(1, 8);
  expect(camera.up.length()).toBeCloseTo(1, 10);
  sample(1, camera, scene);
  expect(camera.position).toEqual(end.position);
  expect(camera.up).toEqual(end.up);
  expect(scene.position).toEqual(end.scene);
});

it('handles opposite viewing directions without passing through the asteroid', () => {
  const sample = createAsteroidZoomPath({
    center: new Vector3(), radius: 1000, fov: 50,
    start: { scene: new Vector3(), position: new Vector3(0, 0, 1e9), up: new Vector3(0, 1, 0) },
    end: { scene: new Vector3(), position: new Vector3(0, 0, -6000), up: new Vector3(0, -1, 0) }
  });
  const camera = { position: new Vector3(), up: new Vector3() };
  const scene = { position: new Vector3() };
  const distance = sample(0.5, camera, scene);
  expect(camera.position.length() / distance).toBeCloseTo(1, 10);
  expect(camera.up.length()).toBeCloseTo(1, 10);
});

it('centers entry on the live asteroid despite a stale cached target and orbital motion', () => {
  const center = new Vector3(1e11, -2e11, 3e10);
  const staleCenter = center.clone().add(new Vector3(40000, -30000, 12000));
  const destination = new Vector3(0, 0, 6000);
  const sample = createAsteroidZoomPath({
    center, centerOnArrival: true, radius: 1000, fov: 50,
    start: { scene: new Vector3(), position: new Vector3(0, 0, 4e11), up: new Vector3(0, 1, 0) },
    end: { scene: staleCenter.negate(), position: destination, up: new Vector3(0, 1, 0) }
  });
  const camera = { position: new Vector3(), up: new Vector3() };
  const scene = { position: new Vector3() };
  const currentCenter = center.clone().add(new Vector3(25000, 50000, -20000));
  const d = sample(0.999999, camera, scene, currentCenter);
  const visibleCenter = currentCenter.clone().add(scene.position);
  expect(visibleCenter.length()).toBeLessThan(0.001);
  expect(camera.position.distanceTo(visibleCenter)).toBeCloseTo(d, 3);
  expect(camera.position.distanceTo(destination)).toBeLessThan(0.001);
  sample(1, camera, scene, currentCenter);
  expect(currentCenter.clone().add(scene.position).length()).toBe(0);
  expect(camera.position).toEqual(destination);
});

it('keeps the camera-to-asteroid offset unchanged when the entry center moves', () => {
  const center = new Vector3(1e11, -2e11, 3e10);
  const sample = createAsteroidZoomPath({
    center, centerOnArrival: true, radius: 1000, fov: 50,
    start: { scene: new Vector3(), position: new Vector3(0, 0, 4e11), up: new Vector3(0, 1, 0) },
    end: { scene: center.clone().negate(), position: new Vector3(0, 0, 6000), up: new Vector3(0, 1, 0) }
  });
  const camera = { position: new Vector3(), up: new Vector3() };
  const scene = { position: new Vector3() };
  sample(0.8, camera, scene, center);
  const relative = camera.position.clone().sub(center.clone().add(scene.position));
  const moved = center.clone().add(new Vector3(200000, -500000, 0));
  sample(0.8, camera, scene, moved);
  expect(camera.position.clone().sub(moved.clone().add(scene.position)).distanceTo(relative)).toBeLessThan(0.001);
});


it.each([
  ['zooming-in', 'in', 0],
  ['zooming-out', 'out', 1]
])('holds marker opacity through the %s completion handoff', (direction, destination, opacity) => {
  const transition = { asteroidId: 1, direction, active: true, completed: false, pointOpacity: opacity };
  expect(getZoomPointOpacity(direction, 1, transition)).toBe(opacity);
  transition.active = false;
  transition.completed = true;
  expect(getZoomPointOpacity(direction, 1, transition)).toBe(opacity);
  expect(getZoomPointOpacity(destination, 1, transition)).toBe(opacity);
  transition.completed = false;
  expect(getZoomPointOpacity(destination, 1, transition)).toBe(opacity);
});

it('does not reuse a completed fade for another asteroid or direction', () => {
  const transition = { asteroidId: 1, direction: 'zooming-out', active: false, completed: true, pointOpacity: 1 };
  expect(getZoomPointOpacity('zooming-out', 2, transition)).toBe(0);
  expect(getZoomPointOpacity('zooming-in', 1, transition)).toBe(1);
  transition.direction = 'zooming-in';
  transition.pointOpacity = 0;
  transition.completed = false;
  expect(getZoomPointOpacity('zooming-in', 1, transition)).toBe(1);
});
