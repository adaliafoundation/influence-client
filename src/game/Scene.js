import { Suspense, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Object3D, Vector3 } from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { useContextBridge, Stats } from '@react-three/drei';
import styled from 'styled-components';

import { TrackballModControls } from '~/components/TrackballModControls';
import CrewContext from '~/contexts/CrewContext';
import DevToolContext from '~/contexts/DevToolContext';
import SessionContext from '~/contexts/SessionContext';
import WebsocketContext from '~/contexts/WebsocketContext';
import useStore from '~/hooks/useStore';
import constants from '~/lib/constants';
import visualConfigs from '~/lib/visuals';
import Star from './scene/Star';
import Planets from './scene/Planets';
import Asteroids from './scene/Asteroids';
import Asteroid from './scene/Asteroid';
import SettingsManager from './scene/SettingsManager';
import Postprocessor from './Postprocessor';
import { GpuContextLostMessage, GpuContextLostReporter } from './GpuContextLost';

// TODO: 3js upgrade -- was antialias=false
const glConfig = {
  shadows: true,
  camera: {
    fov: 75,
    near: 1000000,
    far: constants.MAX_SYSTEM_RADIUS * constants.AU * 2,
    position: [ 4 * constants.AU, 0, 1.5 * constants.AU ]
  },
  onCreated: (state) => {
    state.raycaster.params.Points = {
      near: 1000000,
      far: constants.MAX_SYSTEM_RADIUS * constants.AU * 2,
      threshold: 0.025 * constants.AU
    };
  }
};

const StyledContainer = styled.div`
  bottom: 0;
  position: absolute;
  top: 0;
  width: 100%;
`;

const FrameRateLimiter = ({ enabled, frameRateCap }) => {
  const advance = useThree(s => s.advance);
  const clock = useThree(s => s.clock);
  const advanceRef = useRef(advance);
  const animationFrameRef = useRef();
  const elapsedTimeRef = useRef();
  const lastFrameTimeRef = useRef();

  useEffect(() => {
    advanceRef.current = advance;
  }, [advance]);

  useEffect(() => {
    if (!enabled || !frameRateCap) return undefined;

    elapsedTimeRef.current = clock.elapsedTime;
    const minFrameInterval = 1000 / frameRateCap;
    const renderFrame = (timestamp) => {
      if (
        lastFrameTimeRef.current === undefined ||
        timestamp - lastFrameTimeRef.current >= minFrameInterval - 0.5
      ) {
        const frameDelta = lastFrameTimeRef.current === undefined
          ? 0
          : Math.min((timestamp - lastFrameTimeRef.current) / 1000, 0.1);
        lastFrameTimeRef.current = timestamp;
        elapsedTimeRef.current += frameDelta;
        advanceRef.current(elapsedTimeRef.current, true);
      }

      animationFrameRef.current = requestAnimationFrame(renderFrame);
    };

    animationFrameRef.current = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      elapsedTimeRef.current = undefined;
      lastFrameTimeRef.current = undefined;
    };
  }, [clock, enabled, frameRateCap]);

  return null;
};

