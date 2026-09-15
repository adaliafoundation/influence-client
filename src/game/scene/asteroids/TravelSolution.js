import { useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Color, Vector3 } from 'three';
import { AdalianOrbit, Crewmate } from '@influenceth/sdk';
import { cloneDeep } from 'lodash';

import { RouteInvalidIcon, RouteValidIcon } from '~/components/Icons';
import { formatBeltDistance } from '~/game/interface/hud/actionDialogs/components';
import useCoarseTime from '~/hooks/useCoarseTime';
import useCrewContext from '~/hooks/useCrewContext';
import useAsteroid from '~/hooks/useAsteroid';
import useStore from '~/hooks/useStore';
import useTravelSolutionIsValid from '~/hooks/useTravelSolutionIsValid';
import { getCrewAbilityBonuses } from '~/lib/utils';

import orbitColors from './orbit/orbitColors';
import frag from './orbit/orbit.frag';
import vert from './orbit/orbit.vert';

const RouteMarker = styled.div`
  align-items: center;
  color: #${p => orbitColors[p.color || 'main'].getHexString()};
  display: flex;
  flex-direction: column;
  position: relative;
  left: -50%;
  top: -13px;
  & > svg {
    font-size: 26px;
    margin-bottom: 2px;
  }
  & > * {
    background: rgba(0, 0, 0, 0.7);
    font-size: 90%;
    padding: 2px 4px;
    text-transform: uppercase;
    white-space: nowrap;
  }
`;
const RouteNotes = styled.div``;

const solutionPoints = 240;
const initialUniforms = {
  uTime: { type: 'i', value: 0 },
  uAlpha: { type: 'f', value: 1.0 },
  uAlphaMin: { type: 'f', value: 0 },
  uCount: { type: 'f', value: solutionPoints + 2 },
  uDash: { type: 'b', value: false }
};

