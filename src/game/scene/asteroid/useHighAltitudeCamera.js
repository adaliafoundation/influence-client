import { useEffect } from 'react';
import { gsap } from 'gsap';
import useStore from '~/hooks/useStore';

const useHighAltitudeCamera = ({
  controls, radius, zoomStatus, automatingCamera,
  cameraAutomationVersion, setCameraAutomationVersion, setCameraAltitude
}) => {
  const requested = useStore(s => s.cameraNeedsHighAltitude);
  const requestHighAltitude = useStore(s => s.dispatchGoToHighAltitude);

  useEffect(() => {
    if (!requested || !controls || !radius || zoomStatus !== 'in' || automatingCamera.current) return;
    const position = controls.object.position.clone().setLength(radius * 1.5);
    automatingCamera.current = true;
    const timeline = gsap.timeline({
      defaults: { duration: 0.75, ease: 'power1.out' },
      onComplete: () => {
        setCameraAltitude(position.length() - radius);
        automatingCamera.current = false;
        setCameraAutomationVersion((version) => version + 1);
        requestHighAltitude(false);
      }
    }).to(controls.object.position, { ...position });

    return () => {
      timeline.kill();
      automatingCamera.current = false;
    };
  }, [requested, controls, radius, zoomStatus, automatingCamera, cameraAutomationVersion,
    setCameraAltitude, setCameraAutomationVersion, requestHighAltitude]);
};

export default useHighAltitudeCamera;
