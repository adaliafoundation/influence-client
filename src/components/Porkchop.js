import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { lambert } from '@influenceth/astro';
import { GM_ADALIA } from '@influenceth/sdk';
import { useThrottle } from '@react-hook/throttle';
import { Vector3 } from 'three';

import useStore from '~/hooks/useStore';
import useWebWorker from '~/hooks/useWebWorker';
import theme, { hexToRGB } from '~/theme';
import Grid from './porkchop/Grid';
import SolutionLabels from './porkchop/SolutionLabels';
import Reticule from './porkchop/Reticule';
import { WarningOutlineIcon } from './Icons';
import { reactBool } from '~/lib/utils';
import { WorkerQueuePriority } from '~/lib/workerQueue';
import useTravelSolutionIsValid, { maxFoodUtilizationAdays } from '~/hooks/useTravelSolutionIsValid';
import useCoachmarkRefSetter from '~/hooks/useCoachmarkRefSetter';
import { COACHMARK_IDS } from '~/contexts/CoachmarkContext';

const PorkchopWrapper = styled.div`
  overflow: visible;
  position: relative;
`;

const PorkchopContainer = styled.div`
  border: 1px solid #333;
  overflow: hidden;
  position: relative;
`;

const Solutionless = styled.div`
  align-items: center;
  color: ${p => p.theme.colors.main};
  display: flex;
  flex-direction: column;
  left: 0;
  height: 100%;
  justify-content: center;
  opacity: ${p => p.show ? 1 : 0};
  pointer-events: none;
  position: absolute;
  top: 0;
  transition: opacity 1000ms ease;
  width: 100%;
  & > svg {
    font-size: 40px;
  }
  h3 {
    background: rgba(${p => p.theme.colors.mainRGB}, 0.2);
    font-size: 16px;
    margin: 10px 0 0;
    padding: 4px;
    text-align: center;
    text-transform: uppercase;
    width: 96%;
  }
`;

const TimeBlock = styled.div.attrs((p) => ({
  style: {
    borderRightWidth: p.percentage > 0 ? '1px' : 0,
    width: `${Math.max(0, 100 * p.percentage)}%`
  }
}))`
  background: rgba(0, 0, 0, 0.7);
  // border-right: solid rgba(150, 0, 0, 0.7);
  border-right: solid rgba(68, 68, 68, 0.7);
  left: 0;
  height: 100%;
  pointer-events: none;
  position: absolute;
  top: 0;
`;

const colorRange = [
  new Vector3(255, 255, 255),
  new Vector3(255, 0, 115),
  new Vector3(0, 0, 204),
  new Vector3(0, 0, 102)
];

const desaturation = 3;
const deltaVColor = (deltaV, maxDeltaV, isInvalid = false) => {
  if (deltaV > maxDeltaV) return '#000000';

  let r, g, b;
  if (deltaV < 0.33 * maxDeltaV) {
    const c = colorRange[0].clone();
    c.lerp(colorRange[1], deltaV / (0.33 * maxDeltaV));
    r = c.x;
    g = c.y;
    b = c.z;
  } else if (deltaV < 0.67 * maxDeltaV) {
    const c = colorRange[1].clone();
    c.lerp(colorRange[2], (deltaV - 0.33 * maxDeltaV) / (0.33 * maxDeltaV));
    r = c.x;
    g = c.y;
    b = c.z;
  } else {
    const c = colorRange[2].clone();
    c.lerp(colorRange[3], (deltaV - 0.67 * maxDeltaV) / (0.33 * maxDeltaV));
    r = c.x;
    g = c.y;
    b = c.z;
  }
  // if invalid, recolor
  if (isInvalid) {
    // darkened + grayscale:
    // g = b = (r + g + b) / 6

    // darkened + desaturated:
    let gray = (r + g + b) / 8;
    r = (r + desaturation * gray) / (desaturation + 1);
    g = (g + desaturation * gray) / (desaturation + 1);
    b = (b + desaturation * gray) / (desaturation + 1);
  };
  return `rgb(${r}, ${g}, ${b})`;
};

