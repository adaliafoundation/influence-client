import { Quaternion, Vector3 } from 'three';

export function lockProspectingCamera(controls, terrain, origin) {
  const camera = controls.object;
  const saved = {
    target: controls.target.clone(),
    position: camera.position.clone(),
    up: camera.up.clone(),
    near: camera.near,
    noPan: controls.noPan,
    minDistance: controls.minDistance,
    maxDistance: controls.maxDistance,
    rotateSpeed: controls.rotateSpeed,
    zoomSpeed: controls.zoomSpeed
  };
  const anchor = new Vector3();
  const previous = new Vector3();
  const previousRotation = new Quaternion();
  const rotation = new Quaternion();
  const motion = new Quaternion();
  const normal = new Vector3();
  const eye = new Vector3();
  const tangent = new Vector3();
  const before = new Vector3();
  const correction = new Quaternion();
  const locate = () => {
    terrain.updateWorldMatrix(true, false);
    return terrain.localToWorld(anchor.copy(origin));
  };
  previous.copy(locate());
  terrain.getWorldQuaternion(previousRotation);
  controls.target.copy(previous);
  controls.prospectingAnchor = true;
  camera.near = 10;
  camera.updateProjectionMatrix();

  const follow = () => {
    locate();
    terrain.getWorldQuaternion(rotation);
    motion.copy(rotation).multiply(previousRotation.clone().invert());
    camera.position.sub(previous).applyQuaternion(motion).add(anchor);
    camera.up.applyQuaternion(motion);
    previous.copy(anchor);
    previousRotation.copy(rotation);
    controls.target.copy(anchor);
    camera.lookAt(anchor);
  };
  return {
    update() {
      follow();
      controls.noPan = true;
      controls.minDistance = 100;
      controls.maxDistance = 15000;
      controls.rotateSpeed = 1;
      controls.zoomSpeed = 0.8;
    },
    constrain() {
      follow();
      normal.copy(origin).normalize().transformDirection(terrain.matrixWorld);
      eye.subVectors(camera.position, controls.target);
      const distance = eye.length();
      before.copy(eye).normalize();
      const vertical = before.dot(normal);
      const minimum = Math.cos(Math.PI / 3);
      if (vertical < minimum) {
        tangent.copy(before).addScaledVector(normal, -vertical);
        if (tangent.lengthSq() < 1e-10) tangent.copy(camera.up).cross(normal);
        tangent.normalize();
        eye
          .copy(normal)
          .multiplyScalar(minimum)
          .addScaledVector(tangent, Math.sin(Math.PI / 3));
        correction.setFromUnitVectors(before, eye);
        camera.up.applyQuaternion(correction);
        camera.position.copy(controls.target).addScaledVector(eye, distance);
        camera.lookAt(controls.target);
      }
    },
    restore() {
      controls.prospectingAnchor = false;
      controls.target.copy(saved.target);
      camera.position.copy(saved.position);
      camera.up.copy(saved.up);
      camera.near = saved.near;
      camera.updateProjectionMatrix();
      for (const key of [
        'noPan',
        'minDistance',
        'maxDistance',
        'rotateSpeed',
        'zoomSpeed'
      ]) {
        controls[key] = saved[key];
      }
      camera.lookAt(controls.target);
    }
  };
}
