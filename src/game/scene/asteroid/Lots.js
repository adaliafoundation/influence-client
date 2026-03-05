import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import {
  CircleGeometry,
  Color,
  FrontSide,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  TextureLoader,
  Vector2,
  Vector3
} from 'three';
import { useQueryClient } from 'react-query';
import { Asteroid, Building, Entity, Lot } from '@influenceth/sdk';

import { appConfig } from '~/appConfig';
import { BLOOM_LAYER } from '~/game/Postprocessor';
import useSession from '~/hooks/useSession';
import useCrewContext from '~/hooks/useCrewContext';
import useStore from '~/hooks/useStore';
import useWebsocket from '~/hooks/useWebsocket';
import useWebWorker from '~/hooks/useWebWorker';
import useMappedAsteroidLots from '~/hooks/useMappedAsteroidLots';
import constants from '~/lib/constants';
import useConstants from '~/hooks/useConstants';
import { getLotGeometryHeightMaps, getLotGeometryHeightMapResolution } from './helpers/LotGeometry';
import Crews from './Crews';
import Deliveries from './Deliveries';

const { MAX_LOTS_RENDERED } = constants;

const WHITE_COLOR = new Color().setHex(0xffffff);
const LEASE_COLOR = new Color().setHex(0xbbf8af); // brightened "green"
const GRAY_COLOR = new Color().setHex(0xcccccc);

const colorCache = {};
const getColor = (hex) => {
  if (!hex) return GRAY_COLOR;
  if (!colorCache[hex]) colorCache[hex] = new Color(hex);
  return colorCache[hex];
}

const PLOT_LOADER_GEOMETRY_PCT = 0.25;

const getMaxInstancesForAltitude = (altitude) => {
  return Math.round(2 * Math.pow(altitude * 2 * Math.tan(Math.PI * 35 / 180) / 1e3, 2));
}

const MOUSEABLE_WIDTH = 800;
const MAX_MESH_INSTANCES = MAX_LOTS_RENDERED;
const PIP_VISIBILITY_ALTITUDE = 25000;
const MOUSE_VISIBILITY_ALTITUDE = PIP_VISIBILITY_ALTITUDE;
const LEASE_VISIBILITY_ALTITUDE = PIP_VISIBILITY_ALTITUDE;
const MAX_LEASE_INSTANCES = getMaxInstancesForAltitude(LEASE_VISIBILITY_ALTITUDE);

const MOUSE_THROTTLE_DISTANCE = 50 ** 2;
const MOUSE_THROTTLE_TIME = 1000 / 30; // ms

const lotUseTextures = {
  [Building.IDS.WAREHOUSE]: `${process.env.PUBLIC_URL}/textures/buildings/Warehouse.png`,
  [Building.IDS.EXTRACTOR]: `${process.env.PUBLIC_URL}/textures/buildings/Extractor.png`,
  [Building.IDS.REFINERY]: `${process.env.PUBLIC_URL}/textures/buildings/Refinery.png`,
  [Building.IDS.BIOREACTOR]: `${process.env.PUBLIC_URL}/textures/buildings/Bioreactor.png`,
  [Building.IDS.FACTORY]: `${process.env.PUBLIC_URL}/textures/buildings/Factory.png`,
  [Building.IDS.SHIPYARD]: `${process.env.PUBLIC_URL}/textures/buildings/Shipyard.png`,
  [Building.IDS.SPACEPORT]: `${process.env.PUBLIC_URL}/textures/buildings/Spaceport.png`,
  [Building.IDS.MARKETPLACE]: `${process.env.PUBLIC_URL}/textures/buildings/Marketplace.png`,
  [Building.IDS.HABITAT]: `${process.env.PUBLIC_URL}/textures/buildings/Habitat.png`,
  [Building.IDS.TANK_FARM]: `${process.env.PUBLIC_URL}/textures/buildings/Tankfarm.png`,
  62: `${process.env.PUBLIC_URL}/textures/buildings/Construction.png`,
  63: `${process.env.PUBLIC_URL}/textures/buildings/Ship.png`
};

