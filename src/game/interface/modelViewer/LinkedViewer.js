import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Ship } from '@influenceth/sdk';

import { getShipModel } from '~/lib/assetUtils';
import ModelViewer from '../ModelViewer';

const LinkedViewer = () => {
  const { assetName } = useParams();

  const modelUrl = useMemo(() => {
    return getShipModel(Object.keys(Ship.TYPES).find((i) => Ship.TYPES[i].name === assetName));
  }, [assetName]);

  return (
    <ModelViewer assetType="ship" modelUrl={modelUrl} />
  );
}

export default LinkedViewer;
