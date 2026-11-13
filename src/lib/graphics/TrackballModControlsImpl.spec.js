import { Group, PerspectiveCamera, Vector3 } from 'three';
import TrackballModControls from './TrackballModControlsImpl';

it.each([false, true])('right drag pans the scene or camera target as configured: %s', (panTarget) => {
  const element = document.createElement('canvas');
  element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000 });
  const camera = new PerspectiveCamera();
  camera.position.set(0, 0, 1000);
  const scene = new Group();
  const controls = new TrackballModControls(camera, element);
  controls.attach(scene);
  controls.panTarget = panTarget;
  const pointer = 'PointerEvent' in window;
  const dragEvent = (type, x) => {
    const event = new MouseEvent(type, { button: 2, clientX: x, clientY: 500 });
    Object.defineProperties(event, {
      pageX: { value: x }, pageY: { value: 500 }, pointerId: { value: 1 }
    });
    return event;
  };
  element.dispatchEvent(dragEvent(pointer ? 'pointerdown' : 'mousedown', 500));
  element.dispatchEvent(dragEvent(pointer ? 'pointermove' : 'mousemove', 600));
  controls.update();
  if (panTarget) {
    expect(controls.target.x).toBeCloseTo(-80);
    expect(camera.position.x).toBeCloseTo(-80);
    expect(scene.position.equals(new Vector3())).toBe(true);
    expect(camera.position.distanceTo(controls.target)).toBeCloseTo(1000);
  } else {
    expect(scene.position.x).toBeCloseTo(80);
    expect(controls.target.equals(new Vector3())).toBe(true);
    expect(camera.position.toArray()).toEqual([0, 0, 1000]);
  }
  element.dispatchEvent(dragEvent(pointer ? 'pointerup' : 'mouseup', 600));
  controls.dispose();
});
