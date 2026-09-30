import useStore from '~/hooks/useStore';

// Do not mount dialogs (or start their data loading) until the camera arrives.
const ActionDialogGate = ({ children }) => {
  const lotCameraTransition = useStore(s => s.lotCameraTransition);
  const selectedLot = useStore(s => s.asteroids.lot);
  const zoomStatus = useStore(s => s.asteroids.zoomStatus);
  if ((lotCameraTransition && lotCameraTransition === selectedLot)
    || zoomStatus === 'zooming-in' || zoomStatus === 'zooming-out') return null;
  return children;
};

export default ActionDialogGate;
