import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { lockProspectingCamera } from './cameraAnchor';

export default function ProspectingCamera({ attachTo, origin }) {
  const controls = useThree((s) => s.controls);
  const lock = useRef(null);
  useEffect(() => {
    if (!controls) return undefined;
    lock.current = lockProspectingCamera(controls, attachTo, origin);
    return () => {
      lock.current.restore();
      lock.current = null;
    };
  }, [controls, attachTo, origin]);
  // Follow asteroid motion before the shared controls process mouse/touch input.
  useFrame(() => lock.current?.update(), -1);
  // Constrain after mouse controls and asteroid motion, before the render pass.
  useFrame(() => lock.current?.constrain(), 0.5);
  return null;
}
