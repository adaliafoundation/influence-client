import { forwardRef, useLayoutEffect, useEffect, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import TrackballModControlsImpl from '~/lib/graphics/TrackballModControlsImpl';

export const TrackballModControls = forwardRef(({ children, ...props }, ref) => {
  const { camera, maxDistance, minDistance } = props;
  const { gl } = useThree();
  const defaultCamera = useThree(({ camera }) => camera);
  const set = useThree(({ set }) => set)
  const explCamera = camera || defaultCamera;
  const [ controls ] = useState(() => new TrackballModControlsImpl(explCamera, gl.domElement))
  const [targetScene, setTargetScene] = useState(null);

  if (minDistance) controls.minDistance = minDistance;
  if (maxDistance) controls.maxDistance = maxDistance;

  useLayoutEffect(() => {
    if (!controls || !targetScene) return undefined;
    controls.enabled = true;
    controls.attach(targetScene);
    return () => controls.dispose();
  }, [controls, targetScene]);

  // (this is presumably just for static scenes / scenes without a running frameloop)
  // useEffect(() => {
  //   controls?.addEventListener('change', invalidate);

  //   return () => {
  //     controls?.removeEventListener('change', invalidate);
  //     controls?.dispose();
  //   };
  // }, [ controls, invalidate ]);

  useFrame(() => {
    if (controls.enabled) controls.update();
  });

  useEffect(() => {
    set({ controls });
  }, [ controls, set ]);

  return controls ? (
    <>
      <primitive ref={ref} dispose={undefined} object={controls} />
      <group ref={setTargetScene}>
        {children}
      </group>
    </>
  ) : null
})
