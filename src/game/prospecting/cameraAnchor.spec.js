/** @jest-environment node */
import { Group, PerspectiveCamera, Vector3 } from 'three';
import { REACH } from './geometry';
import { lockProspectingCamera } from './cameraAnchor';

test('anchors to the terrain lot, follows its motion, and restores the original camera', () => {
  const terrain = new Group();
  terrain.position.set(30, 0, 0);
  const camera = new PerspectiveCamera();
  camera.position.set(0, 0, 6000);
  const controls = {
    object: camera,
    target: new Vector3(),
    noPan: false,
    minDistance: 5000,
    maxDistance: 100000,
    rotateSpeed: 0.2,
    zoomSpeed: 1.2
  };
  const originalPosition = camera.position.clone();
  const originalNear = camera.near;
  const lock = lockProspectingCamera(
    controls,
    terrain,
    new Vector3(0, 0, 4000)
  );
  lock.update();
  expect(controls.target.toArray()).toEqual([30, 0, 4000]);
  expect(camera.position.equals(originalPosition)).toBe(true);
  expect(controls.noPan).toBe(false);
  expect(controls.minDistance).toBe(100);

  const offset = camera.position.clone().sub(controls.target);
  terrain.rotation.y = 0.1;
  lock.update();
  expect(
    camera.position.clone().sub(controls.target).distanceTo(offset.clone().applyAxisAngle(new Vector3(0, 1, 0), 0.1))
  ).toBeLessThan(1e-9);
  // Motion occurring after controls update must also be applied before rendering.
  const relativeUp = camera.up.clone();
  terrain.rotation.y += 0.05;
  terrain.position.x += 10;
  lock.constrain();
  expect(camera.up.distanceTo(relativeUp.applyAxisAngle(new Vector3(0, 1, 0), 0.05))).toBeLessThan(1e-9);
  const target = controls.target.clone();
  lock.update();
  expect(controls.target.equals(target)).toBe(true);

  const normal = new Vector3(0, 0, 1).transformDirection(terrain.matrixWorld);
  camera.position.copy(controls.target).addScaledVector(normal, -2000);
  lock.constrain();
  const constrainedEye = camera.position.clone().sub(controls.target);
  expect(constrainedEye.length()).toBeCloseTo(2000);
  expect(constrainedEye.normalize().dot(normal)).toBeCloseTo(0.5);

  lock.restore();
  expect(controls.target.toArray()).toEqual([0, 0, 0]);
  expect(camera.position.equals(originalPosition)).toBe(true);
  expect(camera.near).toBe(originalNear);
  expect(controls.noPan).toBe(false);
  expect(controls.minDistance).toBe(5000);
  expect(controls.rotateSpeed).toBe(0.2);
  expect(controls.prospectingAnchor).toBe(false);
});

test('bounds panning without changing zoom, follows terrain rotation, and restores controls', () => {
  const terrain = new Group();
  const origin = new Vector3(0, 0, 4000);
  const camera = new PerspectiveCamera();
  camera.position.set(0, 0, 6000);
  const controls = {
    object: camera, target: new Vector3(), noPan: true, panTarget: false, panSpeed: 0.3,
    minDistance: 5000, maxDistance: 100000, rotateSpeed: 0.2, zoomSpeed: 1.2
  };
  const lock = lockProspectingCamera(controls, terrain, origin);
  lock.update();
  const drag = new Vector3(700, 300, 50);
  controls.target.add(drag);
  camera.position.add(drag);
  const eye = camera.position.clone().sub(controls.target);
  lock.constrain();
  expect(controls.target.toArray()).toEqual([700, 300, 4000]);
  expect(camera.position.clone().sub(controls.target).distanceTo(eye)).toBeLessThan(1e-9);
  lock.update();
  expect(controls.target.toArray()).toEqual([700, 300, 4000]);

  const excess = new Vector3(REACH * 2, 0, 0);
  controls.target.add(excess);
  camera.position.add(excess);
  lock.constrain();
  expect(controls.target.distanceTo(origin)).toBeCloseTo(REACH);
  expect(camera.position.clone().sub(controls.target).distanceTo(eye)).toBeLessThan(1e-9);

  const targetBeforeRotation = controls.target.clone();
  terrain.rotation.y = 0.2;
  lock.constrain();
  expect(controls.target.distanceTo(targetBeforeRotation.applyAxisAngle(new Vector3(0, 1, 0), 0.2))).toBeLessThan(1e-9);
  lock.restore();
  expect(controls.target.toArray()).toEqual([0, 0, 0]);
  expect(camera.position.toArray()).toEqual([0, 0, 6000]);
  expect(controls.noPan).toBe(true);
  expect(controls.panSpeed).toBe(0.3);
  expect(controls.panTarget).toBe(false);
});
