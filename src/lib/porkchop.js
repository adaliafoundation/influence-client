import { lambert } from '@influenceth/astro';
import { GM_ADALIA } from '@influenceth/sdk';

const v3ToArray = (v3) => ([
  v3.x || v3[0],
  v3.y || v3[1],
  v3.z || v3[2],
]);

async function porkchop({ originPath, destinationPath, minDelay, maxDelay, minTof, maxTof, resolution = 1 }) {
  const lamberts = [];
  for (let delay = minDelay; delay <= maxDelay; delay += resolution) {
    const originPosition = originPath.positions[delay];
    const originVelocity = originPath.velocities[delay];
    for (let tof = minTof; tof <= maxTof; tof += resolution) {
      const destinationPosition = destinationPath.positions[delay + tof];
      const destinationVelocity = destinationPath.velocities[delay + tof];
      if (originVelocity && destinationVelocity) {
        const { deltaV } = await lambert.multiSolver(
          GM_ADALIA,
          v3ToArray(originPosition),
          v3ToArray(destinationPosition),
          tof * 86400,  // tof is in days
          v3ToArray(originVelocity),
          v3ToArray(destinationVelocity),
        );
        lamberts.push(deltaV);
      }
    }
  }
  return new Float32Array(lamberts);
}

export default porkchop;