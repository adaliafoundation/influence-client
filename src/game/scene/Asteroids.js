import { Suspense, useCallback, useEffect, useRef, useState, useMemo } from 'react';
import styled from 'styled-components';
import { AxesHelper, Color, Float32BufferAttribute, Vector3 } from 'three';
import { useThrottleCallback } from '@react-hook/throttle';
import { useThree } from '@react-three/fiber';
import { Html, useTexture } from '@react-three/drei';
import gsap from 'gsap';
import { cloneDeep } from 'lodash';
import { Entity } from '@influenceth/sdk';

import { CaptainIcon, MyAssetIcon, ShipMarkerIcon } from '~/components/Icons';
import useCrewContext from '~/hooks/useCrewContext';
import useAsteroid from '~/hooks/useAsteroid';
import useAssetSearch from '~/hooks/useAssetSearch';
import useCoarseTime from '~/hooks/useCoarseTime';
import useStore from '~/hooks/useStore';
import useTravelSolutionIsValid from '~/hooks/useTravelSolutionIsValid';
import useWatchlist from '~/hooks/useWatchlist';
import useWebWorker from '~/hooks/useWebWorker';
import constants from '~/lib/constants';
import { WorkerQueuePriority } from '~/lib/workerQueue';
import Orbit from './asteroids/Orbit';
import Marker from './asteroids/Marker';
import TravelSolution from './asteroids/TravelSolution';
import highlighters from './asteroids/highlighters';
import vert from './asteroids/asteroids.vert';
import frag from './asteroids/asteroids.frag';
import { ZOOM_IN_ANIMATION_TIME, ZOOM_OUT_ANIMATION_TIME } from './Asteroid';
import { formatBeltDistance } from '../interface/hud/actionDialogs/components';
import formatters from '~/lib/formatters';
import theme from '~/theme';
import useWalletShips from '~/hooks/useWalletShips';
import useWalletAsteroids from '~/hooks/useWalletAsteroids';

const blueMarkerColor = new Color(theme.colors.brightMain);
const redMarkerColor = new Color(theme.colors.red);

const AsteroidTooltip = styled.div`
  align-items: flex-end;
  display: flex;
  flex-direction: row;
  & > div:first-child {
    opacity: ${p => p.hasActiveCrew ? 1 : 0};
    padding-bottom: 3px;
  }
  & > div:last-child {
    align-items: flex-start;
    display: flex;
    flex-direction: column;
    & > span {
      background: rgba(0, 0, 0, 0.7);
      padding: 2px 4px;
      white-space: nowrap;
    }
  }
`;

const DistanceTooltip = styled.div`
  background: rgba(0, 0, 0, 0.7);
  color: #999;
  font-size: 15px;
  left: -50%;
  top: -7.5px;
  padding: 2px 4px;
  position: relative;
  text-transform: uppercase;
  white-space: nowrap;
`;

const updateGeometryAttribute = (geometry, name, array, itemSize) => {
  const attribute = geometry.getAttribute(name);
  if (attribute?.array?.length === array.length) {
    if (attribute.array !== array) attribute.array.set(array);
    attribute.needsUpdate = true;
  } else {
    geometry.setAttribute(name, new Float32BufferAttribute(array, itemSize));
  }
};

const buildAsteroidIndexById = (asteroids) => {
  return asteroids.reduce((indexById, asteroid, index) => {
    indexById[asteroid.id] = index;
    return indexById;
  }, {});
};

