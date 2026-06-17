import { useEffect, useMemo, useRef, useState } from 'react';
import { useTexture } from '@react-three/drei';
import { AdditiveBlending, DoubleSide, Vector2 } from 'three';
import { useFrame } from '@react-three/fiber';

import useTravelSolutionIsValid from '~/hooks/useTravelSolutionIsValid';
import constants from '~/lib/constants';
import theme from '~/theme';
import frag from './marker/marker.frag';
import vert from './marker/marker.vert';
import orbitColors from './orbit/orbitColors';

const markerMaxRadius = constants.AU / 50;
const initialUniforms = {
  uMaxRadius: { type: 'f', value: markerMaxRadius }
};

const markerTextureUrls = [
  `${process.env.PUBLIC_URL}/textures/asteroids/reticule.png`,
  `${process.env.PUBLIC_URL}/textures/asteroids/ship.png`,
  `${process.env.PUBLIC_URL}/textures/asteroids/solid_diamond.png`,
  `${process.env.PUBLIC_URL}/textures/asteroids/stroked_diamond.png`,
  `${process.env.PUBLIC_URL}/textures/asteroids/translucent_diamond.png`,
  `${process.env.PUBLIC_URL}/textures/circleFaded.png`,
  `${process.env.PUBLIC_URL}/textures/marker.png`
];

useTexture.preload(markerTextureUrls);

const Marker = (props) => {
  const { asteroidPos, hasDestination, isDestination, isOrigin, isTravelMarker, travelSolution } = props;
  const [ points, setPoints ] = useState(asteroidPos);

  const travelSolutionIsValid = useTravelSolutionIsValid();

  const [
    reticuleTexture,
    shipTexture,
    solidDiamondTexture,
    strokedDiamondTexture,
    translucentDiamondTexture,
    planeTexture,
    asteroidTexture
  ] = useTexture(markerTextureUrls);

  useEffect(() => {
    reticuleTexture.center = new Vector2(0.5, 0.5);
  }, [reticuleTexture]);

  const { outerProps, innerProps, showInner, showReticule } = useMemo(() => {
    const x = {
      outerProps: { size: 35 },
      innerProps: { color: orbitColors.white, size: 10 },
      showInner: false,
      showReticule: false
    };

    if (isOrigin || isDestination) {
      x.outerProps.map = translucentDiamondTexture;
      x.innerProps.map = solidDiamondTexture;
    }

    if (isOrigin) {
      if (travelSolution) {
        // origin "where it will be" marker
        if (isTravelMarker) {
          x.outerProps.color = orbitColors.main;
          x.outerProps.map = strokedDiamondTexture;
          x.innerProps.map = shipTexture;
          x.innerProps.size = x.outerProps.size * 0.625;
          x.showInner = true;

        // origin "where it was" marker
        } else {
          x.outerProps.color = orbitColors.main;
          x.outerProps.map = strokedDiamondTexture;
          x.outerProps.size = 15;
          x.showInner = false;
        }

      // blue with white diamond
      } else if (hasDestination) {
        x.outerProps.color = orbitColors.main;
        x.showInner = true;

      // standard
      } else {
        x.outerProps.map = strokedDiamondTexture;
        x.outerProps.color = orbitColors.white;
        x.showInner = true;
      }

    } else if (isDestination) {
      if (travelSolution) {
        // destination "where it will be" marker
        if (isTravelMarker) {
          x.outerProps.color = travelSolutionIsValid ? orbitColors.success : orbitColors.error;
          x.outerProps.map = translucentDiamondTexture;
          x.showInner = true;
          x.showReticule = true;

        // destination "where it was" marker
        } else {
          x.outerProps.color = travelSolutionIsValid ? orbitColors.success : orbitColors.error;
          x.outerProps.map = strokedDiamondTexture;
          x.outerProps.size = 15;
        }

      } else {
        x.outerProps.color = orbitColors.white;
        x.showReticule = true;
        x.showInner = true;
      }

    } else {
      // TODO: hovering
    }

    return x;
  }, [travelSolution]);

  useEffect(() => {
    if (asteroidPos && asteroidPos.length > 0) {
      const newPoints = new Float32Array(2 * 3);
      newPoints.set(asteroidPos);
      newPoints.set([ asteroidPos[0], asteroidPos[1], 0 ], 3);
      setPoints(newPoints);
    }
  }, [ asteroidPos ]);

  const reticulePoints = useRef();
  useFrame((state, delta) => {
    if (reticulePoints.current) {
      reticulePoints.current.material.map.rotation = delta * 10 / (2* Math.PI);
      const scale = 1 + 0.05 * Math.sin(7.5 * delta);
      reticulePoints.current.material.size = scale * 52;
    }
  });

  if (points?.length !== 6) return null;
  return (
    <group>

      {/* main marker */}
      {(isOrigin || isDestination)
        // origin / destination marker
        ? (
          <>
            {showReticule && (
              <points ref={reticulePoints} renderOrder={1}>
                <bufferGeometry>
                  <bufferAttribute attach="attributes-position" args={[ points.slice(0, 3), 3 ]} />
                </bufferGeometry>
                <pointsMaterial
                  map={reticuleTexture}
                  size={52}
                  depthWrite={false}
                  sizeAttenuation={false}
                  transparent />
              </points>
            )}

            <points renderOrder={1}>
              <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[ points.slice(0, 3), 3 ]} />
              </bufferGeometry>
              <pointsMaterial
                {...outerProps}
                depthWrite={false}
                sizeAttenuation={false}
                transparent />
            </points>

            {showInner && (
              <points renderOrder={1}>
                <bufferGeometry>
                  <bufferAttribute attach="attributes-position" args={[ points.slice(0, 3), 3 ]} />
                </bufferGeometry>
                <pointsMaterial
                  {...innerProps}
                  depthWrite={false}
                  sizeAttenuation={false}
                  transparent />
              </points>
            )}
          </>
        )

        // hover marker
        : (
          <points renderOrder={1}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[ points.slice(0, 3), 3 ]} />
            </bufferGeometry>
            <pointsMaterial
              blending={AdditiveBlending}
              color={theme.colors.main}
              map={asteroidTexture}
              size={23}
              opacity={0.8}
              depthWrite={false}
              sizeAttenuation={false}
              transparent={true} />
          </points>
        )
      }

      {!(isOrigin || isDestination) && travelSolution && (
        <>
          {/* line from marker to stellar plan */}
          <line renderOrder={1}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[ points, 3 ]} />
            </bufferGeometry>
            <lineBasicMaterial
              color={theme.colors.main}
              depthWrite={false}
              opacity={0.5}
              transparent={true} />
          </line>

          {/* point on stellar plan */}
          <points renderOrder={1}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[ points.slice(3), 3 ]} />
            </bufferGeometry>
            <pointsMaterial
              blending={AdditiveBlending}
              color={theme.colors.main}
              map={planeTexture}
              size={9}
              opacity={0.75}
              depthWrite={false}
              sizeAttenuation={false}
              transparent={true} />
          </points>

          {/* glowy circle on stellar plan */}
          <mesh position={[ ...points.slice(3) ]} renderOrder={1}>
            <circleGeometry args={[ markerMaxRadius, 20 ]} />
            <shaderMaterial
              uniforms={initialUniforms}
              transparent={true}
              depthWrite={false}
              fragmentShader={frag}
              vertexShader={vert}
              side={DoubleSide} />
          </mesh>
        </>
      )}
    </group>
  );
};

export default Marker;