const WrappedScene = () => {
  const { clock, controls } = useThree();
  const zoomStatus = useStore(s => s.asteroids.zoomStatus);

  // if three is started with frameloop == 'never', clock is not set to autoStart, so we need to set it
  useEffect(() => {
    if (clock && !clock.autoStart) clock.autoStart = true;
  }, []);

  // reset to "zoomed out" control settings if zoomed out to belt view
  useEffect(() => {
    if (!!controls && (zoomStatus === 'zooming-out' || zoomStatus === 'out')) {
      controls.maxDistance = 10 * constants.AU;
      controls.minDistance = 0.3 * constants.AU;
      controls.zoomSpeed = 1.2;
      controls.rotateSpeed = 1.0;
    }
  }, [!!controls, zoomStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  return !controls ? null : (
    <>
      <Suspense fallback={null}>
        <Star />
      </Suspense>
      <Suspense fallback={null}>
        <Planets />
      </Suspense>
      <Suspense fallback={null}>
        <Asteroids />
      </Suspense>
      <Suspense fallback={null}>
        <Asteroid />
      </Suspense>
    </>
  );
}

// Orient such that z is up, perpindicular to the stellar plane
Object3D.DEFAULT_UP = new Vector3(0, 0, 1);

const Scene = () => {
  /**
   * Grab reference to queryClient to recreate QueryClientProvider within Canvas element
   * See: https://github.com/pmndrs/react-three-fiber/blob/master/markdown/api.md#gotchas
   */
  const queryClient = useQueryClient();

  // Use ContextBridge to make wallet available within canvas
  const ContextBridge = useContextBridge(
    SessionContext,
    CrewContext,
    DevToolContext,
    WebsocketContext
  );

  const canvasStack = useStore(s => s.canvasStack); // TODO: this might be easier to manage in a dedicated context
  const zoomedFrom = useStore(s => s.asteroids.zoomedFrom);
  const setZoomedFrom = useStore(s => s.dispatchAsteroidZoomedFrom);
  const pixelRatio = useStore(s => s.graphics.pixelRatio || 1);
  const bloomResolutionScale = useStore(s => s.graphics.bloomResolutionScale);
  const enablePostprocessing = useStore(s => s.graphics.enablePostprocessing);
  const frameRateCap = useStore(s => s.graphics.frameRateCap ?? 60);
  const statsOn = useStore(s => s.graphics.stats);

  const [contextLost, setContextLost] = useState(false);
  const canvasStyle = useMemo(() => (contextLost ? { opacity: 0, pointerEvents: 'none' } : { zIndex: 0 }), [contextLost]);

  useEffect(() => {
    if (!zoomedFrom) {
      setZoomedFrom({
        scene: new Vector3(0, 0, 0),
        position: new Vector3(4 * constants.AU, 0, 1.5 * constants.AU),
        up: new Vector3(0, 0, 1)
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { assetType, overrides } = useContext(DevToolContext);

  const [postprocessingEnabled, bloomParams] = useMemo(() => {
    const defaults = visualConfigs.scene;
    const o = assetType === 'scene' ? overrides : {};
    return [
      o.enablePostprocessing ?? enablePostprocessing ?? defaults.enablePostprocessing,
      {
        radius: o?.bloomRadius || defaults.bloomRadius,
        resolutionScale: o?.bloomResolutionScale ?? bloomResolutionScale ?? defaults.bloomResolutionScale,
        smoothing: o?.bloomSmoothing || defaults.bloomSmoothing,
        strength: o?.bloomStrength || defaults.bloomStrength,
        threshold: o?.bloomThreshold || defaults.bloomThreshold,
        toneMapping: o?.toneMapping || defaults.toneMapping,
        toneMappingExposure: o?.toneMappingExposure || defaults.toneMappingExposure,
      }
    ];
  }, [bloomResolutionScale, enablePostprocessing, overrides]);

  const sceneActive = canvasStack?.length === 0;
  const cappedFrameRate = frameRateCap > 0 ? frameRateCap : null;
  const frameloop = useMemo(() => (
    sceneActive && !cappedFrameRate ? 'always' : 'never'
  ), [cappedFrameRate, sceneActive]);

  return (
    <StyledContainer>
      {statsOn && <Stats />}
      {contextLost && <GpuContextLostMessage />}
      <Canvas key={pixelRatio}
        {...glConfig}
        linear={postprocessingEnabled/* postprocessing will handle gamma autocorrection */}
        frameloop={frameloop}
        style={canvasStyle}>
        <FrameRateLimiter enabled={sceneActive && !!cappedFrameRate} frameRateCap={cappedFrameRate} />
        <GpuContextLostReporter setContextLost={setContextLost} />
        <ContextBridge>
          <Suspense fallback={null}>
            <SettingsManager />
          </Suspense>
          <Postprocessor enabled={postprocessingEnabled} bloomParams={bloomParams} />
          <QueryClientProvider client={queryClient}>
            <TrackballModControls>
              <WrappedScene />
            </TrackballModControls>
          </QueryClientProvider>
        </ContextBridge>
      </Canvas>
      {false && /* TODO: remove debug */(
        <div style={{ position: 'fixed', bottom: 72, left: 0, zIndex: 10000 }}>
          <div style={{ border: '1px solid white', padding: 4, background: '#222' }}>
            <canvas id="test_canvas" style={{ width: 0, height: 0, verticalAlign: 'bottom' }} />
          </div>
        </div>
      )}
      {false && /* TODO: remove debug */(
        <div
          id="debug_info"
          style={{
            position: 'fixed',
            top: -1,
            left: 95,
            background: 'black',
            border: '1px solid white',
            padding: '8px 4px',
            fontSize: 11,
            minWidth: 60,
            textAlign: 'center'
          }} />
      )}
    </StyledContainer>
  );
};

export default Scene;
