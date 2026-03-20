import { useEffect, useMemo, useState } from 'react';
import { Ship } from '@influenceth/sdk';

import useShip from '~/hooks/useShip';
import useStore from '~/hooks/useStore';
import ModelViewer from '../ModelViewer';
import { getShipModel } from '~/lib/assetUtils';

const ShipViewer = () => {
  const zoomScene = useStore(s => s.asteroids.zoomScene);
  const playSound = useStore(s => s.dispatchEffectStartRequested);
  const stopSound = useStore(s => s.dispatchEffectStopRequested);

  const { data: ship, isLoading } = useShip(zoomScene?.shipId);

  const [pendingSound, setPendingSound] = useState(null);

  // Play ship thruster loop
  useEffect(() => {
    if (zoomScene?.type === 'SHIP' && !ship?._location?.lotId) {
      const id = setTimeout(() => playSound('ship'));
      setPendingSound(id);

      return () => {
        clearTimeout(id);
        stopSound('ship', { fadeOut: 500 });
        setPendingSound(null);
      }
    }
  }, [zoomScene, ship?._location?.lotId]);

  const modelUrl = useMemo(() => {
    return getShipModel(
      zoomScene?.shipId ? ship?.Ship?.shipType : Ship.IDS.ESCAPE_MODULE,
      ship?.Ship?.variant
    );
  }, [ship?.Ship?.shipType, ship?.Ship?.variant]);

  if (zoomScene?.type !== 'SHIP' || isLoading || ship?._location?.lotId) return null;
  return (
    <ModelViewer assetType="ship" modelUrl={modelUrl} />
  );
}

export default ShipViewer;