const TravelSolution = ({}) => {
  const coarseTime = useCoarseTime();
  const { crew } = useCrewContext();

  const uniforms = useRef({
    ...cloneDeep(initialUniforms),
    uCol: { type: 'c', value: new Color(0x000000) },
  });

  const destinationId = useStore(s => s.asteroids.destination);
  const originId = useStore(s => s.asteroids.origin);
  const timeOverride = useStore(s => s.timeOverride);

  const { data: destination } = useAsteroid(destinationId);
  const { data: origin } = useAsteroid(originId);
  const travelSolutionIsValid = useTravelSolutionIsValid();

  const [baseTime, setBaseTime] = useState();
  const [order, setOrder] = useState();
  const [prearrival, setPrearrival] = useState();
  const [predeparture, setPredeparture] = useState();
  const [trajectory, setTrajectory] = useState();
  const [trajectoryCenter, setTrajectoryCenter] = useState();
  const [, setTrajectoryDebug] = useState();
  const [trajectoryLength, setTrajectoryLength] = useState();

  const travelSolution = useStore(s => s.asteroids.travelSolution);
  const dispatchTravelSolution = useStore(s => s.dispatchTravelSolution);

  useEffect(() => {
    if (!baseTime || !timeOverride?.speed || Math.abs(timeOverride.speed) <= 1) {
      setBaseTime(coarseTime);
    }
  }, [coarseTime, timeOverride?.speed]);

  useEffect(() => {
    if (!travelSolution) return;

    const exhaustBonus = getCrewAbilityBonuses(Crewmate.ABILITY_IDS.PROPELLANT_EXHAUST_VELOCITY, crew);
    // console.log('travelSolution', travelSolution, 'exhaustBonus', exhaustBonus);

    // clear travel solution...
    if (
      // ...on endpoint mismatch
      travelSolution.originId !== originId
      || travelSolution.destinationId !== destinationId

      // ...on ship param mismatch
      // (only possible in RoutePlanner, so cleared on porkchop rebuild)

      // ...on baseTime > departureTime
      || travelSolution.departureTime < baseTime

      // ...on time override (i.e. ff / rewind)
      || (timeOverride && ![0, 1].includes(Number(timeOverride.speed)))

      // ...crew's propellant bonus has changed
      || travelSolution.exhaustBonus !== (exhaustBonus.totalBonus || 1)
    ) {
      dispatchTravelSolution();
    }
  }, [baseTime, crew, destinationId, originId, timeOverride, travelSolution]);

  useEffect(() => {
    if (!travelSolution || !destination || !origin) {
      setPrearrival();
      setPredeparture();
      setTrajectory();
      setTrajectoryCenter();
      setTrajectoryDebug();
      setTrajectoryLength();
      return;
    }

    const { v1, originPosition, destinationPosition, departureTime, arrivalTime } = travelSolution;
    if (!v1 || !originPosition) return;

    const solutionOrbit = AdalianOrbit.fromStateVectors(
      [originPosition[0], originPosition[1], originPosition[2]],
      v1
    );
    // console.log({
    //   travelSolution,
    //   solutionOrbit,
    //   nuInit: solutionOrbit.getTrueAnomalyAtPos({ x: originPosition[0], y: originPosition[1], z: originPosition[2] }),
    //   nuFinal: solutionOrbit.getTrueAnomalyAtPos({ x: destinationPosition[0], y: destinationPosition[1], z: destinationPosition[2] }),
    // });

    const totalTime = arrivalTime - departureTime;
    const timeInc = (arrivalTime - departureTime) / solutionPoints;
    const halfway = 3 * (solutionPoints + 2) / 2;

    let centerPosition;
    let trajectoryLengthEstimate = 0;
    let currentPosition = new Vector3();
    let previousPosition = null;

    const newPositions = [];
    newPositions.push(...Object.values(originPosition));
    for (let t = 0; t < totalTime; t += timeInc) {
      const p = solutionOrbit.getPositionAtTime(t);
      newPositions.push(p.x, p.y, p.z);
      if (newPositions.length === halfway) {
        centerPosition = [p.x, p.y, p.z];
      }

      currentPosition.set(p.x, p.y, p.z);
      if (previousPosition) {
        trajectoryLengthEstimate += previousPosition.distanceTo(currentPosition);
      } else {
        previousPosition = new Vector3();
      }
      previousPosition.copy(currentPosition);
    }
    newPositions.push(...Object.values(destinationPosition));

    setTrajectory(new Float32Array(newPositions));
    setTrajectoryCenter(centerPosition);
    setTrajectoryLength(trajectoryLengthEstimate);
    setOrder(new Float32Array(Array(newPositions.length).fill().map((_, i) => i + 1)));

    // // TODO: comment this out vvv
    // let debugPositions = [];
    // solutionOrbit.getSmoothOrbit(360).forEach(p => {
    //   debugPositions.push(...[ p.x, p.y, p.z ]);
    // });
    // setTrajectoryDebug(new Float32Array(debugPositions));
    // console.log('solution.orbit.ecc', solutionOrbit.orbit.ecc, 'period', solutionOrbit.getPeriod());
    // // ^^^

    const originPositions = [];
    const originOrbit = new AdalianOrbit(origin.Orbit, { units: 'km' });
    const originIncrement = (departureTime - baseTime) / 360;
    for (let t = baseTime; t < departureTime; t += originIncrement) {
      const p = originOrbit.getPositionAtTime(t);
      originPositions.push(...[ p.x, p.y, p.z ]);
    }
    setPredeparture(new Float32Array(originPositions));

    const destinationPositions = [];
    const destinationOrbit = new AdalianOrbit(destination.Orbit, { units: 'km' });
    const destinationIncrement = (arrivalTime - baseTime) / 360;
    for (let t = baseTime; t < arrivalTime; t += destinationIncrement) {
      const p = destinationOrbit.getPositionAtTime(t);
      destinationPositions.push(...[ p.x, p.y, p.z ]);
    }
    setPrearrival(new Float32Array(destinationPositions));

    uniforms.current.uCol.value = new Color(travelSolutionIsValid ? orbitColors.main : orbitColors.error);
    uniforms.current.uDash.value = true;
  }, [baseTime, travelSolution]);

  const formattedTrajectoryLength = useMemo(() => {
    if (!trajectoryLength) return '';
    return formatBeltDistance(trajectoryLength);
  }, [trajectoryLength]);

  useFrame(() => {
    uniforms.current.uTime.value++;
  });

  return (
    <>
      {trajectory && (
        <line renderOrder={0} userData={{ bloom: true }}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[ trajectory, 3 ]} />
            <bufferAttribute attach="attributes-order" args={[ order, 1 ]} />
          </bufferGeometry>
          <shaderMaterial
            args={[{
              depthWrite: false,
              fragmentShader: frag,
              uniforms: uniforms.current,
              transparent: true,
              vertexShader: vert,
            }]} />
        </line>
      )}
      {/*trajectoryDebug && (
        <line>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[ trajectoryDebug, 3 ]} />
          </bufferGeometry>
          <lineBasicMaterial color={orbitColors.white} transparent opacity={0.2} />
        </line>
      )*/}

      {predeparture && (
        <line>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[ predeparture, 3 ]} />
          </bufferGeometry>
          <lineBasicMaterial color={orbitColors.main} />
        </line>
      )}

      {prearrival && (
        <line>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[ prearrival, 3 ]} />
          </bufferGeometry>
          <lineBasicMaterial color={travelSolutionIsValid ? orbitColors.success : orbitColors.error} />
        </line>
      )}

      {trajectoryCenter && (
        <Html
          position={trajectoryCenter}
          style={{ pointerEvents: 'none' }}>
          {travelSolution && travelSolutionIsValid && (
            <RouteMarker color="success">
              <RouteValidIcon />
              <RouteNotes>Route: {formattedTrajectoryLength}</RouteNotes>
            </RouteMarker>
          )}
          {travelSolution && !travelSolutionIsValid && (
            <RouteMarker color="error">
              <RouteInvalidIcon />
              <RouteNotes>Not Possible: {formattedTrajectoryLength}</RouteNotes>
            </RouteMarker>
          )}
        </Html>
      )}
    </>
  );
};

export default TravelSolution;