const Asteroids = () => {
  const { controls } = useThree();
  const originId = useStore(s => s.asteroids.origin);
  const destinationId = useStore(s => s.asteroids.destination);
  const hovered = useStore(s => s.asteroids.hovered);
  const zoomStatus = useStore(s => s.asteroids.zoomStatus);
  const routePlannerActive = false; // TODO: (when route planning restored)
  const highlightConfig = useStore(s => s.assetSearch.asteroidsMapped.highlight);
  const cameraNeedsReorientation = useStore(s => s.cameraNeedsReorientation);
  const isAssetSearchMatchingDefault = useStore(s => s.isAssetSearchMatchingDefault);
  const filters = useStore(s => s.assetSearch.asteroidsMapped?.filters);
  const openHudMenu = useStore(s => s.openHudMenu);
  const travelMode = useStore(s => s.asteroids.travelMode);
  const travelSolution = useStore(s => s.asteroids.travelSolution);
  const dispatchReorientCamera = useStore(s => s.dispatchReorientCamera);
  const hoverAsteroid = useStore(s => s.dispatchAsteroidHovered);
  const unhoverAsteroid = useStore(s => s.dispatchAsteroidUnhovered);
  const selectOrigin = useStore(s => s.dispatchOriginSelected);
  const selectDestination = useStore(s => s.dispatchDestinationSelected);
  const dispatchSwapOriginDestination = useStore(s => s.dispatchSwapOriginDestination);

  const isDefaultSearch = useMemo(() => isAssetSearchMatchingDefault('asteroidsMapped'), [filters]);

  const { processInBackground } = useWebWorker();

  const { crew } = useCrewContext();
  const { data: asteroidSearch } = useAssetSearch('asteroidsMapped');
  const { data: origin } = useAsteroid(originId);
  const { data: destination } = useAsteroid(destinationId);
  const coarseTime = useCoarseTime();
  const { data: controlledAsteroids } = useWalletAsteroids();
  const { data: controlledShips } = useWalletShips();
  const { watchlist: { data: watchlist }} = useWatchlist();
  const travelSolutionValid = useTravelSolutionIsValid();

  const [ mappedAsteroids, setMappedAsteroids ] = useState([]);
  const [ asteroidsWorkerPayload, setAsteroidsWorkerPayload ] = useState();
  const [ positionsReady, setPositionsReady ] = useState(false);
  const [ positionsVersion, setPositionsVersion ] = useState(0);
  const [ colors, setColors ] = useState(new Float32Array());
  const [ hoveredPos, setHoveredPos ] = useState();
  const [ originPos, setOriginPos ] = useState();
  const [ destinationPos, setDestinationPos ] = useState();

  const isUpdating = useRef(false);
  const asteroidsGeom = useRef();
  const positions = useRef(new Float32Array());
  const pointOpacities = useRef(new Float32Array());
  const originPointOpacity = useRef(1);
  const latestPositionsRequest = useRef();

  const asteroids = useMemo(() => {
    return asteroidSearch?.hits?.length > 0 ? asteroidSearch.hits : [];
  }, [asteroidSearch?.hits]);

  const asteroidIndexById = useMemo(() => {
    return buildAsteroidIndexById(mappedAsteroids);
  }, [mappedAsteroids]);

  const assetedAsteroids = useMemo(() => {
    const asseted = {};
    (controlledAsteroids || []).forEach((a) => {
      if (!asseted[a.id]) asseted[a.id] = { asteroid: a };
      asseted[a.id].owned = true;
    });

    if (crew?._location.asteroidId) {
      const crewAsteroidId = crew._location.asteroidId;
      const inList = asteroids.find((a) => a.id === crewAsteroidId);
      if (!asseted[crewAsteroidId] && inList) asseted[crewAsteroidId] = { asteroid: inList };
      if (asseted[crewAsteroidId]) asseted[crewAsteroidId].crew = crew;
    }

    (controlledShips || []).forEach((s) => {
      const shipAsteroidId = s.Location?.locations?.find((l) => l.label === Entity.IDS.ASTEROID)?.id;

      if (shipAsteroidId && !asseted[shipAsteroidId]) {
        const inList = asteroids.find((a) => a.id === shipAsteroidId);
        if (inList) asseted[shipAsteroidId] = { asteroid: inList };
      }

      if (shipAsteroidId && asseted[shipAsteroidId]) asseted[shipAsteroidId].ships = true;
    });

    return asseted;
  }, [asteroids, controlledAsteroids, crew, controlledShips]);

  useEffect(() => {
    if (!asteroidSearch?.hits) return;

    const newMappedAsteroids = asteroids ? cloneDeep(asteroids) : [];

    // in default search, append watchlist and owned as needed
    Object.keys(assetedAsteroids || {}).forEach((i) => {
      const already = newMappedAsteroids.find((a) => a.id === Number(i));
      if (already) already.isAsseted = 1;
      if (!already && isDefaultSearch) newMappedAsteroids.push(Object.assign({ isAsseted: 1 }, assetedAsteroids[i].asteroid));
    });

    // Add isWatched to watchlisted asteroids
    (watchlist || []).forEach((wa) => {
      const already = newMappedAsteroids.find((a) => a.id === wa.id);
      if (already) already.isWatched = 1;
      if (!already && isDefaultSearch) newMappedAsteroids.push(Object.assign({ isWatched: 1 }, wa));
    });

    // append origin and destination in case not already in results
    if (!!origin && !newMappedAsteroids.find(a => a.id === origin.id)) {
      newMappedAsteroids.push(Object.assign({}, origin));
    }

    if (!!destination && !newMappedAsteroids.find(a => a.id === destination.id)) {
      newMappedAsteroids.push(Object.assign({}, destination));
    }

    setAsteroidsWorkerPayload({
      key: newMappedAsteroids.map((a) => a.id).join(','),
      mappedAsteroids: newMappedAsteroids,
      orbitals: newMappedAsteroids.map((a) => a.Orbit),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ asteroidSearch?.hits, asteroids, origin, destination, assetedAsteroids, watchlist ]);

  // Responds to hover changes in the store which could be fired from the HUD
  useEffect(() => {
    if (!hovered || hovered === originId || hovered === destinationId) {
      setHoveredPos(null);
      return;
    }

    const currentPositions = positions.current;
    if (mappedAsteroids.length * 3 === currentPositions.length) {
      const index = asteroidIndexById[hovered];

      if (index !== undefined) {
        const pos = currentPositions.slice(index * 3, index * 3 + 3);
        setHoveredPos(pos);
      } else {
        setHoveredPos(null);
      }
    }
  }, [ hovered, originId, destinationId, positionsVersion, mappedAsteroids, asteroidIndexById ]);

  const getAsteroidColors = useCallback((asteroidsToColor) => {
    const newColors = asteroidsToColor.map(a => {
      if (highlightConfig) return highlighters[highlightConfig.field](a, highlightConfig);
      return [ 1, 1, 1 ];
    });

    return new Float32Array([].concat.apply([], newColors));
  }, [highlightConfig]);

  const getPointOpacities = useCallback((asteroidsToRender, originOpacity = originPointOpacity.current, indexById = asteroidIndexById) => {
    const nextPointOpacities = new Float32Array(asteroidsToRender.length);
    nextPointOpacities.fill(1);

    if (originId) {
      const originIndex = indexById[originId];
      if (originIndex !== undefined) nextPointOpacities[originIndex] = originOpacity;
    }

    return nextPointOpacities;
  }, [asteroidIndexById, originId]);

  const updatePointOpacityAttribute = useCallback(() => {
    if (!asteroidsGeom.current) return;
    updateGeometryAttribute(asteroidsGeom.current, 'pointOpacity', pointOpacities.current, 1);
  }, []);

  const setOriginPointOpacity = useCallback((opacity) => {
    originPointOpacity.current = opacity;
    pointOpacities.current = getPointOpacities(mappedAsteroids, opacity);
    updatePointOpacityAttribute();
  }, [getPointOpacities, mappedAsteroids, updatePointOpacityAttribute]);

  const updatePositions = useCallback((updatedPositions, updatedMappedAsteroids) => {
    if (!updatedPositions) return;

    if (updatedMappedAsteroids) {
      const updatedIndexById = buildAsteroidIndexById(updatedMappedAsteroids);
      setMappedAsteroids(updatedMappedAsteroids);
      setColors(getAsteroidColors(updatedMappedAsteroids));
      pointOpacities.current = getPointOpacities(updatedMappedAsteroids, originPointOpacity.current, updatedIndexById);
    }

    if (positions.current.length === updatedPositions.length) {
      positions.current.set(updatedPositions);
    } else {
      positions.current = updatedPositions;
    }

    if (asteroidsGeom.current) {
      updateGeometryAttribute(asteroidsGeom.current, 'position', positions.current, 3);
      updatePointOpacityAttribute();
      asteroidsGeom.current.computeBoundingSphere();
    }

    setPositionsReady(positions.current.length > 0);
    setPositionsVersion(v => v + 1);
  }, [getAsteroidColors, getPointOpacities, updatePointOpacityAttribute]);

  useEffect(() => {
    const targetOpacity = (
      zoomStatus === 'in' ||
      zoomStatus === 'zooming-in'
    ) ? 0 : 1;

    const duration = (
      zoomStatus === 'zooming-in'
        ? ZOOM_IN_ANIMATION_TIME
        : zoomStatus === 'zooming-out'
          ? ZOOM_OUT_ANIMATION_TIME
          : 0
    ) / 1e3;

    if (duration === 0) {
      setOriginPointOpacity(targetOpacity);
      return;
    }

    const tween = gsap.to(originPointOpacity, {
      current: targetOpacity,
      duration,
      ease: zoomStatus === 'zooming-in' ? 'power4.out' : 'power4.in',
      onUpdate: () => setOriginPointOpacity(originPointOpacity.current),
    });

    return () => tween.kill();
  }, [setOriginPointOpacity, zoomStatus]);

  // Update asteroid positions whenever the time changes in-game or mapped asteroids are updated
  // TODO: would probably have much smoother motion (at very fast-forwarded speeds) by
  //  managing trigger for this in a useFrame loop (rather than listening for coarseTime update),
  //  and setting geometry attributes directly, rather than through state... could potentially do
  //  fewer updates / only update on coarseTime when zoomed in
  const processLatestPositions = useCallback(() => {
    const request = latestPositionsRequest.current;
    if (!request?.payload || !request.elapsed || isUpdating.current) return;

    isUpdating.current = true;
    processInBackground(
      {
        topic: 'updateAsteroidPositions',
        asteroids: {
          key: request.payload.key,
          orbitals: request.payload.orbitals
        },
        elapsed: request.elapsed,
        _cacheable: 'asteroids',
        _priority: WorkerQueuePriority.renderCritical
      },
      (data) => {
        const latestRequest = latestPositionsRequest.current;
        const requestIsLatest = latestRequest
          && latestRequest.payload === request.payload
          && latestRequest.elapsed === request.elapsed;

        if (requestIsLatest) {
          updatePositions(data.positions, request.payload.mappedAsteroids);
        }

        isUpdating.current = false;
        if (!requestIsLatest) processLatestPositions();
      }
    )
  }, [processInBackground, updatePositions]);

  useEffect(() => {
    latestPositionsRequest.current = {
      elapsed: coarseTime,
      payload: asteroidsWorkerPayload
    };
    processLatestPositions();
  }, [coarseTime, asteroidsWorkerPayload, processLatestPositions])

  useEffect(() => {
    const currentPositions = positions.current;
    // Check that we have data, positions are processed, and they're in sync
    if (mappedAsteroids.length * 3 === currentPositions.length) {
      if (originId) {
        const originKey = asteroidIndexById[originId];
        setOriginPos(originKey > -1 ? currentPositions.slice(originKey * 3, originKey * 3 + 3) : null);
      } else {
        setOriginPos(null);
      }

      if (destinationId) {
        const destKey = asteroidIndexById[destinationId];
        setDestinationPos(destKey > -1 ? currentPositions.slice(destKey * 3, destKey * 3 + 3) : null);
      } else {
        setDestinationPos(null);
      }
    }
  }, [ mappedAsteroids, positionsVersion, originId, destinationId, asteroidIndexById ]);

  // Update colors
  useEffect(() => {
    setColors(getAsteroidColors(mappedAsteroids));
  }, [ mappedAsteroids, getAsteroidColors ]);

  useEffect(() => {
    if (!cameraNeedsReorientation || zoomStatus !== 'out' || !controls?.object?.position) return;

    dispatchReorientCamera();
    if (openHudMenu === 'BELT_PLAN_FLIGHT') {
      const timeline = gsap.timeline({
        defaults: { ease: 'slow.out' }
      });
      const newUp = new Vector3(-controls.object.position.x, -controls.object.position.y, 0).normalize();
      if (newUp.length() > 0) {
        timeline.to(controls.object.up, { x: newUp.x, y: newUp.y, z: 0 }, 0);
      }
      timeline.to(controls.object.position, { x: 0, y: 0, z: 7 * constants.AU }, 0);


    } else {
      gsap.timeline().to(controls.object.up, { x: 0, y: 0, z: 1, ease: 'slow.out' });

      // if camera is on z-axis, move off
      if (controls.object.position.x === 0 && controls.object.position.y === 0) {
        gsap.timeline().to(controls.object.position, { x: 4 * constants.AU, y: 0, z: controls.object.position.z, ease: 'slow.out' });
      }
    }
  }, [cameraNeedsReorientation]);

  // mouse event handlers
  const onClick = useCallback((e) => {
    e.stopPropagation();
    const index = e.intersections.sort((a, b) => a.distanceToRay - b.distanceToRay)[0].index;
    if (mappedAsteroids[index]) {
      const clickedAsteroidId = mappedAsteroids[index].id;
      if (clickedAsteroidId === destinationId) {
        dispatchSwapOriginDestination();
      } else if (travelMode && origin) {
        selectDestination(clickedAsteroidId);
      } else {
        selectOrigin(clickedAsteroidId);
      }
    }
  }, [mappedAsteroids, destinationId, travelMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const onContextClick = useCallback((e) => {
    e.stopPropagation();
    const index = e.intersections.sort((a, b) => a.distanceToRay - b.distanceToRay)[0].index;

    if (mappedAsteroids[index]) {
      if (mappedAsteroids[index].id === originId) selectOrigin();
      if (!routePlannerActive) return; // Only allow picking a destination if the route planner is open
      selectDestination(mappedAsteroids[index].id);
    }
  }, [mappedAsteroids, originId, routePlannerActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const setMousePos = useThrottleCallback((mousePos) => {
    if (mousePos && mousePos.intersections?.length > 0) {
      const index = mousePos.intersections.sort((a, b) => a.distanceToRay - b.distanceToRay)[0].index;
      if (mappedAsteroids[index]) {
        return hoverAsteroid(mappedAsteroids[index].id);
      }
    }
    unhoverAsteroid();
  }, 30); // eslint-disable-line react-hooks/exhaustive-deps

  const { assetPositions, assetPositionsById, watchlistPositions } = useMemo(() => {
    const assetPositions = [];
    const assetPositionsById = {};
    const watchlistPositions = [];
    const currentPositions = positions.current;
    if (mappedAsteroids.length * 3 !== currentPositions.length) {
      return {
        assetPositions: new Float32Array(),
        assetPositionsById,
        watchlistPositions: new Float32Array(),
      };
    }

    mappedAsteroids.forEach((a, i) => {
      if (a.id === origin?.id || a.id === destination?.id) {  // always include origin and destination so billboard labeled
        assetPositionsById[a.id] = [currentPositions[i * 3 + 0], currentPositions[i * 3 + 1], currentPositions[i * 3 + 2]];
      } else if (a.isAsseted) {
        assetPositionsById[a.id] = [currentPositions[i * 3 + 0], currentPositions[i * 3 + 1], currentPositions[i * 3 + 2]];
        assetPositions.push(assetPositionsById[a.id][0], assetPositionsById[a.id][1], assetPositionsById[a.id][2]);
      }
      else if (a.isWatched) {
        watchlistPositions.push(currentPositions[i * 3 + 0], currentPositions[i * 3 + 1], currentPositions[i * 3 + 2]);
      }
    });

    return {
      assetPositions: new Float32Array(assetPositions),
      assetPositionsById,
      watchlistPositions: new Float32Array(watchlistPositions),
    }
  }, [mappedAsteroids, origin?.id, destination?.id, watchlist, positionsVersion]); // don't update when mappedAsteroids updated (wait for positions update)

  const [originToDestination, originToDestinationDistance, originToDestinationHalfway] = useMemo(() => {
    if (originPos && destinationPos) {
      const o = new Vector3(originPos[0], originPos[1], originPos[2]);
      const d = new Vector3(destinationPos[0], destinationPos[1], destinationPos[2]);
      return [
        new Float32Array([
          originPos[0], originPos[1], originPos[2],
          destinationPos[0], destinationPos[1], destinationPos[2],
        ]),
        formatBeltDistance(o.distanceTo(d)),
        [
          (originPos[0] + destinationPos[0]) / 2,
          (originPos[1] + destinationPos[1]) / 2,
          (originPos[2] + destinationPos[2]) / 2,
        ]
      ];
    }
    return [];
  }, [originPos, destinationPos]);

  const diamondMarker = useTexture(`${process.env.PUBLIC_URL}/textures/asteroids/solid_diamond.png`);

  const billboardedAsteroids = useMemo(() => {
    const b = {};
    if (origin && originPos) {
      b[origin.id] = {
        a: origin,
        p: Array.from(originPos),
        name: true
      };
    }
    if (destination && destinationPos) {
      b[destination.id] = {
        a: destination,
        p: Array.from(destinationPos),
        name: true
      };
    }
    if (openHudMenu !== 'BELT_PLAN_FLIGHT') {
      Object.keys(assetedAsteroids).forEach((i) => {
        if (assetPositionsById[i] && !b[i]) {
          b[i] = {
            a: assetedAsteroids[i].asteroid,
            p: assetPositionsById[i],
            name: Number(i) === Number(hovered)
          };
        }
      });
    }
    return Object.values(b);
  }, [origin, originPos, destination, destinationPos, assetedAsteroids, assetPositionsById, hovered, openHudMenu]);

  const pointBuffersReady = positionsReady
    && positions.current?.length > 0
    && colors?.length === positions.current.length
    && pointOpacities.current?.length * 3 === positions.current.length;

  return (
    <group>
      {openHudMenu !== 'BELT_PLAN_FLIGHT' && (
        <>
          {/* asset / watchlist markers (zoomed out only) */}
          {zoomStatus === 'out' && (
            <>
              {assetPositions.length > 0 && (
                <points>
                  <pointsMaterial
                    attach="material"
                    color={blueMarkerColor}
                    size={15}
                    sizeAttenuation={false}
                    map={diamondMarker}
                    transparent />
                  <bufferGeometry>
                    <bufferAttribute attach="attributes-position" args={[ assetPositions, 3 ]} />
                  </bufferGeometry>
                </points>
              )}
              {watchlistPositions.length > 0 && (
                <points>
                  <pointsMaterial
                    attach="material"
                    color={redMarkerColor}
                    size={15}
                    sizeAttenuation={false}
                    map={diamondMarker}
                    transparent />
                  <bufferGeometry>
                    <bufferAttribute attach="attributes-position" args={[ watchlistPositions, 3 ]} />
                  </bufferGeometry>
                </points>
              )}
            </>
          )}
          {/* all asteroids */}
          {pointBuffersReady && (
            <points
              onClick={zoomStatus === 'out' && onClick}
              onContextMenu={zoomStatus === 'out' && onContextClick}
              onPointerOver={zoomStatus === 'out' && setMousePos}
              onPointerOut={zoomStatus === 'out' && setMousePos}>
              <bufferGeometry ref={asteroidsGeom}>
                <bufferAttribute attach="attributes-position" args={[ positions.current, 3 ]} />
                <bufferAttribute attach="attributes-highlightColor" args={[ colors, 3 ]} />
                <bufferAttribute attach="attributes-pointOpacity" args={[ pointOpacities.current, 1 ]} />
              </bufferGeometry>
              <shaderMaterial args={[{
                depthWrite: false,
                fragmentShader: frag,
                transparent: true,
                uniforms: {
                  uOpacity: { type: 'f', value: zoomStatus === 'out' ? 1.0 : 0.5 },
                },
                vertexColors: true,
                vertexShader: vert
              }]} />
            </points>
          )}
        </>
      )}

      {zoomStatus === 'out' && (
        <Suspense fallback={null}>
        <>
          {/* hover reticule */}
          {hoveredPos && <Marker asteroidPos={hoveredPos} />}

          {/* selected origin marker and orbit */}
          {originPos && <Marker asteroidPos={originPos} isOrigin hasDestination={!!destination} travelSolution={travelSolution} />}

          {/* selected destination marker and orbit */}
          {destinationPos && <Marker asteroidPos={destinationPos} isDestination travelSolution={travelSolution} />}
          {travelSolution && (
            <>
              <Marker asteroidPos={travelSolution.originPosition} travelSolution={travelSolution} isOrigin isTravelMarker />
              <Marker asteroidPos={travelSolution.destinationPosition} travelSolution={travelSolution} isDestination isTravelMarker />
              {origin && <Orbit asteroid={origin} opacityMult={0.5} />}
              {destination && <Orbit asteroid={destination} opacityMult={0.5} color={!travelSolutionValid ? 'error' : 'success'} />}
            </>
          )}
          {!travelSolution && (
            <>
              {origin && <Orbit asteroid={origin} />}
              {destination && <Orbit asteroid={destination} color="gray" />}
              {origin && destination && (
                <>
                  <line>
                    <bufferGeometry>
                      <bufferAttribute attach="attributes-position" args={[ originToDestination, 3 ]} />
                    </bufferGeometry>
                    <lineBasicMaterial color={0x777777} />
                  </line>
                  <Html
                    position={originToDestinationHalfway}
                    style={{ pointerEvents: 'none' }}>
                    <DistanceTooltip>Distance: {originToDestinationDistance}</DistanceTooltip>
                  </Html>
                </>
              )}
            </>
          )}

          {/* billboarded data */}
          {billboardedAsteroids && (
            <group>
              {billboardedAsteroids.filter(({ p }) => p?.length).map(({ a, p, name }) => (
                <Html
                  key={`billboard_${a.id}`}
                  position={p}
                  style={{ pointerEvents: 'none', transform: `translate(-45px, calc(-100% - ${name ? 15 : 5}px))` }}>
                  <AsteroidTooltip hasActiveCrew={assetedAsteroids[a.id]?.crew}>
                    <div><CaptainIcon /></div>
                    <div>
                      {assetedAsteroids[a.id] && (
                        <span>
                          {assetedAsteroids[a.id]?.owned && <MyAssetIcon />}
                          {assetedAsteroids[a.id]?.ships && <ShipMarkerIcon />}
                        </span>
                      )}
                      {name && (
                        <span>{formatters.asteroidName(a)}</span>
                      )}
                    </div>
                  </AsteroidTooltip>
                </Html>
              ))}
            </group>
          )}

          {/* flight line (only in simulation mode) */}
          <TravelSolution key={travelSolution?.key} />
        </>
        </Suspense>
      )}
      {false && <primitive object={new AxesHelper(2 * constants.AU)} />}
    </group>
  )
};

export default Asteroids;
