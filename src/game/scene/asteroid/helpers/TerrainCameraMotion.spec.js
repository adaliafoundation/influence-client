import { Vector3 } from 'three';
import TerrainCameraMotion from './TerrainCameraMotion';

it('stays conservative during flights and settles after motion stops', () => {
  const tracker = new TerrainCameraMotion();
  const position = new Vector3(0, 0, 1000);
  const up = new Vector3(0, 1, 0);
  expect(tracker.update(position, up, false, 0)).toBe(true);
  expect(tracker.update(position, up, false, 150)).toBe(false);
  expect(tracker.update(position, up, true, 200)).toBe(true);
  expect(tracker.update(position, up, false, 349)).toBe(true);
  expect(tracker.update(position, up, false, 350)).toBe(false);
  position.z -= 10;
  expect(tracker.update(position, up, false, 400)).toBe(true);
  expect(tracker.update(position, up, false, 550)).toBe(false);
  up.set(1, 0, 0);
  expect(tracker.update(position, up, false, 600)).toBe(true);
});
