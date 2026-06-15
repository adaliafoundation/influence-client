import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { ACESFilmicToneMapping, AxesHelper, CameraHelper, Color, DirectionalLight, DirectionalLightHelper, Quaternion, Vector3 } from 'three';
import gsap from 'gsap';
import { AdalianOrbit, Asteroid, Entity, Lot, Product, Ship } from '@influenceth/sdk';

import useStore from '~/hooks/useStore';
import useAsteroid from '~/hooks/useAsteroid';
import useGetTime from '~/hooks/useGetTime';
import useWebWorker from '~/hooks/useWebWorker';
import Config from '~/lib/asteroidConfig';
import constants from '~/lib/constants';
import theme from '~/theme';
import QuadtreeTerrainCube from './asteroid/helpers/QuadtreeTerrainCube';
import Lots from './asteroid/Lots';
import Rings from './asteroid/Rings';
import Telemetry from './asteroid/Telemetry';
import { pointCircleClosest } from '~/lib/geometryUtils';
import { keyify } from '~/lib/utils';
import useAsteroidShips from '~/hooks/useAsteroidShips';
import DevToolContext from '~/contexts/DevToolContext';
import visualConfigs from '~/lib/visuals';

const validateHex = (v) => /[a-f0-9]{6}/i.test(v) ? v : '';

const trajDebugColors = [
  0xe81416,
  0xffa500,
  0xfaeb36,
  0x79c314,
  0x487de7,
  0x4b369d,
  0x70369d,
  0xffffff,
  0xcccccc,
  0x999999,
  0x555555
];

const {
  CHUNK_SPLIT_DISTANCE,
  MIN_FRUSTUM_AT_SURFACE,
  UPDATE_QUADTREE_EVERY,
} = constants;

const UPDATE_DISTANCE_MULT = CHUNK_SPLIT_DISTANCE * UPDATE_QUADTREE_EVERY;

const INITIAL_ZOOM_MIN = 6000;
const MIN_ZOOM_DEFAULT = 1.2;
const MAX_ZOOM = 20;
const DIRECTIONAL_LIGHT_DISTANCE = 10;

const LIGHT_ANIMATION_TIME = 500;
export const ZOOM_IN_ANIMATION_TIME = 3000;
export const ZOOM_OUT_ANIMATION_TIME = 2000;
export const ZOOM_TO_PLOT_ANIMATION_MIN_TIME = 350;
export const ZOOM_TO_PLOT_ANIMATION_MAX_TIME = 5000;
const ZOOM_TO_PLOT_DRAMATIC_MULT = 3;

// some numbers estimated from https://web.dev/rendering-performance/
const TARGET_FPS = 60;
const USABLE_FRAME = 0.6; // leave time for GPU housekeeping, etc
const INITIAL_RENDER_WO_SWAP_EST = 2;
const INITIAL_RENDER_W_SWAP_EST = 2.5;
const TARGET_LOOP_TIME = 1e3 * USABLE_FRAME / TARGET_FPS;

const AVG_RENDER_TIMES = {
  W_SWAP: INITIAL_RENDER_W_SWAP_EST,
  WO_SWAP: INITIAL_RENDER_WO_SWAP_EST
};

const RENDER_TIMES = { W_SWAP: [], WO_SWAP: [] };
const RENDER_TIME_CAPS = { W_SWAP: TARGET_LOOP_TIME, WO_SWAP: TARGET_LOOP_TIME * 0.8 };
const RENDER_SAMPLES = { W_SWAP: 100, WO_SWAP: 50 };
const RENDER_TALLIES = { W_SWAP: 0, WO_SWAP: 0 };

const reportRenderTime = (type, time) => {
  RENDER_TIMES[type][RENDER_TALLIES[type]] = time;
  RENDER_TALLIES[type]++;
  if (RENDER_TALLIES[type] === RENDER_SAMPLES[type]) {
    const avg = RENDER_TIMES[type].reduce((acc, cur) => acc + cur, 0) / RENDER_TALLIES[type];
    const stddev = Math.sqrt(RENDER_TIMES[type].reduce((acc, cur) => acc + (cur - avg) ** 2, 0) / RENDER_TALLIES[type]);
    AVG_RENDER_TIMES[type] = Math.min(RENDER_TIME_CAPS[type], avg + stddev);
    RENDER_TALLIES[type] = 0;
  }
};

const getNow = () => (performance || new Date()).now();
const frameTimeLeft = (start, chunkSwapPending) => {
  return TARGET_LOOP_TIME
    - AVG_RENDER_TIMES[chunkSwapPending ? 'W_SWAP' : 'WO_SWAP']
    - (getNow() - start);
};

// let taskTally = 0;
// let taskTotal = 0;
// const benchmark = (start) => {
//   taskTally++;
//   taskTotal += performance.now() - start;
// }
// setInterval(() => {
//   console.log(`benchmark (${taskTally})`, taskTotal / taskTally);
// }, 5000);

// const _dbg = {};
// const dbg = (label, start) => {
//   if (!_dbg[label]) _dbg[label] = { times: 0, frames: 0, max: 0 };
//   const elapsed = getNow() - start;
//   _dbg[label].times += elapsed;
//   if (elapsed > _dbg[label].max) _dbg[label].max = elapsed;
//   _dbg[label].frames++;
// };
// setInterval(() => {
//   console.log('- - - - - - - -');
//   console.group();
//   Object.keys(_dbg).forEach((label) => {
//     console.log(
//       `${label} (${_dbg[label].frames})
//       [AVG] ${(_dbg[label].times / _dbg[label].frames).toFixed(2)}
//       [MAX] ${_dbg[label].max.toFixed(2)}`,
//     );
//     _dbg[label].frames = 0;
//     _dbg[label].max = 0;
//     _dbg[label].times = 0;
//   });
//   console.groupEnd();
// }, 5000);

// setInterval(() => {
//   console.log(AVG_RENDER_TIMES);
// }, 5000);

const EMISSIVE_INTENSITY = {
  Fissile: 1,
  Metal: 1,
  Organic: 1.05,
  RareEarth: 1,
  Volatile: 1.25
};