const Lots = ({ attachTo: overrideAttachTo, asteroidId, axis, cameraAltitude, cameraNormalized, config, getLockToSurface, getRotation }) => {
  const { token } = useSession();
  const { crew } = useCrewContext();
  const { data: TIME_ACCELERATION } = useConstants('TIME_ACCELERATION');

  const { gl, scene } = useThree();
  const queryClient = useQueryClient();
  const { registerMessageHandler, unregisterMessageHandler, wsReady } = useWebsocket();
  const { processInBackground } = useWebWorker();

  const attachTo = useMemo(() => overrideAttachTo || scene, [overrideAttachTo, scene]);

  const textureQuality = useStore(s => s.graphics.textureQuality);
  const lotId = useStore(s => s.asteroids.lot);
  const dispatchLotsLoading = useStore(s => s.dispatchLotsLoading);
  const dispatchLotSelected = useStore(s => s.dispatchLotSelected);
  const dispatchSearchResults = useStore(s => s.dispatchLotsMappedSearchResults);

  const selectedLotIndex = useMemo(() => Lot.toIndex(lotId), [lotId]);

  const [regionsByDistance, setRegionsByDistance] = useState([]);
  const [lastClick, setLastClick] = useState();
  const [positionsReady, setPositionsReady] = useState(false);
  const [lotsInitialized, setLotsInitialized] = useState(false);
  const [meshesInitialized, setMeshesInitialized] = useState(false);
  const [resultsByRegion, setResultsByRegion] = useState([]);

  const positions = useRef();
  const orientations = useRef();
  const lotsByRegion = useRef([]);

  const mouseableMesh = useRef();
  const lotMeshes = useRef({});

  const textures = useTexture(lotUseTextures);

  const texturesLoaded = useMemo(() => {
    return Object.keys(textures) > 0;
  }, [textures]);

  const lotLeasesMesh = useRef();
  const lastMouseIntersect = useRef(new Vector3());
  const highlighted = useRef();
  const lotLoaderInterval = useRef();

  const mouseHoverMesh = useRef();
  const selectionMesh = useRef();

  const lastMouseUpdatePosition = useRef(new Vector2());
  const lastMouseUpdateTime = useRef(0);
  const mouseIsOut = useRef(false);
  const clickStatus = useRef();

  const PLOT_WIDTH = useMemo(() => Math.min(125, config?.radius / 25), [config?.radius]);
  const BUILDING_RADIUS = useMemo(() => 0.375 * PLOT_WIDTH, [PLOT_WIDTH]);
  const PIP_RADIUS = useMemo(() => 0.25 * PLOT_WIDTH, [PLOT_WIDTH]);
  const RETICULE_WIDTH = 5 * PLOT_WIDTH;

  const chunkyAltitude = useMemo(() => Math.round(cameraAltitude / 500) * 500, [cameraAltitude]);

  // NOTE: for every dependency on `lotDataMap`, should also include `lastLotUpdate` so react triggers it
  //  (it seems react does not handle sparse arrays very well for equality checks)
  // const [lastLotUpdate, setLastLotUpdate] = useState();

  const {
    data: {
      lotUseTallies,
      leasedTally,
      resultTally,
      lastLotUpdate,
      colorMap,
      lotResultMap,
      lotUseMap,
      lotColorMap,
      lotLeasedMap
    },
    isLoading,
    processEvent,
    refetch: refetchLots
  } = useMappedAsteroidLots(asteroidId);

  useEffect(() => {
    dispatchSearchResults({ total: resultTally, isLoading });
  }, [resultTally, isLoading])

  const lotTally = useMemo(() => Asteroid.getSurfaceArea(asteroidId), [asteroidId]);
  const regionTally = useMemo(() => lotTally <= MAX_LOTS_RENDERED ? 1 : Asteroid.getLotRegionTally(lotTally), [lotTally]);
  const visibleLotTally = useMemo(() => Math.min(MAX_MESH_INSTANCES, lotTally), [lotTally]);
  const visibleLeasedTally = useMemo(() => Math.min(MAX_LEASE_INSTANCES, leasedTally), [leasedTally]);
  const visibleResultTally = useMemo(() => Math.min(MAX_MESH_INSTANCES, resultTally), [resultTally]);

  // if just navigated to asteroid and lots already loaded, refetch
  // (b/c might have missed ws updates while on a different asteroid)
  // TODO: probably technically need to capture allLotsReloading alongside lastLotUpdate in dependency arrays
  useEffect(() => {
    if (Object.values(lotResultMap).length > 0) refetchLots();
  }, []);

  // position lots and bucket into regions (as needed)
  // BATCHED region bucketing is really only helpful for largest couple asteroids
  // NOTE: this just runs once when lots is initial populated
  useEffect(() => {
    const {
      ringsMinMax, ringsPresent, ringsVariation, rotationSpeed,
      ...prunedConfig
    } = config;
    const batchSize = 25000;
    const expectedBatches = Math.ceil(lotTally / batchSize);

    // (if no offscreencanvas, need to render heightmaps before sending to webworker)
    let heightMaps = null;
    let transfer = [];
    if (typeof OffscreenCanvas === 'undefined') {
      heightMaps = getLotGeometryHeightMaps(
        prunedConfig,
        getLotGeometryHeightMapResolution(config, textureQuality)
      );
      transfer = heightMaps.map((m) => m.buffer.buffer);
    }

    if (lotLoaderInterval.current) clearInterval(lotLoaderInterval.current);
    lotLoaderInterval.current = setInterval(() => {
      dispatchLotsLoading(asteroidId, 0, PLOT_LOADER_GEOMETRY_PCT)
    }, 250);

    // vvv BENCHMARK: 1400ms on AP, 350ms on 8, 200ms on 800
    //                1200, 170, 40 if maps already generated
    processInBackground(
      {
        topic: 'buildLotGeometry',
        asteroid: {
          key: asteroidId,
          config: prunedConfig,
        },
        aboveSurface: 0,
        heightMaps,
        textureQuality,
        _cacheable: 'asteroid'
      },
      (data) => {
        // ^^^
        if (lotLoaderInterval.current) clearInterval(lotLoaderInterval.current);

        // vvv BENCHMARK: 1400ms on AP, 150ms on 8, 19ms on 800
        positions.current = data.positions;
        orientations.current = data.orientations;
        lotsByRegion.current = [];
        let batchesProcessed = 0;

        for (let batchStart = 0; batchStart < lotTally; batchStart += batchSize) {
          const batchPositions = data.positions.slice(batchStart * 3, (batchStart + batchSize) * 3);
          processInBackground({
            topic: 'buildLotRegions',
            data: {
              positions: batchPositions,
              regionTally
            }
          }, ({ regions }) => { // eslint-disable-line no-loop-func
            regions.forEach((region, i) => {
              const lotIndex = batchStart + i + 1;
              if (!lotsByRegion.current[region]) lotsByRegion.current[region] = [];
              lotsByRegion.current[region].push(lotIndex);
            });

            batchesProcessed++;
            if (batchesProcessed === expectedBatches) setPositionsReady(true);
            dispatchLotsLoading(
              asteroidId,
              PLOT_LOADER_GEOMETRY_PCT + (1 - PLOT_LOADER_GEOMETRY_PCT) * batchesProcessed / expectedBatches
            );
          }, [
            batchPositions.buffer
          ]);
        }
      },
      transfer
    );
  }, [config]); // eslint-disable-line react-hooks/exhaustive-deps

  //  before declaring the lots "loaded" initially
  // run this when lots changes (after its initial run through the effect that follows this one)
  useEffect(() => {
    if (lotResultMap && lotsByRegion.current?.length && positionsReady) {
      const results = [];
      Object.keys(lotsByRegion.current).forEach((region) => {
        results[region] = lotsByRegion.current[region].filter((lotIndex) => lotResultMap[lotIndex]);
      });
      setResultsByRegion(results);
    }
  }, [lotResultMap, lastLotUpdate, positionsReady]);

  const handleWSMessage = useCallback((message) => {
    if (appConfig.get('App.verboseLogs')) console.log('onWSMessage (lots)', message);
    const { type: eventType, body } = message;

    // pass the event to useMappedAsteroidLots hook to update scene
    processEvent(eventType, body);

    // invalidate cached values due to other crews' actions
    // (since these will be missed in the main activities context invalidations)
    // TODO: ...


    //
    // UPDATE CACHE FOR SPECIFIC LOT VALUES
    //

    // (can skip those that are my own crew since those will be
    //  handled by crew-room activities context)
    // const activityConfig = getActivityConfig(activity);
    // (activityConfig?.invalidations || []).forEach((queryKey) => {

    // });

    // TODO: ecs refactor (below) and re-enable

    // // try to minimize redundant updates by just listening to Dispatcher_* events
    // if (eventType.match(/^Dispatcher_/)) {
    //   // myCrew will handle their own invalidations through the default ws room
    //   const isMyCrew = crew?.id && body.linked.find(({ type, asset }) => type === 'Crew' && asset?.id === crew.id);
    //   if (!isMyCrew) {
    //     // find any lot data on this asteroid... if it is complete and in my cache, replace my cache value
    //     const optimisticLots = body.linked.filter(({ type, asset }) => type === 'Lot' && asset?.asteroid === asteroidId);
    //     optimisticLots.forEach(({ asset: optimisticLot }) => {
    //       const queryKey = ['entity', Entity.IDS.LOT, optimisticLot.id];
    //       if (!!queryClient.getQueryData(queryKey)) {
    //         const needsBuilding = !!optimisticLot.building;
    //         optimisticLot.building = body.linked
    //           .find(({ type, asset }) => type === optimisticLot.building?.type && asset?.id === optimisticLot.building?.id)
    //           ?.asset;
    //         if (!needsBuilding || !!optimisticLot.building) {
    //           queryClient.setQueryData(queryKey, optimisticLot);
    //         }
    //       }
    //     });
    //   }
    // }

    // ^^^
    // // // // //

  }, [processEvent]);

  useEffect(() => {
    if (token && wsReady) {
      const regId = registerMessageHandler(handleWSMessage, `Asteroid::${asteroidId}`);
      return () => {
        unregisterMessageHandler(regId);

        // since will not be listening to asteroid room when zoomed away, remove ['asteroidPackedLotData', asteroidId]
        // and all [ 'entity', Entity.IDS.LOT, * ] that are on the asteroid but not occupied by me
        queryClient.removeQueries({ queryKey: [ 'asteroidPackedLotData', Number(asteroidId) ] });
        queryClient.getQueriesData([ 'entity', Entity.IDS.LOT ]).forEach(([ queryKey, data ]) => {
          const lotAsteroidId = Lot.toPosition(lotId)?.asteroidId;
          if (asteroidId === lotAsteroidId) {
            if (data && data.occupier !== crew?.id) { // TODO: ecs refactor -- occupier?
              queryClient.removeQueries({ queryKey });
            }
          }
        });
      }
    }
  }, [token, handleWSMessage, wsReady]);

  // listen for click events
  // NOTE: if just use onclick, then fires on drag events too :(
  useEffect(() => {
    const onMouseEvent = function (e) {
      if (e.type === 'pointerdown') {
        clickStatus.current = new Vector2(e.clientX, e.clientY);
      }
      else if (e.type === 'pointerup' && clickStatus.current) {
        const distance = clickStatus.current.distanceTo(new Vector2(e.clientX, e.clientY));
        if (distance < 3) {
          setLastClick(Date.now());
        }
      } else if (e.type === 'pointerenter') {
        mouseIsOut.current = false;
      } else if (e.type === 'pointerleave') {
        mouseIsOut.current = true;
      }
    };
    gl.domElement.addEventListener('pointerdown', onMouseEvent, true);
    gl.domElement.addEventListener('pointerenter', onMouseEvent, true);
    gl.domElement.addEventListener('pointerleave', onMouseEvent, true);
    gl.domElement.addEventListener('pointerup', onMouseEvent, true);
    return () => {
      gl.domElement.removeEventListener('pointerdown', onMouseEvent, true);
      gl.domElement.removeEventListener('pointerenter', onMouseEvent, true);
      gl.domElement.removeEventListener('pointerleave', onMouseEvent, true);
      gl.domElement.removeEventListener('pointerup', onMouseEvent, true);
    };
  }, []);

  // Instantiate (invisible) mouseable mesh (behind all pips)
  useEffect(() => {
    if (!visibleLotTally) return;

    const mouseableGeometry = new CircleGeometry(MOUSEABLE_WIDTH, 6);
    const mouseableMaterial = new MeshBasicMaterial({
      // color: 0x00ff00, opacity: 0.5, // for debugging
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });

    mouseableMesh.current = new InstancedMesh(mouseableGeometry, mouseableMaterial, visibleLotTally);
    mouseableMesh.current.renderOrder = 999;
    attachTo.add(mouseableMesh.current);
    return () => {
      if (mouseableMesh.current) {
        attachTo.remove(mouseableMesh.current);
      }
    };

  }, [attachTo, visibleLotTally]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lot meshes
  useEffect(() => {
    if (!visibleResultTally && texturesLoaded) return;

    const materialOpts = {
      color: new Color().setHex(0xffffff),
      depthTest: false,
      depthWrite: false,
      transparent: true,
    };

    const meshes = {};
    const pipMaterial = new MeshBasicMaterial({ ...materialOpts, opacity: 0.4, color: GRAY_COLOR });
    meshes[0] = new InstancedMesh(new CircleGeometry(PIP_RADIUS, 6), pipMaterial, visibleLotTally);
    meshes[0].setColorAt(0, GRAY_COLOR);

    const plane = new PlaneGeometry(BUILDING_RADIUS * 5, BUILDING_RADIUS * 5);
    const uses = Object.keys(lotUseTextures);

    for (const use of uses) {
      const material = new MeshBasicMaterial({ map: textures[use], ...materialOpts });
      meshes[use] = new InstancedMesh(plane, material, lotUseTallies[use]);
      meshes[use].layers.enable(BLOOM_LAYER);
      meshes[use].setColorAt(0, new Color());
    }

    Object.values(meshes).forEach((mesh) => {
      mesh.renderOrder = 999;
      attachTo.add(mesh);
    });

    lotMeshes.current = meshes;
    setMeshesInitialized(true);

    return () => {
      Object.values(lotMeshes.current).forEach((mesh) => {
        attachTo.remove(mesh);
      });
    };
  }, [attachTo, visibleResultTally, texturesLoaded, lotUseTallies]); // eslint-disable-line react-hooks/exhaustive-deps

  // Create mesh for my leases
  useEffect(() => {
    if (!visibleLeasedTally) return;

    const leasedLotGeometry = new CircleGeometry(PLOT_WIDTH * 2.6, 32);
    const leasedLotMaterial = new MeshBasicMaterial({
      color: LEASE_COLOR,
      depthTest: false,
      depthWrite: false,
      opacity: 0.02,
      side: FrontSide,
      transparent: true,
  });

    lotLeasesMesh.current = new InstancedMesh(leasedLotGeometry, leasedLotMaterial, visibleLeasedTally);
    lotLeasesMesh.current.renderOrder = 998;
    lotLeasesMesh.current.layers.enable(BLOOM_LAYER);
    attachTo.add(lotLeasesMesh.current);

    return () => {
      if (lotLeasesMesh.current) {
        attachTo.remove(lotLeasesMesh.current);
      }
    };
  }, [attachTo, visibleLeasedTally, PLOT_WIDTH]);

  // instantiate mouse mesh
  useEffect(() => {
    mouseHoverMesh.current = new Mesh(
      new PlaneGeometry(RETICULE_WIDTH, RETICULE_WIDTH),
      new MeshBasicMaterial({
        color: WHITE_COLOR,
        depthTest: false,
        map: new TextureLoader().load('/textures/asteroid/reticule.png'),
        opacity: 0.5,
        side: FrontSide,
        transparent: true
      })
    );
    mouseHoverMesh.current.renderOrder = 999;
    mouseHoverMesh.current.layers.enable(BLOOM_LAYER);
    attachTo.add(mouseHoverMesh.current);
    return () => {
      if (mouseHoverMesh.current) {
        attachTo.remove(mouseHoverMesh.current);
      }
    };
  }, [attachTo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Instantiate selection mesh
  useEffect(() => {
    selectionMesh.current = new Mesh(
      new PlaneGeometry(RETICULE_WIDTH, RETICULE_WIDTH),
      new MeshBasicMaterial({
        color: WHITE_COLOR,
        depthTest: false,
        map: new TextureLoader().load('/textures/asteroid/reticule.png'),
        side: FrontSide,
        transparent: true
      })
    );
    selectionMesh.current.renderOrder = 999;
    selectionMesh.current.layers.enable(BLOOM_LAYER);
    attachTo.add(selectionMesh.current);
    return () => {
      if (selectionMesh.current) {
        attachTo.remove(selectionMesh.current);
      }
    };
  }, [attachTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const lotScale = useMemo(() => Math.max(1, Math.sqrt(cameraAltitude / 10000)), [cameraAltitude]);
  const lotsReady = useMemo(() => {
    return !isLoading &&
      !!lotResultMap &&
      meshesInitialized &&
      positionsReady &&
      !!regionsByDistance?.length &&
      !!resultsByRegion?.length;
  }, [
    isLoading,
    lotResultMap,
    meshesInitialized,
    positionsReady,
    regionsByDistance,
    resultsByRegion
  ]);

  useEffect(() => {
    if (!lotsReady) return;

    try {
      const dummy = new Object3D();

      let lotUsesRendered = {};
      let updateLotUseMatrix = {};
      let updateResultColor = {};
      let updateLeasesMatrix = false;
      let updateMouseableMatrix = false;

      let pipsRendered = 0;
      let resultsRendered = 0;
      let leasesRendered = 0;
      let totalRendered = 0;

      let breakLoop = false;

      regionsByDistance.every((lotRegion) => {
        // use lotsByRegion on first pass even if zoomed out so single-render asteroids are ready
        // else, use results-only source once have been through closest X lots (i.e. rendered all pips needed for this altitude)
        // (without this, imagine all the unnecessary loops if there were a single search result on AP)
        const lotSource = (totalRendered < visibleLotTally && (cameraAltitude <= PIP_VISIBILITY_ALTITUDE || !lotsInitialized))
          ? lotsByRegion.current
          : resultsByRegion;
        if (!lotSource[lotRegion]) return true;

        // TODO (enhancement): on altitude change (where rotation has not changed), don't need to recalculate pip matrixes, etc
        //  (i.e. even when lotTally > visibleLotTally)... just would need to update result matrixes (to update scale)
        lotSource[lotRegion].every((lotIndex) => {
          const hasPip = (pipsRendered + resultsRendered) < visibleLotTally;
          const hasResult = lotResultMap[lotIndex] && (resultsRendered < visibleResultTally); // has result
          const hasLease = !!lotLeasedMap[lotIndex]; // has fill
          const hasMouseable = lotTally > visibleLotTally || !lotsInitialized;

          const lotUse = lotUseMap[lotIndex] || 0;
          const lotUseRendered = lotUsesRendered[lotUse] || 0;

          if (hasPip || hasResult || hasLease || hasMouseable) {
            // MATRIX
            // > if has a result, always need to rebuild entire matrix for this lot (to update scale with altitude)
            // > otherwise, only need to (re)build matrix on (re)initialization or if lot visibility is dynamic
            //   (note: building source and fill source changes will result in updated lastLotUpdate update)
            const lotZeroIndex = lotIndex - 1;

            dummy.position.set(
              positions.current[lotZeroIndex * 3 + 0],
              positions.current[lotZeroIndex * 3 + 1],
              positions.current[lotZeroIndex * 3 + 2]
            );

            dummy.lookAt(
              orientations.current[lotZeroIndex * 3 + 0],
              orientations.current[lotZeroIndex * 3 + 1],
              orientations.current[lotZeroIndex * 3 + 2]
            );

            dummy.scale.set(lotScale, lotScale, lotScale);
            dummy.updateMatrix();

            // ensure lotMeshes.current[lotUse] has enough instances
            if (lotMeshes.current[lotUse].count <= lotUseRendered) lotMeshes.current[lotUse].count = lotUseRendered + 1;

            // everything else is only in visible-lot area
            if (lotUse !== 0 && ((totalRendered < visibleLotTally) || hasResult)) {
              lotMeshes.current[lotUse].setMatrixAt(lotUseRendered, dummy.matrix);
              lotUsesRendered[lotUse] = (lotUsesRendered[lotUse] || 0) + 1;
              updateLotUseMatrix[lotUse] = true;
            }
            
            if (lotUse === 0 && ((totalRendered < visibleLotTally && cameraAltitude <= PIP_VISIBILITY_ALTITUDE) || hasResult)) {
              lotMeshes.current[0].setMatrixAt(lotUseRendered, dummy.matrix);
              lotUsesRendered[0] = (lotUsesRendered[0] || 0) + 1;
              updateLotUseMatrix[0] = true;
            }

            // update mouseable matrix
            // TODO: should these always face the camera? or have a slight bias towards camera at least?
            if (mouseableMesh.current && totalRendered < mouseableMesh.current.count) mouseableMesh.current.setMatrixAt(totalRendered, dummy.matrix);
            updateMouseableMatrix = true;

            // COLOR
            // > if has a result, must always update color (because matrix always updated, so instance indexes will change position)
            // > pips never need color updated
            // > strokes use result color (if result) else pip color (only need to be updated after initialization if dynamic)
            let currentColor = new Color();
            lotMeshes.current[lotUse].getColorAt(lotUseRendered, currentColor);
            const lotColor = getColor(colorMap[lotColorMap[lotIndex]]);

            if (!currentColor.equals(lotColor)) {
              lotMeshes.current[lotUse].setColorAt(lotUseRendered, lotColor);
              updateResultColor[lotUse] = true;
            }

            // fill
            // > only need to update fill if it has a lease and is in visible fill area
            if (hasLease) {
              lotLeasesMesh.current.setMatrixAt(leasesRendered, dummy.matrix);
              updateLeasesMatrix = true;
            }
          }

          if (hasResult) resultsRendered++;
          if (!hasResult && hasPip) pipsRendered++;
          if (hasLease) leasesRendered++;
          totalRendered++;

          // break loop if all visible results are rendered AND *something* is rendered on closest visibleLots
          breakLoop = (resultsRendered >= visibleResultTally && totalRendered >= visibleLotTally);

          if (breakLoop) return false;
          return true;
        });

        if (breakLoop) return false;
        return true;
      });

      if (mouseableMesh.current) mouseableMesh.current.count = cameraAltitude > PIP_VISIBILITY_ALTITUDE ? 0 : visibleLotTally;
      if (mouseableMesh.current && updateMouseableMatrix) {
        mouseableMesh.current.instanceMatrix.needsUpdate = true;
        mouseableMesh.current.computeBoundingSphere();
      }

      if (lotLeasesMesh.current && updateLeasesMatrix) {
        lotLeasesMesh.current.instanceMatrix.needsUpdate = true;
        lotLeasesMesh.current.computeBoundingSphere();
      }
      if (lotLeasesMesh.current) lotLeasesMesh.current.count = visibleLeasedTally;

      for (const use in lotMeshes.current) {
        lotMeshes.current[use].count = lotUsesRendered[use] || 0;
        lotMeshes.current[use].instanceMatrix.needsUpdate = !!updateLotUseMatrix[use];
        lotMeshes.current[use].instanceColor.needsUpdate = !!updateResultColor[use];
        lotMeshes.current[use].computeBoundingSphere();
      };

      setLotsInitialized(true);
    } catch (e) {
      // non-insignificant chance of this being mid-process when the asteroid is
      // changed, so needs to fail gracefully (i.e. if buildingMesh.current is unset)
      console.error(e);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chunkyAltitude,
    cameraNormalized?.string,
    lastLotUpdate,
    lotsReady,
    meshesInitialized,
    positionsReady,
    regionsByDistance,
    resultsByRegion
  ]);

  const highlightLot = useCallback((lotIndex) => {
    if (!attachTo) return;

    highlighted.current = null;
    // if a new lotIndex was passed to highlight, do it
    if (lotIndex !== undefined && lotIndex !== selectedLotIndex) {
      if (!positions.current) return;
      const lotZeroIndex = lotIndex - 1;

      mouseHoverMesh.current.position.set(
        positions.current[lotZeroIndex * 3 + 0],
        positions.current[lotZeroIndex * 3 + 1],
        positions.current[lotZeroIndex * 3 + 2]
      );

      const orientation = new Vector3(
        orientations.current[lotZeroIndex * 3 + 0],
        orientations.current[lotZeroIndex * 3 + 1],
        orientations.current[lotZeroIndex * 3 + 2]
      );

      orientation.applyQuaternion(attachTo.quaternion);
      mouseHoverMesh.current.lookAt(orientation);
      mouseHoverMesh.current.material.opacity = 0.5;
      highlighted.current = lotIndex;
    } else if (mouseHoverMesh.current) {
      mouseHoverMesh.current.material.opacity = 0;
    }
  }, [attachTo?.quaternion, selectedLotIndex]);

  const selectionAnimationTime = useRef(0);
  useEffect(() => {
    if (!attachTo) return;

    if (selectionMesh.current && positions.current && positionsReady && selectedLotIndex) {
      const lotZeroIndex = selectedLotIndex - 1;

      selectionMesh.current.position.set(
        positions.current[lotZeroIndex * 3 + 0],
        positions.current[lotZeroIndex * 3 + 1],
        positions.current[lotZeroIndex * 3 + 2]
      );

      const orientation = new Vector3(
        orientations.current[lotZeroIndex * 3 + 0],
        orientations.current[lotZeroIndex * 3 + 1],
        orientations.current[lotZeroIndex * 3 + 2]
      );
      orientation.applyQuaternion(attachTo.quaternion);
      selectionMesh.current.lookAt(orientation);

      selectionAnimationTime.current = 0;
      selectionMesh.current.material.opacity = 1;
      mouseHoverMesh.current.material.opacity = 0;
    } else {
      selectionMesh.current.material.opacity = 0;
    }
  }, [attachTo?.quaternion, selectedLotIndex, positionsReady]);

  // when camera angle changes, sort all regions by closest, then display
  // up to max lots (ordered by region proximity)
  //  NOTE: attempted to throttle this and wasn't catching any calculations even on huge, so pulled it out
  useEffect(() => {
    if (cameraNormalized?.string && regionTally > 1) {
      processInBackground(
        {
          topic: 'findClosestLots',
          data: {
            center: cameraNormalized.vector,
            lotTally: regionTally,
          }
        },
        (data) => {
          setRegionsByDistance(data.lots);
        }
      );
    } else if (!regionsByDistance?.length) {
      setRegionsByDistance([1]); // one-indexed so if only one region, it is #1
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraNormalized?.string, regionsByDistance?.length, regionTally]);

  useEffect(() => {
    if (!lastClick) return;
    dispatchLotSelected(Lot.toId(asteroidId, highlighted.current));
  }, [lastClick]);

  const mouseThrottleTime = useMemo(() => MOUSE_THROTTLE_TIME / (TIME_ACCELERATION / 24), [TIME_ACCELERATION]);

  useFrame((state, delta) => {
    selectionAnimationTime.current = (selectionAnimationTime.current || 0) + delta;

    // if no lots, nothing to do
    if (!lotTally) return;

    // pulse the size of the selection reticule
    if (selectionMesh.current && positions.current && selectedLotIndex) {
      selectionMesh.current.scale.x = 1 + 0.1 * Math.sin(7.5 * selectionAnimationTime.current);
      selectionMesh.current.scale.y = selectionMesh.current.scale.x;
    }

    // MOUSE STUFF

    // if mouse is out OR camera altitude is above MOUSE_VISIBILITY_ALTITUDE, clear any highlights
    if (mouseIsOut.current || cameraAltitude > MOUSE_VISIBILITY_ALTITUDE) { highlightLot(); return; }

    // if lastMouseIntersect.current is null, it is in the middle of finding the closest point, so return
    if (!lastMouseIntersect.current) return;

    // if lockedToSurface mode, state.pointer must have changed to be worth re-evaluating
    const mouseVector = state.pointer;
    if (getLockToSurface() && lastMouseUpdatePosition.current.equals(mouseVector)) return;

    // throttle by time as well
    const now = Date.now();
    if (now - lastMouseUpdateTime.current < mouseThrottleTime) return;

    // FINALLY, find the closest intersection (if the mouse is on the screen)
    if (!mouseableMesh.current) return;
    lastMouseUpdatePosition.current = mouseVector.clone();
    lastMouseUpdateTime.current = now;

    const intersections = state.raycaster.intersectObject(mouseableMesh.current);

    // if no intersections, clear any highlights
    if (!intersections || intersections.length === 0) { highlightLot(); return; }

    // find actual intersection location in space
    const intersection = intersections[0].point.clone();
    intersection.applyAxisAngle(axis, -1 * getRotation());
    intersection.divide(config.stretch);

    // if intersection is too close to last intersection, return without updating highlight
    // (distance-based throttling)
    if (intersection.distanceToSquared(lastMouseIntersect.current) < MOUSE_THROTTLE_DISTANCE) return;

    // if get here, find the closest fibo point to the intersection point, then highlight it
    lastMouseIntersect.current = null;
    processInBackground(
      {
        topic: 'findClosestLots',
        data: {
          center: intersection.clone().normalize(),
          findTally: 1,
          lotTally
        }
      },
      (data) => {
        highlightLot(data.lots[0]);
        lastMouseIntersect.current = intersection.clone();
      }
    )
  }, 0.5);

  const getLotPosition = useCallback((lotIndex) => {
    if (!positionsReady) return [];

    const zeroIndex = lotIndex - 1;
    return [
      positions.current[zeroIndex * 3 + 0],
      positions.current[zeroIndex * 3 + 1],
      positions.current[zeroIndex * 3 + 2]
    ];
  }, [positionsReady]);

  if (!positionsReady) return null;
  return (
    <>
      <Crews
        attachTo={attachTo}
        asteroidId={asteroidId}
        cameraAltitude={cameraAltitude}
        getLotPosition={getLotPosition}
        radius={config?.radius} />
        
      <Deliveries
        attachTo={attachTo}
        asteroidId={asteroidId}
        getLotPosition={getLotPosition}
        radius={config?.radius} />
    </>
  );
};

export default Lots;
