import { Quaternion, Vector3 } from 'three';

const TRAVEL_FRACTION = 0.35;
const VISIBLE_FRACTION = 0.03;
const smoothstep = (t) => t * t * (3 - 2 * t);
const hermite = (a, b, slopeA, slopeB, t) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * a + (t3 - 2 * t2 + t) * slopeA
    + (-2 * t3 + 3 * t2) * b + (t3 - t2) * slopeB;
};

// Shared only for the selected asteroid's point-marker transition; no React
// state updates are needed for each animation frame.
export const asteroidZoomVisual = {
  asteroidId: null, active: false, completed: false, direction: null, pointOpacity: 1
};

export function getZoomPointOpacity(zoomStatus, asteroidId, transition) {
  if (zoomStatus === 'in') return 0;
  if (zoomStatus === 'out') return 1;
  // Animation completion and React's status commit need not occur in the same
  // frame. Keep the final opacity until the destination status is observed.
  if (transition.asteroidId === asteroidId && transition.direction === zoomStatus
    && (transition.active || transition.completed)) return transition.pointOpacity;
  return zoomStatus === 'zooming-in' ? 1 : 0;
}

export function zoomDistance(start, end, radius, fov, progress) {
  if (progress <= 0) return start;
  if (progress >= 1) return end;
  if (start === end) return start;
  const far = Math.max(start, end);
  const near = Math.min(start, end);
  const t = start > end ? progress : 1 - progress;
  const threshold = radius * Math.sqrt(1 + 1 / (VISIBLE_FRACTION * Math.tan(fov * Math.PI / 360)) ** 2);
  if (far <= threshold) return 1 / ((1 - smoothstep(t)) / far + smoothstep(t) / near);
  if (near >= threshold) return Math.exp(Math.log(far) + smoothstep(t) * Math.log(near / far));

  const logFar = Math.log(far);
  const logThreshold = Math.log(threshold);
  const pThreshold = 1 / threshold;
  const pNear = 1 / near;
  // Match derivatives across the join, with monotone slopes on both segments.
  const speed = Math.min(
    pThreshold * (logFar - logThreshold) / TRAVEL_FRACTION,
    (pNear - pThreshold) / (1 - TRAVEL_FRACTION)
  );
  if (t < TRAVEL_FRACTION) {
    return Math.exp(hermite(logFar, logThreshold, 0,
      -speed / pThreshold * TRAVEL_FRACTION, t / TRAVEL_FRACTION));
  }
  return 1 / hermite(pThreshold, pNear, speed * (1 - TRAVEL_FRACTION), 0,
    (t - TRAVEL_FRACTION) / (1 - TRAVEL_FRACTION));
}

export function pointOpacityForDistance(distance, radius, fov) {
  const fraction = radius / (Math.max(distance, radius) * Math.tan(fov * Math.PI / 360));
  return 1 - smoothstep(Math.max(0, Math.min(1, (fraction - 0.002) / 0.02)));
}

export function createAsteroidZoomPath({ center, start, end, radius, fov, centerOnArrival = false }) {
  const toVector = (v) => new Vector3(v.x, v.y, v.z);
  const startScene = toVector(start.scene);
  // Entry targets the asteroid itself, not a scene offset cached before terrain
  // loading. Exit still restores the exact saved system-view transform.
  const endScene = centerOnArrival ? center.clone().negate() : toVector(end.scene);
  const startPosition = toVector(start.position);
  const endPosition = toVector(end.position);
  const startFocus = center.clone().add(startScene);
  const endFocus = centerOnArrival ? new Vector3() : center.clone().add(endScene);
  const startRay = startPosition.clone().sub(startFocus);
  const endRay = endPosition.clone().sub(endFocus);
  const startDistance = startRay.length();
  const endDistance = endRay.length();
  startRay.normalize();
  endRay.normalize();
  const rotation = new Quaternion().setFromUnitVectors(startRay, endRay);
  const startUp = toVector(start.up).normalize();
  const endUp = toVector(end.up).normalize();
  const upRotation = new Quaternion().setFromUnitVectors(startUp, endUp);
  const scaledStartFocus = startFocus.divideScalar(startDistance);
  const scaledEndFocus = endFocus.divideScalar(endDistance);
  const q = new Quaternion();
  const focus = new Vector3();
  const ray = new Vector3();

  return (progress, camera, targetScene, currentCenter = center) => {
    if (progress <= 0 || progress >= 1) {
      const atEnd = progress >= 1;
      camera.position.copy(atEnd ? endPosition : startPosition);
      camera.up.copy(atEnd ? endUp : startUp);
      targetScene.position.copy(atEnd ? endScene : startScene);
      if (centerOnArrival) {
        if (atEnd) targetScene.position.copy(currentCenter).negate();
        else targetScene.position.add(center).sub(currentCenter);
      }
      return atEnd ? endDistance : startDistance;
    }
    const t = smoothstep(progress);
    const distance = zoomDistance(startDistance, endDistance, radius, fov, progress);
    // Interpolate framing in distance-normalized coordinates. Interpolating
    // astronomical scene translations directly would swamp the visible approach.
    focus.lerpVectors(scaledStartFocus, scaledEndFocus, t).multiplyScalar(distance);
    q.identity().slerp(rotation, t);
    ray.copy(startRay).applyQuaternion(q).multiplyScalar(distance);
    camera.position.copy(focus).add(ray);
    targetScene.position.copy(focus).sub(centerOnArrival ? currentCenter : center);
    q.identity().slerp(upRotation, t);
    camera.up.copy(startUp).applyQuaternion(q);
    return distance;
  };
}