const AsteroidComponent = () => {
  const { controls } = useThree();
  const cinematicInitialPosition = useStore(s => s.asteroids.cinematicInitialPosition);
  const origin = useStore(s => s.asteroids.origin);
  const { textureSize } = useStore(s => s.getTerrainQuality());
  const { shadowSize, shadowMode } = useStore(s => s.getShadowQuality());
  const zoomStatus = useStore(s => s.asteroids.zoomStatus);
  const zoomedFrom = useStore(s => s.asteroids.zoomedFrom);
  const cameraNeedsHighAltitude = useStore(s => s.cameraNeedsHighAltitude);
  const cameraNeedsRecenter = useStore(s => s.cameraNeedsRecenter);
  const cameraNeedsReorientation = useStore(s => s.cameraNeedsReorientation);
  const resourceMap = useStore(s => s.asteroids.resourceMap);
  const lotId = useStore(s => s.asteroids.lot);
  const dispatchLotsLoading = useStore(s => s.dispatchLotsLoading);
  const dispatchRecenterCamera = useStore(s => s.dispatchRecenterCamera);
  const dispatchReorientCamera = useStore(s => s.dispatchReorientCamera);
  const dispatchGoToHighAltitude = useStore(s => s.dispatchGoToHighAltitude);
  const updateZoomStatus = useStore(s => s.dispatchZoomStatusChanged);
  const setZoomedFrom = useStore(s => s.dispatchAsteroidZoomedFrom);
  const dispatchLotSelected = useStore(s => s.dispatchLotSelected);

  const { assetType, overrides } = useContext(DevToolContext);

  const [STAR_COLOR, STAR_INTENSITY_ADJ, DARKLIGHT_COLOR, DARKLIGHT_INTENSITY] = useMemo(() => {
    const defaults = visualConfigs.scene;
    const o = assetType === 'scene' ? overrides : {};
    return [
      `#${validateHex(o?.starColor) || defaults.starColor}`,
      o?.starStrength || defaults.starStrength,
      `#${validateHex(o?.darklightColor) || defaults.darklightColor}`,
      o?.darklightStrength || defaults.darklightStrength,
    ];
  }, [assetType, overrides]);

  const selectedLot = useMemo(() => Lot.toPosition(lotId), [lotId]);

  const { data: asteroidData } = useAsteroid(origin);
  const { data: ships } = useAsteroidShips(origin);

  const shipsInOrbitTally = useMemo(() => {
    return (ships || []).filter((ship) => {
      return ship.Location.location.label === Entity.IDS.ASTEROID && !ship.Ship.transitDestination && ship.Ship.status === Ship.STATUSES.AVAILABLE;
    }).length;
  }, [ships]);

  const getTime = useGetTime();
  const webWorkerPool = useWebWorker();

  const [cameraAltitude, setCameraAltitude] = useState();
  const [cameraAutomationVersion, setCameraAutomationVersion] = useState(0);
  const [cameraNormalized, setCameraNormalized] = useState();
  const [config, setConfig] = useState();
  const [terrainInitialized, setTerrainInitialized] = useState();
  const [terrainUpdateNeeded, setTerrainUpdateNeeded] = useState();
  const [prevAsteroidPosition, setPrevAsteroidPosition] = useState();
  const [zoomedIntoAsteroidId, setZoomedIntoAsteroidId] = useState();

  const asteroidOrbit = useRef();
  const asteroidId = useRef();
  const darkLight = useRef();
  const debug = useRef(); // TODO: remove
  const chunkSwapThisCycle = useRef();
  const geometry = useRef();
  const group = useRef();
  const light = useRef();
  const lockToSurface = useRef();
  const position = useRef();
  const unloadedPosition = useRef();
  const quadtreeRef = useRef();
  const renderTimer = useRef(0);
  const rotationAxis = useRef();
  const rotation = useRef(0);
  const settingCameraPosition = useRef();
  const forceUpdate = useRef(0);
  const lastUpdateStart = useRef(0);

  const maxStretch = useMemo(
    () => config?.stretch ? Math.max(config.stretch.x, config.stretch.y, config.stretch.z) : 1,
    [config?.stretch]
  );
  // const minStretch = useMemo(
  //   () => config?.stretch ? Math.min(config.stretch.x, config.stretch.y, config.stretch.z) : 1,
  //   [config?.stretch]
  // );

  // scaleHelper helps define outmost telemetry lines and initial zoom
  // to help convey relative scale of asteroids
  const SCALE_HELPER = useMemo(() => {
    return 360000 * Math.sqrt(config?.radius / 376000) / config?.radius;
  }, [config?.radius]);

  const INITIAL_ZOOM = useMemo(() => {
    return Math.max(INITIAL_ZOOM_MIN, 1.5 * SCALE_HELPER * config?.radius);
  }, [config?.radius, SCALE_HELPER]);

  const initialOrientation = useMemo(() => {
    if (!(controls && config?.radius && zoomedFrom?.position)) return null;

    // zoom to the point on the equator closest to the camera
    // (plus a slight angle above equator)
    let fromPosition = prevAsteroidPosition || zoomedFrom?.position || controls.object.position;
    // if fromPosition comes from saved state (i.e. on refresh), will be object but not vector3
    if (!fromPosition.isVector3) fromPosition = new Vector3(fromPosition.x, fromPosition.y, fromPosition.z);

    let objectPosition;
    if (cinematicInitialPosition) {
      objectPosition = new Vector3(...position.current)
        .setLength(2.5 * config.radius)
        .applyAxisAngle(rotationAxis.current, -Math.PI / 4.5);
    } else {
      objectPosition = pointCircleClosest(
        fromPosition,
        new Vector3(...position.current),
        rotationAxis.current,
        INITIAL_ZOOM,
        true
      );
    }
    objectPosition.add(rotationAxis.current.clone().multiplyScalar(0.07 * INITIAL_ZOOM));

    // (legacy) zoom in directly from zoomed-out camera
    // const objectPosition = controls.object.position.clone().normalize().multiplyScalar(initialZoom);

    // Orient the N/S axis to up/down
    const objectUp = rotationAxis.current.clone();

    // Pan the target scene to center the asteroid
    const targetScenePosition = new Vector3(...position.current).negate();

    return {
      objectPosition,
      objectUp,
      targetScenePosition
    };
  }, [cinematicInitialPosition, !controls, config?.radius, prevAsteroidPosition, zoomedFrom?.position]);

  const ringsPresent = useMemo(() => !!config?.ringsPresent, [config?.ringsPresent]);
  const surfaceDistance = useMemo(
    () => (MIN_FRUSTUM_AT_SURFACE / 2) / Math.tan((controls?.object?.fov / 2) * (Math.PI / 180)),
    [controls?.object?.fov]
  );

  const frustumHeightMult = useMemo(() => 2 * Math.tan((controls?.object?.fov / 2) * (Math.PI / 180)), [controls?.object?.fov]);

  const disposeGeometry = useCallback(() => {
    if (geometry.current && quadtreeRef.current) {
      geometry.current.groups.forEach((g) => {
        quadtreeRef.current.remove(g);
      });
    }
    if (geometry.current) {
      geometry.current.dispose();
      geometry.current = null;
    }
  }, []);

  const disposeLight = useCallback(() => {
    if (group.current && light.current) {
      group.current.remove(light.current);
    }
    if (light.current) {
      light.current.dispose();
      light.current = null;
    }

    if (group.current && darkLight.current) {
      group.current.remove(darkLight.current);
    }
    if (darkLight.current) {
      darkLight.current.dispose();
      darkLight.current = null;
    }
  }, []);

  const onUnload = useCallback(() => {
    setConfig();
    setTerrainInitialized();
    asteroidOrbit.current = null;
    rotationAxis.current = null;
    if (position.current) unloadedPosition.current = [...position.current];
    position.current = null;
    rotation.current = null;
    automatingCamera.current = false;
    disposeLight();
    disposeGeometry();
  }, [disposeLight, disposeGeometry]);

  useEffect(() => {
    // if origin changed, zoom into new asteroid
    if (asteroidId.current && asteroidId.current !== origin) {
      if (zoomStatus === 'in') {
        // console.log('initiate intra-asteroid zoom (i.e. set prevAsteroidPosition)');
        setPrevAsteroidPosition(new Vector3(...(unloadedPosition.current || position.current)));
        updateZoomStatus('zooming-in');
      }
    }
    asteroidId.current = origin;
    unloadedPosition.current = null;

    dispatchLotsLoading(origin); // initialize lot loader
  }, [origin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (zoomStatus !== 'in') {
      setZoomedIntoAsteroidId();
    }
  }, [zoomStatus]);

  // Update texture generation config when new asteroid data is available
  useEffect(() => {
    // when asteroidData is loaded for selected asteroid...
    if (asteroidData && asteroidData.id === origin) {

      // init config
      const c = new Config(asteroidData);
      // c.rotationSpeed = 0; // TODO: remove
      setConfig(c);

      // init orbit, position, and rotation
      const time = getTime();
      asteroidOrbit.current = new AdalianOrbit(asteroidData.Orbit, { units: 'km' });
      rotationAxis.current = c.seed.clone().normalize();
      position.current = Object.values(asteroidOrbit.current.getPositionAtTime(time));
      rotation.current = time * c.rotationSpeed * 2 * Math.PI;

      // if geometry.current already exists, dispose first
      if (geometry.current) disposeGeometry();
      geometry.current = new QuadtreeTerrainCube(origin, c, textureSize, webWorkerPool);
      geometry.current.groups.forEach((g) => {
        quadtreeRef.current.add(g);
      });
    }

    // return cleanup
    return onUnload;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ asteroidData ]);

  const defaultLightIntensity = useMemo(() => {
    if (!position.current || !config?.radius) return 0;
    return Math.max(0.175, STAR_INTENSITY_ADJ * constants.STAR_INTENSITY / (new Vector3(...position.current).length() / constants.AU));
  }, [config?.radius, STAR_INTENSITY_ADJ]);

  // turn down the sun while in resource mode
  const currentLightIntensity = useMemo(() => {
    return (resourceMap?.active && resourceMap?.selected) ? Math.min(0.175, defaultLightIntensity) : defaultLightIntensity;
  }, [defaultLightIntensity, resourceMap]);

  useEffect(() => {
    if (light.current && light.current.intensity !== currentLightIntensity) {
      gsap.timeline().to(light.current, { intensity: currentLightIntensity, ease: 'power4.out', duration: LIGHT_ANIMATION_TIME / 1e3 });
    }
  }, [currentLightIntensity]);

  // Configures the light component once the geometry is created
  useEffect(() => {
    if (!(config?.radius && config?.stretch && geometry.current && quadtreeRef.current && position.current)) return;

    // calculate intended shadow mode
    let intendedShadowMode = `${textureSize}`;
    if (shadowMode > 0) {
      intendedShadowMode = `${textureSize}_${shadowSize}`;
    }

    // if no changes, exit now
    if (geometry.current.shadowMode && geometry.current.shadowMode === intendedShadowMode) {
      return;
    }

    // must reinit geometry and lights entirely if already a shadow mode set
    if (geometry.current.shadowMode) {
      disposeGeometry(true);
      disposeLight();

      geometry.current = new QuadtreeTerrainCube(origin, config, textureSize, webWorkerPool);
      geometry.current.groups.forEach((g) => {
        quadtreeRef.current.add(g);
      });
    }

    // init params
    const posVec = new Vector3(...position.current);
    const lightColor = new Color().setStyle(STAR_COLOR);
    const lightDistance = config.radius * DIRECTIONAL_LIGHT_DISTANCE;
    const lightDirection = posVec.clone().normalize();

    const darkLightColor = new Color().setStyle(DARKLIGHT_COLOR);
    const darkLightDistance = config.radius * DIRECTIONAL_LIGHT_DISTANCE;
    const darkLightDirection = posVec.negate().clone().normalize();

    const maxRadius = ringsPresent
      ? config.radius * 1.5
      : config.radius * maxStretch;

    // create light
    light.current = new DirectionalLight(lightColor, currentLightIntensity);
    light.current.position.copy(lightDirection.negate().multiplyScalar(lightDistance));
    group.current.add(light.current);

    // if traditional shadows, update shadow camera
    if (shadowMode > 0) {
      light.current.castShadow = true;
      light.current.shadow.mapSize.width = shadowSize;
      light.current.shadow.mapSize.height = shadowSize;
      // light.current.shadow.bias = 1 / shadowSize;
      light.current.shadow.camera.near = lightDistance - maxRadius;
      light.current.shadow.camera.far = lightDistance + maxRadius;
      light.current.shadow.camera.bottom = light.current.shadow.camera.left = -maxRadius;
      light.current.shadow.camera.right = light.current.shadow.camera.top = maxRadius;
      light.current.shadow.camera.updateProjectionMatrix();
      geometry.current.setShadowsEnabled(true);
    } else {
      geometry.current.setShadowsEnabled(false);
    }

    // create "dark light"
    darkLight.current = new DirectionalLight(darkLightColor, DARKLIGHT_INTENSITY);
    darkLight.current.position.copy(darkLightDirection.negate().multiplyScalar(darkLightDistance));
    group.current.add(darkLight.current);

    // set current shadowMode
    geometry.current.shadowMode = intendedShadowMode;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, ringsPresent, shadowMode, shadowSize, textureSize, surfaceDistance]);

  useEffect(() => {
    if (light.current) light.current.color = new Color().setStyle(STAR_COLOR);
  }, [STAR_COLOR]);

  useEffect(() => {
    if (darkLight.current) darkLight.current.color = new Color().setStyle(DARKLIGHT_COLOR);
  }, [DARKLIGHT_COLOR]);

  // Zooms the camera to the correct location
  useEffect(() => {
    if (zoomStatus === 'zooming-in' && !prevAsteroidPosition && controls) {
      // console.log('set zoomedfrom');
      setZoomedFrom({
        scene: controls.targetScene.position.clone(),
        position: controls.object.position.clone(),
        up: controls.object.up.clone()
      });
    }
  }, [zoomStatus]);

  const shouldZoomIn = zoomStatus === 'zooming-in' && controls && config?.radius;
  useEffect(() => {
    if (!shouldZoomIn || !initialOrientation || !config) return;
    if (!group.current || !position.current) return;

    // if have rotation info and geometry is loaded, can calculate the initial chunks, then set automatingCamera
    // to pause additional chunk calculations while zooming in
    if (geometry.current && rotationAxis.current && rotation.current) {
      automatingCamera.current = true;

      const geometryFramedPosition = initialOrientation.objectPosition.clone();
      geometryFramedPosition.applyAxisAngle(rotationAxis.current, -rotation.current);
      geometry.current.setCameraPosition(geometryFramedPosition);
    }

    controls.maxDistance = Infinity;

    group.current.position.copy(new Vector3(...position.current));

    // TODO: zoomingDuration should probably be distance-dependent
    const zoomingDuration = ZOOM_IN_ANIMATION_TIME / 1e3;
    const timeline = gsap.timeline({
      defaults: { duration: zoomingDuration, ease: 'power4.out' },
      onComplete: () => {
        // console.log('on complete');
        updateZoomStatus('in', true);
      }
    });

    // Pan the target scene to center the asteroid
    // (not full duration because we want scene to beat camera to place)
    timeline.to(controls.targetScene.position, { ...initialOrientation.targetScenePosition, duration: zoomingDuration - 0.25 }, 0);

    // Zoom in the camera to the asteroid
    timeline.to(controls.object.position, { ...initialOrientation.objectPosition }, 0);

    // Set Up
    timeline.to(controls.object.up, { ...initialOrientation.objectUp, ease: 'slow.out' }, 0);

    // make sure can see asteroid as zoom
    controls.object.near = 100;
    controls.object.updateProjectionMatrix();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ shouldZoomIn, !initialOrientation ]);

  const shouldFinishZoomIn = zoomStatus === 'in' && controls && config?.radius;
  useEffect(() => {
    if (!shouldFinishZoomIn || !initialOrientation) return;

    const panTo = new Vector3(...position.current);
    group.current?.position.copy(panTo);
    panTo.negate();

    controls.targetScene.position.copy(initialOrientation.targetScenePosition);
    controls.object.position.copy(initialOrientation.objectPosition);
    controls.object.up.copy(initialOrientation.objectUp);

    // Update distances to maximize precision
    controls.minDistance = config.radius * MIN_ZOOM_DEFAULT;
    controls.maxDistance = Math.max(config.radius * MAX_ZOOM, INITIAL_ZOOM * 1.2);

    // set zoom speed for this scale
    controls.zoomSpeed = 1.2 * Math.pow(0.4, Math.log(config?.radiusNominal / 1000) / Math.log(9));
    controls.object.near = 100;

    controls.object.updateProjectionMatrix();
    controls.noPan = true;

    automatingCamera.current = false;

    // console.log('asteroidId.current', `${asteroidId.current}`);
    setZoomedIntoAsteroidId(asteroidId.current);
    setPrevAsteroidPosition();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ shouldFinishZoomIn, INITIAL_ZOOM ]);

  // Handle zooming back out
  const shouldZoomOut = zoomStatus === 'zooming-out' && zoomedFrom && controls;
  useEffect(() => {
    if (!shouldZoomOut) return;

    controls.minDistance = 0;
    controls.maxDistance = 10 * constants.AU;

    const timeline = gsap.timeline({
      defaults: { duration: ZOOM_OUT_ANIMATION_TIME / 1e3, ease: 'power4.in' },
      onComplete: () => {
        controls.targetScene.position.copy(zoomedFrom.scene);
        controls.object.position.copy(zoomedFrom.position);
        controls.object.up.copy(zoomedFrom.up);
        controls.object.near = 1000000;
        controls.object.updateProjectionMatrix();
        controls.noPan = false;
        updateZoomStatus('out');
      }
    });

    // Pan the scene back to the original orientation
    timeline.to(controls.targetScene.position, { ...zoomedFrom.scene }, 0);

    // Zoom the camera out and put it right side up
    timeline.to(controls.object.position, { ...zoomedFrom.position }, 0);
    timeline.to(controls.object.up, { ...zoomedFrom.up }, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ shouldZoomOut ]);

  useEffect(() => {
    if (!cameraAltitude || !frustumHeightMult) return;
    const frustumWidth = cameraAltitude * frustumHeightMult * window.innerWidth / window.innerHeight;
    const thetaAcrossScreen = frustumWidth / controls.object.position.length();
    controls.rotateSpeed = Math.min(1.5, 1.5 * thetaAcrossScreen / 2);
  }, [cameraAltitude, frustumHeightMult]); // eslint-disable-line react-hooks/exhaustive-deps

  const getClosestChunk = useCallback((cameraPosition) => {
    if (!geometry.current?.chunks) return null;
    const [closestChunk] = Object.values(geometry.current.chunks).reduce((acc, c) => {
      const distance = c.sphereCenter.distanceTo(cameraPosition);
      return (acc.length === 0 || distance < acc[1]) ? [c, distance] : acc;
    }, []);
    return closestChunk;
  }, []);

  const getMinDistance = useCallback((closestChunk) => {
    return Math.min(
      config?.radius * MIN_ZOOM_DEFAULT,  // for smallest asteroids to match legacy (where this > min surface distance)
      closestChunk.sphereCenterHeight + surfaceDistance
    );
  }, [config?.radius, surfaceDistance]);

  // NOTE: in theory, all distances between sphereCenter's to camera are calculated
  //       in quadtree calculation and could be passed back here, so would be more
  //       performant to re-use that BUT that is also outdated as the camera moves
  //       until the quads are recalculated
  // NOTE: raycasting technically *might* be more accurate here, but it's way less performant
  //       (3ms+ for just closest mesh... if all quadtree children, closer to 20ms)
  const applyingZoomLimits = useRef(0);
  const applyZoomLimits = useCallback((cameraPosition) => {
    if (!config?.radius) return;
    applyingZoomLimits.current = true;
    setTimeout(() => {
      if (automatingCamera.current) {
        applyingZoomLimits.current = false;
        return;
      }

      const closestChunk = getClosestChunk(cameraPosition);
      if (!closestChunk) {
        applyingZoomLimits.current = false;
        return;
      }

      const minDistance = getMinDistance(closestChunk);

      // too close, so should animate camera out
      // (if within 5, we are fine to just move the camera back without animation)
      if (minDistance > cameraPosition.length() + 5) {
        // jump back to surface as needed
        controls.minDistance = Math.max(cameraPosition.length(), closestChunk.sphereCenterHeight);
        // figure out how much farther we need to animate (actual animation handled in useFrame)
        applyingZoomLimits.current = minDistance - controls.minDistance;

      // else, can just set
      } else {
        controls.minDistance = minDistance;
        applyingZoomLimits.current = false;
      }

      // adjust rotation speed
      setCameraAltitude(cameraPosition.length() - closestChunk.sphereCenterHeight);
    }, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surfaceDistance, config?.radius, controls?.minDistance]);

  useEffect(() => {
    const resourceMapActive = resourceMap?.active;
    const resourceMapId = resourceMap?.selected;

    if (!geometry.current || !config?.radiusNominal || !asteroidData?.Celestial?.abundances) return;
    if (resourceMapActive && resourceMapId && terrainInitialized) {
      const categoryKey = keyify(Product.TYPES[resourceMapId]?.category);
      const color = new Color(theme.colors.resources[categoryKey]);

      // Collect relevant settings for generating procedural resource map
      const settings = Asteroid.getAbundanceMapSettings(
        asteroidData.id,
        resourceMapId,
        asteroidData.Celestial.abundances,
      );
      // console.log('settings', settings, {
      //   asteroidId: asteroidData.id,
      //   color,
      //   resource: resourceMapId,
      //   intensityMult: EMISSIVE_INTENSITY[categoryKey],
      //   ...settings
      // });
      geometry.current.setEmissiveParams({
        asteroidId: asteroidData.id,
        color,
        resource: resourceMapId,
        intensityMult: EMISSIVE_INTENSITY[categoryKey],
        ...settings
      });
      forceUpdate.current = Date.now();
    } else if (geometry.current.emissiveParams) {
      geometry.current.setEmissiveParams();
      forceUpdate.current = Date.now();
    }
  }, [resourceMap, terrainInitialized, !asteroidData?.Celestial?.abundances]);

  useEffect(() => {
    if (geometry.current && terrainUpdateNeeded) {
      // vvv BENCHMARK 2ms (zoomed-out), 4-20ms+ (zoomed-in)
      lastUpdateStart.current = Date.now();
      // if (!disableChunks.current)
      geometry.current.setCameraPosition(terrainUpdateNeeded);
      settingCameraPosition.current = false;
      // ^^^
    }
  }, [terrainUpdateNeeded]);

  // NOTE: to stop / start chunk splitting with shift+space, can
  //  uncomment below and the "disableChunks" line above
  // const disableChunks = useRef();
  // useEffect(() => {
  //   const onKeydown = (e) => {
  //     if (e.shiftKey && e.which === 32) {
  //       disableChunks.current = !disableChunks.current;
  //     }
  //   };
  //   document.addEventListener('keydown', onKeydown);
  //   return () => {
  //     document.removeEventListener('keydown', onKeydown);
  //   }
  // }, []);

  // const ddd = useRef();
  // useEffect(() => {
  //   if (!config?.radius) return;
  //   const onKeydown = (e) => {
  //     if (e.shiftKey && e.which === 32) {
  //       if (!ddd.current) {
  //         ddd.current = [
  //           controls.targetScene.position.clone(),
  //           controls.object.position.clone(),
  //           controls.target.clone()
  //         ];
  //         console.log('store', ddd.current);

  //         const l = 2 * config.radius;

  //         controls.maxDistance = Infinity;
  //         // controls.targetScene.position
  //         //   .add(controls.object.position.clone().negate().setLength(l))
  //         //   .add(new Vector3(50000, 0, 0));
  //         controls.targetScene.position.copy(new Vector3(0, 0, 0));
  //         // controls.object.position.setLength(
  //         //   controls.object.position.length() + l
  //         // );
  //         // controls.target.add(
  //         //   controls.object.position.clone().negate().setLength(l)
  //         // );
  //         // controls.target.setLength(controls.target.length() * 0.4);
  //         controls.object.updateProjectionMatrix();
  //         controls.update();

  //       } else {
  //         console.log('restore', ddd.current);
  //         controls.targetScene.position.copy(ddd.current[0]);
  //         // controls.object.position.copy(ddd.current[1]);
  //         // controls.target.copy(ddd.current[2]);
  //         controls.object.updateProjectionMatrix();
  //         controls.update();
  //         ddd.current = null;
  //       }
  //     }
  //   };
  //   document.addEventListener('keydown', onKeydown);
  //   return () => {
  //     document.removeEventListener('keydown', onKeydown);
  //   }
  // }, [controls, config?.radius]);

  const [dramaticZoom, setDramaticZoom] = useState();
  useEffect(() => {
    setDramaticZoom(true);
  }, [origin]);

  const [cameraRecenterTimestamp, setCameraRecenterTimestamp] = useState(0);
  useEffect(() => {
    if (cameraNeedsRecenter) {
      dispatchRecenterCamera();
      setCameraRecenterTimestamp(Date.now())
    }
  }, [cameraNeedsRecenter]);

  useEffect(() => {
    if (cameraNeedsHighAltitude && config?.radius && zoomStatus === 'in' && !automatingCamera.current) {
      const newPosition = new Vector3(...controls.object.position);
      newPosition.setLength(config.radius * 1.5);

      automatingCamera.current = true;
      gsap.timeline({
        defaults: {
          duration: 0.75,
          ease: 'power1.out' // power>1.out seems to have bounce artifact for short trips
        },
        onComplete: () => {
          setCameraAltitude(newPosition.length() - config.radius);
          automatingCamera.current = false;
          setCameraAutomationVersion((v) => v + 1);
          dispatchGoToHighAltitude(false);
        }
      })
      .to(controls.object.position, { ...newPosition });
    }
  }, [cameraNeedsHighAltitude]);

  const [debugTrajectory, setDebugTrajectory] = useState([]);

  const automatingCamera = useRef();
  const selectedLotTween = useRef();
  useEffect(() => {
    if (selectedLot?.lotIndex > 0 && zoomedIntoAsteroidId === selectedLot?.asteroidId && config?.radiusNominal && zoomStatus === 'in') {
      const lotTally = Asteroid.getSurfaceArea(selectedLot?.asteroidId);
      if (lotTally < selectedLot.lotIndex) { dispatchLotSelected(); return; }

      automatingCamera.current = true;
      applyingZoomLimits.current = false;
      selectedLotTween.current?.kill();
      gsap.killTweensOf(controls.object.position);

      const currentCameraHeight = controls.object.position.length();
      const targetAltitude = (cameraAltitude && cameraAltitude < 5000) ? cameraAltitude : 5000;

      const lotPosition = new Vector3(...Asteroid.getLotPosition(selectedLot.asteroidId, selectedLot.lotIndex, lotTally));
      lotPosition.setLength(config.radius).multiply(config.stretch); // best guess of lot position
      lotPosition.setLength(lotPosition.length() + targetAltitude); // best guess of final camera position

      // regenerate chunks for the destination, then get closest
      // (then iterate because depending on how far away starting from and the size of the asteroid,
      //  the first guess may be pretty far off... the 2nd should be very close though)
      // TODO (enhancement): move this to webworker
      // TODO: experiment with skipping 2nd iteration if asteroid below certain size
      let closestChunk;
      for (let i = 0; i < 2; i++) {
        // vvv BENCHMARK 3.5 - 7ms
        geometry.current.setCameraPosition(lotPosition);
        if (geometry.current.queuedChanges.length > 0) {
          const x = geometry.current.queuedChanges.reduce((acc, changeSet) => {
            return changeSet.add.reduce((acc, c) => {
              const distance = c.sphereCenter.distanceTo(lotPosition);
              return (acc.length === 0 || distance < acc[1]) ? [c, distance] : acc;
            }, acc);
          }, []);
          closestChunk = x[0];

          // 2nd pass will be more accurate now that first pass gives us an accurate guess for altitude
          // TODO (enhancement): if this is close to original location, this is probably not necessary
          if (closestChunk) {
            lotPosition.setLength(closestChunk.sphereCenterHeight + targetAltitude);
          }
        }
        // ^^^
      }
      if (!closestChunk) {
        closestChunk = getClosestChunk(lotPosition);
      }

      // figure out how far we are traveling to adjust animation time for short trips
      const currentUnrotatedCameraPosition = controls.object.position.clone();
      currentUnrotatedCameraPosition.applyAxisAngle(rotationAxis.current, -rotation.current);

      // lot position has not yet been rotated
      const radiansBetween = currentUnrotatedCameraPosition.angleTo(lotPosition);
      // console.log({ currentUnrotatedCameraPosition: currentUnrotatedCameraPosition.toArray(), unrotatedLotPosition: lotPosition.toArray(), radiansBetween });
      const arcLength = config.radius * radiansBetween;
      const metersPerSecond = 25000;
      const animationTime = Math.floor(
        (dramaticZoom ? ZOOM_TO_PLOT_DRAMATIC_MULT : 1) * Math.min(
          ZOOM_TO_PLOT_ANIMATION_MAX_TIME / ZOOM_TO_PLOT_DRAMATIC_MULT,
          Math.max(ZOOM_TO_PLOT_ANIMATION_MIN_TIME, 1e3 * arcLength / metersPerSecond)
        )
      );
      // console.log('arcLength', arcLength, animationTime);

      const onZoomComplete = () => {
        if (closestChunk) {
          setCameraAltitude(controls.object.position.length() - closestChunk.sphereCenterHeight);
        }
        selectedLotTween.current = null;
        automatingCamera.current = false;
        setCameraAutomationVersion((v) => v + 1);
        setDramaticZoom(false);
      };

      // apply rotation to lotPosition (adjusting for mid-animation rotation of asteroid)
      const arrivalTime = getTime(Date.now() + animationTime);
      const willBeRotation = arrivalTime * config.rotationSpeed * 2 * Math.PI;
      lotPosition.applyAxisAngle(rotationAxis.current, willBeRotation);
      // console.log({ actualCameraPosition: controls.object.position.toArray(), rotatedLotPosition: lotPosition.toArray() });

      // if farther than 10000 out, adjust in to altitude of 5000
      // if closer than surfaceDistance, adjust out to altitude of surfaceDistance
      // else, will just reuse camera height
      if (closestChunk) {
        const predictedAltitude = currentCameraHeight - closestChunk.sphereCenterHeight;
        // console.group();
        // console.log(`predictedAltitude ${predictedAltitude} at height ${closestChunk.sphereCenterHeight + predictedAltitude}`);
        if (predictedAltitude > 10000) {
          // console.log(`zoom IN to ${closestChunk.sphereCenterHeight} + 5000`, closestChunk.sphereCenterHeight + 5000);
          lotPosition.setLength(closestChunk.sphereCenterHeight + 5000);
        } else {
          const minDistance = getMinDistance(closestChunk);
          if(currentCameraHeight + predictedAltitude < minDistance) {
            // console.log(`zoom OUT to ${minDistance} + Math.min(${cameraAltitude} || Infinity, 5000)`, minDistance + Math.min(cameraAltitude || Infinity, 5000));
            lotPosition.setLength(minDistance + Math.min(cameraAltitude || Infinity, 5000));
          } else {
            lotPosition.setLength(currentCameraHeight);
          }
        }
      }

      const maxCoarseDisp = (config.dispWeight || 1) * (1 - config.fineDispFraction || 1);
      // console.log({ maxCoarseDisp })
      const lerpPoints = [];

      if (radiansBetween > (config.radius > 5000 ? 0.5 : 1)) {
        const midpointTally = Math.floor(12 * radiansBetween);
        const quatA = (new Quaternion()).setFromUnitVectors(
          new Vector3(0, 0, 1),
          controls.object.position.clone().normalize()
        );
        const heightA = controls.object.position.length();
        const quatB = (new Quaternion()).setFromUnitVectors(
          new Vector3(0, 0, 1),
          lotPosition.clone().normalize()
        );
        const heightB = lotPosition.length();

        for (let i = 0; i < midpointTally; i++) {
          const lerp = (i + 1) / (midpointTally + 1);

          const midQ = quatA.clone().slerp(quatB, lerp).normalize();
          const midpoint = new Vector3(0, 0, 1).applyQuaternion(midQ);

          // get simple lerp height between initial camera position and final
          const lerpHeight = heightA * (1 - lerp) + heightB * lerp;

          // guesstimate a safe min height based on asteroid surface distortion
          const safeHeight = midpoint.clone().applyAxisAngle(rotationAxis.current, -willBeRotation);  // get unrotated position so can stretch properly
          safeHeight.setLength(config.radius).multiply(config.stretch); // best guess of highest possible surface at midpoint
          safeHeight.setLength(safeHeight.length() * (1 + maxCoarseDisp) + targetAltitude); // aim for target altitude

          // apply the height to the minpoint
          midpoint.setLength(Math.max(lerpHeight, safeHeight.length()));
          lerpPoints.push({ ...midpoint });
        }

        // add final destination
        lerpPoints.push({ ...lotPosition });

        // setDebugTrajectory(lerpPoints);

        // create a linear animation sequence
        const timeline = gsap.timeline({
          paused: true,
          onComplete: onZoomComplete
        });
        lerpPoints.forEach((p) => timeline.to(controls.object.position, { ...p, ease: 'linear' }));

        // run the timeline as a single animation
        selectedLotTween.current = gsap.to(timeline, animationTime / 1e3, { progress: 1, ease: 'power4.out' });

      } else {
        selectedLotTween.current = gsap.timeline({
          defaults: {
            duration: animationTime / 1e3,
            ease: 'power1.out' // power>1.out seems to have bounce artifact for short trips
          },
          onComplete: onZoomComplete
        })
        .to(controls.object.position, { ...lotPosition });
      }
    }
  }, [cameraRecenterTimestamp, zoomedIntoAsteroidId, origin, selectedLot, config?.radiusNominal, zoomStatus]);

  useEffect(() => {
    if (!cameraNeedsReorientation || zoomStatus !== 'in') return;
    dispatchReorientCamera();
    gsap.timeline().to(controls.object.up, { ...rotationAxis.current.clone(), ease: 'slow.out' });
  }, [cameraNeedsReorientation]);

  // Positions the asteroid in space based on time changes
  useFrame((state) => {
    if (!asteroidData) return;
    if (!geometry.current?.builder?.ready) return;

    const frameStart = getNow();

    let updatedMapsThisCycle = false;
    chunkSwapThisCycle.current = false;

    // vvv BENCHMARK <0.1ms
    // update asteroid position
    const time = getTime();
    if (asteroidOrbit.current && time) {
      position.current = Object.values(asteroidOrbit.current.getPositionAtTime(time));

      // update object and camera position (if zoomed in to the correct asteroid)
      if (zoomStatus === 'in' && zoomedIntoAsteroidId === origin) {
        const positionVec3 = new Vector3(...position.current);
        group.current.position.copy(positionVec3);
        controls.targetScene.position.copy(positionVec3.negate());
      }

      // update light position (since asteroid has moved around star)
      if (zoomStatus !== 'out') {
        if (light.current) {
          const sunMax = 0.5
          const sunMin = 0.3
          const sunFalloff = Math.min(config.radius / 6, 500);
          const sunIntensity = Math.min(sunMax, Math.max(sunMax - Math.sqrt(sunFalloff / cameraAltitude), sunMin));
          light.current.intensity = STAR_INTENSITY_ADJ * sunIntensity;
          light.current.position.copy(
            new Vector3(...position.current).normalize().negate().multiplyScalar(config.radius * DIRECTIONAL_LIGHT_DISTANCE)
          );
        }

        if (darkLight.current) {
          const darkSunMax = 0.5
          const darkSunMin = 0.25
          const falloff = Math.min(config.radius / 4, 2000);
          const intensity = Math.max(darkSunMin, Math.min(Math.sqrt(falloff / cameraAltitude), darkSunMax));
          darkLight.current.intensity = DARKLIGHT_INTENSITY * intensity;
          darkLight.current.position.copy(
            new Vector3(...position.current).normalize().multiplyScalar(config.radius * DIRECTIONAL_LIGHT_DISTANCE)
          );
        }
      }
    }

    // update asteroid rotation
    let updatedRotation = rotation.current;
    if (config?.rotationSpeed && time) {
      updatedRotation = time * config.rotationSpeed * 2 * Math.PI;
      // updatedRotation = 0; // TODO: remove
      if (updatedRotation !== rotation.current) {
        quadtreeRef.current.setRotationFromAxisAngle(
          rotationAxis.current,
          updatedRotation
        );
        // if (debug.current) {  // TODO: remove debug
        //   debug.current.setRotationFromAxisAngle(
        //     rotationAxis.current,
        //     updatedRotation
        //   );
        // }

        // lock to surface if within "lock" radius OR lot is selected
        // TODO: consider automatically deselecting lot if zoom out enough
        lockToSurface.current = (controls.object.position.length() < 1.1 * config.radius) || selectedLot;
        if (lockToSurface.current && !automatingCamera.current) {
          controls.object.up.applyAxisAngle(rotationAxis.current, updatedRotation - rotation.current);
          controls.object.position.applyAxisAngle(rotationAxis.current, updatedRotation - rotation.current);
          controls.object.updateProjectionMatrix();
        }

        rotation.current = updatedRotation;
      }
    }

    // (if currently zooming in, we'll want to setCameraPosition for camera's destination so doesn't
    //  re-render as soon as it arrives)
    const rotatedCameraPosition = (zoomStatus === 'in' || !config?.radius)
      ? controls.object.position.clone()
      : controls.object.position.clone().normalize().multiplyScalar(INITIAL_ZOOM);
    rotatedCameraPosition.applyAxisAngle(rotationAxis.current, -rotation.current);
    // ^^^

    // if builder is working on an update, manage within frame rate
    if (!automatingCamera.current && geometry.current.builder.isUpdating()) {
      // keep building maps until maps are ready (some per frame)
      if (geometry.current.builder.isWaitingOnMaps()) {
        // TODO: (redo) vvv BENCHMARK (~1ms / max frameTimeLeftms)
        geometry.current.builder.updateMaps(Date.now() + frameTimeLeft(frameStart, false));
        // ^^^

        updatedMapsThisCycle = true;
      }

      // when ready to finish, actually run chunk swap
      if (!geometry.current.builder.isWaitingOnMaps()) {

        // if this is the only thing doing this cycle, have to always do it (even if not enough time)
        // if this was also processing maps this cycle, can bump chunk swap to next loop if helpful
        if (!updatedMapsThisCycle || frameTimeLeft(frameStart, true) > 0) {

          // TODO: (redo) vvv BENCHMARK <0.1ms
          geometry.current.builder.update();
          chunkSwapThisCycle.current = true;
          // ^^^

          // terrain is initialized once run first update
          if (!terrainInitialized) {
            setTerrainInitialized(true);
          }

          // if (debug.current) {
          //   const vertices = Object.values(geometry.current.chunks)
          //     .map((c) => c.sphereCenter.clone().addScalar(1))
          //     .reduce((acc, cur) => {
          //       acc.push(cur.x);
          //       acc.push(cur.y);
          //       acc.push(cur.z);
          //       return acc;
          //     }, [])
          //   ;
          //   debug.current.geometry.setAttribute('position', new BufferAttribute( new Float32Array(vertices), 3 ) );
          //   debug.current.geometry.attributes.position.needsUpdate = true;
          // }
        }
      }
    }

    // if zoomed out, let run once to prerender, but then don't run the rest of the frame
    if (geometry.current.cameraPosition && (zoomStatus === 'out' || zoomStatus === 'zooming-out')) return;

    // control dynamic zoom limit (zoom out if too low... else, just update boundary)
    if (frameTimeLeft(frameStart, chunkSwapThisCycle.current) <= 0) return;
    if (controls && Object.values(geometry.current?.chunks).length) {
      if (automatingCamera.current) {
        applyingZoomLimits.current = false;
      } else if (applyingZoomLimits.current) {
        if (applyingZoomLimits.current !== true) {
          const amount = Math.max(5, applyingZoomLimits.current / 10);
          applyingZoomLimits.current = Math.max(0, applyingZoomLimits.current - amount);
          controls.minDistance += amount;
        }
      } else {
        // vvv BENCHMARK <0.1ms
        applyZoomLimits(rotatedCameraPosition);
        // ^^^
      }
    }

    // update quads if not already updating AND one of these is true...
    //  a) camera height changes by UPDATE_DISTANCE_MULT
    //  b) camera position changes by rotational equivalent of UPDATE_DISTANCE_MULT at maxStretch surface
    if (frameTimeLeft(frameStart, chunkSwapThisCycle.current) <= 0) return;
    if (!settingCameraPosition.current && !geometry.current.builder.isBusy() && !geometry.current.builder.isUpdating()) {
      // vvv BENCHMARK <0.01ms
      const cameraHeight = rotatedCameraPosition.length();
      const updateQuadtreeEvery = geometry.current.smallestActiveChunkSize * UPDATE_DISTANCE_MULT;
      const updateQuadCube = forceUpdate.current > lastUpdateStart.current
        || !geometry.current.cameraPosition
        || Math.abs(geometry.current.cameraPosition.length() - cameraHeight) > updateQuadtreeEvery
        || geometry.current.cameraPosition.distanceTo(rotatedCameraPosition) > updateQuadtreeEvery * cameraHeight / (config.radius * maxStretch)
      ;
      // ^^^

      // initiate update of quads (based on camera position)
      // if camera is not currently moving
      if (updateQuadCube && !automatingCamera.current) {
        settingCameraPosition.current = true;
        // TODO: setting state in useFrame is an antipattern, BUT this should
        //  only set state rarely, so it's prob ok to move the resulting calculations
        //  outside the render loop (could instead just wrap in setTimeout 0)
        setTerrainUpdateNeeded(rotatedCameraPosition.clone());

        const normalized = rotatedCameraPosition.clone().normalize();
        setCameraNormalized({
          // toFixed allows accuracy without float precision weirdness causing unnecessary re-renders
          string: Object.values(normalized).map((v) => v.toFixed(6)).join(','),
          vector: normalized,
        });
      }
    }

    // if not processing an update already, and camera is not currently moving, process next change for cube
    if (frameTimeLeft(frameStart, chunkSwapThisCycle.current) <= 0) return;
    if (!automatingCamera.current && !geometry.current.builder.isUpdating() && !settingCameraPosition.current) {
      // vvv BENCHMARK <0.1ms
      geometry.current.processNextQueuedChange();
      // ^^^
    }

    // dbg('frame loop', frameStart);

    // TODO: remove debug
    // setTimeout(() => {
    //   const debugInfo = document.getElementById('debug_info');
    //   if (!!debugInfo && config?.radius) {
    //     debugInfo.innerText = (controls.object.position.length() / config?.radius).toFixed(2);
    //   } else {
    //     console.log('#debug_info not found!');
    //   }
    // });
  });

  useFrame(() => {
    renderTimer.current = getNow();
  }, 1);

  // NOTE: useFrame 2 is renderer w/ postprocessor
  useFrame(() => {
    reportRenderTime(
      chunkSwapThisCycle.current ? 'W_SWAP' : 'WO_SWAP',
      getNow() - renderTimer.current
    );
  }, 3);

  return (
    <group ref={group}>
      <group ref={quadtreeRef} />

      {config && terrainInitialized && zoomStatus === 'in' && (
        <Lots
          attachTo={quadtreeRef.current}
          asteroidId={asteroidId.current}
          axis={rotationAxis.current}
          cameraAltitude={cameraAltitude}
          cameraAutomationVersion={cameraAutomationVersion}
          cameraNormalized={cameraNormalized}
          config={config}
          getCameraIsAnimating={() => automatingCamera.current}
          getRotation={() => rotation.current}
          getLockToSurface={() => lockToSurface.current} />
      )}

      {/* TODO: fade telemetry out at higher zooms */}
      {config?.radius && zoomStatus !== 'out' && initialOrientation?.objectPosition && (
        <Telemetry
          axis={rotationAxis.current}
          getPosition={() => position.current}
          getRotation={() => rotation.current}
          hasAccess={false}
          initialCameraPosition={initialOrientation?.objectPosition}
          isScanned={asteroidData?.Celestial?.scanStatus >= Asteroid.SCAN_STATUSES.SURFACE_SCANNED}
          radius={config.radius}
          scaleHelper={SCALE_HELPER}
          shipTally={shipsInOrbitTally}
          spectralType={Asteroid.getSpectralType(config.spectralType)}
        />
      )}

      {ringsPresent && geometry.current && zoomStatus !== 'out' && (
        <Rings
          receiveShadow={shadowMode > 0}
          config={config}
          onUpdate={(m) => m.lookAt(rotationAxis?.current)} />
      )}

      {/* TODO: remove all helpers */}
      {false && (
        <mesh>
          <sphereGeometry args={[config?.radius * 1.25]} />
          <meshStandardMaterial color={0x0000ff} opacity={0.8} transparent />
        </mesh>
      )}
      {false && (
        <points ref={debug}>
          <pointsMaterial attach="material" size={500} sizeAttenuation color={0xff0000} />
        </points>
      )}
      {false && darkLight.current && (
        <primitive object={new DirectionalLightHelper(darkLight.current, 2 * config?.radius)} />
      )}
      {false && light.current?.shadow?.camera && <primitive object={new CameraHelper(light.current.shadow.camera)} />}
      {false && <primitive object={new AxesHelper(config?.radius * 2)} />}
      {false && debugTrajectory?.length && (
        <group>
          {debugTrajectory.map((pos, i) => (
            <mesh position={[ ...Object.values(pos) ]}>
              <sphereGeometry args={[5000]} />
              <meshBasicMaterial color={trajDebugColors[i % trajDebugColors.length]} opacity={0.8} transparent />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

export default AsteroidComponent;
