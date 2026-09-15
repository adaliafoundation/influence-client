import { Quaternion, Vector3 } from 'three';

// Lift scales with surface travel, with a cap for trips around the far side.
const ARC_LIFT_PER_RADIAN = 0.5;
const MAX_ARC_LIFT = 0.75;
const CLOSE_TRIP_ANGLE = 0.15;
const CLOSE_TRIP_LIFT_REDUCTION = 0.25;

export function createLotCameraPath({ start, end, radius, stretch, rotationAxis, rotation, displacement }) {
  const from = start.clone();
  const to = end.clone();
  const direction = from.clone().normalize();
  const endDirection = to.clone().normalize();
  const turn = new Quaternion().setFromUnitVectors(direction, endDirection);
  const angle = direction.angleTo(endDirection);
  const proximity = Math.min(1, angle / CLOSE_TRIP_ANGLE);
  // Soften nearby hops, smoothly returning to the full arc for longer routes.
  const liftScale = 1 - CLOSE_TRIP_LIFT_REDUCTION * (1 - proximity * proximity * (3 - 2 * proximity));
  const lift = radius * Math.min(MAX_ARC_LIFT, ARC_LIFT_PER_RADIAN * angle) * liftScale;
  const q = new Quaternion();
  const surfaceDirection = new Vector3();
  const surfaceHeight = (ray) => {
    surfaceDirection.copy(ray).applyAxisAngle(rotationAxis, -rotation).divide(stretch);
    return radius / surfaceDirection.length();
  };
  const startHeight = from.length();
  const endHeight = to.length();
  const startClearance = startHeight - surfaceHeight(direction);
  const endClearance = endHeight - surfaceHeight(endDirection);
  const midpoint = direction.clone().applyQuaternion(q.identity().slerp(turn, 0.5));
  const usualApex = Math.max(endHeight, surfaceHeight(midpoint) + endClearance) + lift * (1 + displacement);
  const apex = Math.max(startHeight, usualApex);

  return (progress, position) => {
    if (progress <= 0) return position.copy(from);
    if (progress >= 1) return position.copy(to);
    const t = progress * progress * (3 - 2 * progress);
    q.identity().slerp(turn, t);
    position.copy(direction).applyQuaternion(q);
    const envelope = Math.sin(Math.PI * t);
    // Meet the apex halfway through the flight. Starting above the usual apex
    // holds altitude through the first half instead of adding another climb.
    const endpointHeight = t < 0.5 ? startHeight : endHeight;
    const flightHeight = endpointHeight + (apex - endpointHeight) * envelope;
    const terrainHeight = surfaceHeight(position) + startClearance * (1 - t) + endClearance * t;
    return position.multiplyScalar(Math.max(flightHeight, terrainHeight));
  };
}
