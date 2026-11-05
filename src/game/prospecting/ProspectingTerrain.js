import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { createTerrainPresentation } from './terrainPresentation';

export default function ProspectingTerrain({ attachTo, patch, lots }) {
  const presentation = useMemo(() => createTerrainPresentation(patch), [patch]);
  // LOD swaps continue while prospecting; pick up newly activated chunks too.
  useEffect(() => presentation.setVisibleLots(lots), [presentation, lots]);
  useFrame(() => presentation.update(attachTo));
  useEffect(() => () => presentation.restore(), [attachTo, presentation]);
  return null;
}
