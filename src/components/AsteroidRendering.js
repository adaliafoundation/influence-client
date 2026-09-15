import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AmbientLight, Color, DirectionalLight } from 'three';
import { Canvas, useThree } from '@react-three/fiber';

import { cleanupScene, renderDummyAsteroid } from '~/game/scene/asteroid/helpers/utils';
import useWebWorker from '~/hooks/useWebWorker';
import theme from '~/theme';
import constants from '~/lib/constants';

const mainColor = new Color(theme.colors.main).convertLinearToSRGB();
const materialColor = mainColor.clone().multiplyScalar(0.3);

const RenderedAsteroid = ({ asteroid, brightness = 1, varyDistance = false, onReady, webWorkerPool }) => {
  const { camera, gl, scene } = useThree();
  const disposeFunc = useRef();

  useEffect(() => {
    if (asteroid?.id && webWorkerPool) {
      renderDummyAsteroid(asteroid, asteroid.id < 25 ? 64 : 32, webWorkerPool, (asteroidModel, dispose) => {
        asteroidModel.traverse(function (node) {
          if (node.isMesh) {
            node.material.map = null;
            node.material.color = materialColor;
          }
        });

        const radiusMeters = asteroid.Celestial.radius * 1000; // km -> m
        scene.add(asteroidModel);

        const lightColor = mainColor;
        const lightIntensity = brightness * 7;

        const ambientLight = new AmbientLight(lightColor, 0.2 * lightIntensity);
        scene.add(ambientLight);

        const depth = -0.5 * radiusMeters;

        const light = new DirectionalLight(lightColor, lightIntensity);
        light.position.set(-1 * radiusMeters, -1 * radiusMeters, depth);
        scene.add(light);

        const light2 = new DirectionalLight(lightColor, lightIntensity);
        light2.position.set(1 * radiusMeters, -1 * radiusMeters, depth);
        scene.add(light2);

        const light3 = new DirectionalLight(lightColor, lightIntensity);
        light3.position.set(0, 1 * radiusMeters, depth);
        scene.add(light3);

        // Adjust zoom so the smaller asteroids look smaller
        let distance = 2.4;
        if (varyDistance) distance = 1.5 + 1.5 * (1 - Math.pow(radiusMeters / constants.MAX_ASTEROID_RADIUS, 0.3));

        camera.position.set(0, 0, distance * radiusMeters);
        camera.far = 4 * radiusMeters;
        camera.updateProjectionMatrix();

        gl.render(scene, camera);
        if (onReady) onReady();

        disposeFunc.current = dispose;
      });
      return () => {
        try {
          cleanupScene(scene);
          if (disposeFunc.current) {
            disposeFunc.current();
            disposeFunc.current = null;
          }
        } catch(e) {
          console.warn(e);
        }
      }
    }
  }, [asteroid?.id, brightness, !!webWorkerPool]);  // eslint-disable-line react-hooks/exhaustive-deps

  return null;
};


const RenderedAsteroidInCanvas = ({ onReady, ...props }) => {
  const webWorkerPool = useWebWorker();

  const canvas = useRef();
  const [imageSrc, setImageSrc] = useState(null);

  // to free up webgl contexts, once the asteroid is rendered in canvas, we replace the canvas with an image
  // TODO: since we don't need the canvas to ever render visibly, this would likely be more performant in
  //  an offscreen canvas
  // TODO: in general, it might be wise to keep track of all webgl contexts at the app-level and block 
  //  any components that require a canvas until the contexts are freed up (this will be a user-specific
  //  limit, but maybe 4-5 simultaneous contexts max would be safe?)
  const onReadyInternal = useCallback(() => {
    if (canvas.current) setImageSrc(canvas.current.toDataURL());
    if (onReady) onReady();
  }, [onReady]);

  useEffect(() => {
    setImageSrc(null);
  }, [props.asteroid?.id, props.brightness, props.varyDistance])

  const style = useMemo(() => ({ width: '100%', height: '100%', ...(props.style || {}) }), [props.style]);

  return imageSrc
    ? <img src={imageSrc} style={style} alt="Asteroid" />
    : (
      <Canvas
        ref={canvas}
        frameloop="never"
        linear
        style={style}>
        <RenderedAsteroid {...props} onReady={onReadyInternal} webWorkerPool={webWorkerPool} />
      </Canvas>
    );
};

export default RenderedAsteroidInCanvas;