const Porkchop = ({
  baseTime,
  emode,
  nowTime,
  originPath,
  originId,
  destinationPath,
  destinationId,
  lastFedAt,
  minDelay,
  maxDelay,
  minTof,
  maxTof,
  shipParams,
  size,
  exhaustBonus = 1
}) => {
  const { processInBackground, cancelBackgroundProcesses } = useWebWorker();

  const travelSolution = useStore(s => s.asteroids.travelSolution);
  const dispatchTravelSolution = useStore(s => s.dispatchTravelSolution);
  const travelSolutionIsValid = useTravelSolutionIsValid();
  const setCoachmarkRef = useCoachmarkRefSetter();

  const [canvasRefIsSet, setCanvasRefIsSet] = useState();
  const [loading, setLoading] = useState(true);
  const [mousePos, setMousePos] = useThrottle(null, 30, true);
  const [selectionPos, setSelectionPos] = useState();
  const [solutionsExist, setSolutionsExist] = useState(false);

  const canvasRef = useRef();
  const runRef = useRef();

  const setCanvasRef = useCallback((canvas) => {
    canvasRef.current = canvas;
    setCanvasRefIsSet(true);
  }, []);

  useEffect(() => {
    if (!canvasRefIsSet) return;
    if (!originPath || !destinationPath) return;
    setLoading(true);
    setMousePos(null);
    setSelectionPos(null);
    dispatchTravelSolution();

    const currentRun = Date.now();
    runRef.current = currentRun;

    // NOTE: if this ends up being too much (i.e. if we are running porkchops in multiple contexts),
    //  we could always specify the last run id in the item and just cancel previous run id here
    cancelBackgroundProcesses((item) => item.topic !== 'calculatePorkchop');

    const width = maxDelay - minDelay + 1;
    const height = maxTof - minTof + 1;
    const foodCutoff = lastFedAt + maxFoodUtilizationAdays;

    const p2 = performance.now();

    let canvasCtx = canvasRef.current.getContext('2d');
    canvasCtx.clearRect(0, 0, width, height);

    let batchesProcessed = 0;
    let expectedBatches = width;

    // for (let delay of delays) {
    let maxDelayProcessed = minDelay;
    let zeroSolutionsExist = true;
    for (let delay = minDelay; delay <= maxDelay; delay++) {
      processInBackground({
        topic: 'calculatePorkchop',
        data: {
          originPath,
          destinationPath,
          minDelay: delay,
          maxDelay: delay,
          minTof,
          maxTof,
        },
        _concurrencyGroup: 'porkchop',
        _maxConcurrent: 1,
        _priority: WorkerQueuePriority.background
      }, ({ deltaVs }) => {
        if (runRef.current !== currentRun) return;

        // console.log('drawing', delay, performance.now() - p2);
        if (delay > maxDelayProcessed) {
          maxDelayProcessed = delay;
          canvasCtx.fillStyle = `rgba(${theme.colors.mainRGB},1)`;
          canvasCtx.fillRect(maxDelayProcessed - minDelay + 1, 0, 2, height);
        }

        // TODO: don't need to draw black areas if clear in advance
        const col = Math.round(delay - minDelay);
        const colDelay = (maxDelay - minDelay) * (col / width) + minDelay;

        let wasFoodInvalid = false;

        let previousBucket = null;
        let currentBucket;
        const isobuckets = 8;

        for (let i in deltaVs) {
          let isFoodInvalid = false;
          const departureTime = baseTime + colDelay;
          const arrivalTime = departureTime + ((maxTof - minTof) * (i / height) + minTof);
          const invalidCutoff = emode ? departureTime + maxFoodUtilizationAdays : foodCutoff;
          if (arrivalTime > invalidCutoff) {
            isFoodInvalid = true;
          }

          if (zeroSolutionsExist && deltaVs[i] > 0 && deltaVs[i] < shipParams.maxDeltaV) {
            zeroSolutionsExist = false;
          }

          canvasCtx.fillStyle = deltaVColor(deltaVs[i], shipParams.maxDeltaV, isFoodInvalid);
          canvasCtx.fillRect(col, height - i, 1, -1);
          currentBucket = Math.floor(isobuckets * deltaVs[i] / shipParams.maxDeltaV);
          if (previousBucket !== null && currentBucket !== previousBucket) {
            if (currentBucket < isobuckets && previousBucket < isobuckets) {
              canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
              canvasCtx.fillRect(col, height - i + 1, 1, 1);
            }
          }
          previousBucket = currentBucket;

          if (!wasFoodInvalid && isFoodInvalid) {
            if (deltaVs[i] > 0 && deltaVs[i] < shipParams.maxDeltaV) {
              canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
              canvasCtx.fillRect(col, height - i - 2, 1, 4);
            }
            wasFoodInvalid = true;
          }
        }

        batchesProcessed++;
        if (batchesProcessed === expectedBatches) {
          console.log('porkchop ready in', performance.now() - p2);
          setSolutionsExist(!zeroSolutionsExist);
          setLoading(false);
        }
      })
    }
  }, [canvasRefIsSet, lastFedAt, originPath, destinationPath, shipParams]);

  useEffect(() => {
    if (!travelSolution) setSelectionPos();
  }, [travelSolution])

  const getMouseData = useCallback((e) => {
    const data = {
      x: Math.max(0, Math.min(e.nativeEvent.offsetX / size, 1)),
      y: Math.max(0, Math.min(e.nativeEvent.offsetY / size, 1)),
    };
    data.delay = minDelay + Math.round((maxDelay - minDelay) * data.x);
    data.tof = minTof + Math.round((maxTof - minTof) * (1 - data.y));

    // ensure delay is not in the past
    const timeProgression = nowTime - baseTime;
    while (data.delay < timeProgression) {
      data.delay += 1;
      data.x = (data.delay - minDelay) / (maxDelay - minDelay);
    }

    return data;
  }, [baseTime, nowTime, size]);

  const handleClick = useCallback(async (e) => {
    const mouseData = getMouseData(e);
    setSelectionPos(mouseData);
    setMousePos();

    const { delay, tof } = mouseData;

    const oIndex = delay;
    const oPos = originPath.positions[oIndex];
    const oVel = originPath.velocities[oIndex];

    const dIndex = delay + tof;
    const dPos = destinationPath.positions[dIndex];
    const dVel = destinationPath.velocities[dIndex];

    const solution = await lambert.multiSolver(
      GM_ADALIA,
      oPos.toArray(),
      dPos.toArray(),
      tof * 86400, // tof in days
      oVel.toArray(),
      dVel.toArray(),
    );

    const insufficientPropellant = solution.deltaV > shipParams.maxDeltaV;

    // deltav = v_e * ln(wetmass / drymass)
    let usedPropellantMass;

    // deltav = v_e * ln((drymass + propused) / drymass)
    // (if insufficientPropellant, calculate the required propellant req if 100% is to be used (i.e. actual === used))
    if (insufficientPropellant) {
      let drymass = (shipParams.hullMass + shipParams.actualCargoMass);
      usedPropellantMass = drymass * (Math.exp(solution.deltaV / shipParams.exhaustVelocity) - 1);

    // deltav = v_e * ln(wetmass / (wetmass - usedprop))
    } else {
      let wetmass = (shipParams.hullMass + shipParams.actualCargoMass + shipParams.actualPropellantMass);
      usedPropellantMass = wetmass * (1 - 1 / Math.exp(solution.deltaV / shipParams.exhaustVelocity));
    }

    const departureTime = baseTime + delay;
    const arrivalTime = departureTime + tof;
    const insufficientFood = arrivalTime > (emode ? departureTime : lastFedAt) + maxFoodUtilizationAdays;

    dispatchTravelSolution({
      ...solution, // v1, v2, deltaV
      shipId: shipParams.id,
      _isSimulation: !!shipParams._simulated,
      _isSimulationInvalid: insufficientPropellant || insufficientFood,
      originId,
      destinationId,
      usedPropellantMass,
      usedPropellantPercent: 100 * usedPropellantMass / shipParams.actualPropellantMass,
      departureTime: baseTime + delay,
      arrivalTime,
      originPosition: oPos.toArray(),
      originVelocity: oVel.toArray(),
      destinationPosition: dPos.toArray(),
      exhaustBonus,
      key: Date.now()
    });
  }, [emode, originPath, destinationPath, lastFedAt, shipParams]);

  const handleMouseMove = useCallback((e) => {
    if (loading) return;
    if (e.type === 'mousemove') {
      setMousePos(getMouseData(e));
    } else {
      setMousePos();
    }
    return false;
  }, [loading, getMouseData]);

  return (
    <PorkchopWrapper style={{ height: `${size}px`, marginBottom: 40, width: `${size}px` }}>
      <PorkchopContainer
        loading={reactBool(loading)}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseMove}
        ref={setCoachmarkRef(COACHMARK_IDS.porkchop)}
        style={{ height: `${size}px`, width: `${size}px` }}>
        <canvas ref={setCanvasRef}
          height={maxTof - minTof}
          width={maxDelay - minDelay}
          style={{ verticalAlign: 'bottom', height: `${size}px`, width: `${size}px` }} />
        <Grid />
        {selectionPos && <Reticule selected center={selectionPos} fade={!!mousePos} invalid={!travelSolutionIsValid} />}
        {mousePos && <Reticule center={mousePos} />}
      </PorkchopContainer>
      <TimeBlock percentage={(nowTime - baseTime) / (maxDelay - minDelay)} />
      <Solutionless show={!solutionsExist && !loading}>
        <WarningOutlineIcon />
        <h3>No Possible Routes</h3>
      </Solutionless>
      {selectionPos && (
        <SolutionLabels
          center={selectionPos}
          emode={emode}
          lastFedAt={lastFedAt}
          mousePos={mousePos}
          shipParams={shipParams} />
      )}
    </PorkchopWrapper>
  );
};

export default Porkchop;
