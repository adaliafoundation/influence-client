import { useEffect, useMemo, useState } from 'react';
import { createPortal } from '@react-three/fiber';
import { DoubleSide } from 'three';
import theme from '~/theme';
import {
  buildPatch,
  prismGeometry,
  prismEdges,
  excavationGeometry,
  DEPTHS,
  SURFACE_INSET
} from './geometry';
import { useProspecting } from './store';
import { createTerrainSurface } from './terrainSurface';
import ProspectingTerrain from './ProspectingTerrain';
import ProspectingCamera from './ProspectingCamera';

function Excavation({ patch, depth }) {
  const geometry = useMemo(() => excavationGeometry(patch, depth), [patch, depth]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} raycast={() => null}>
      <meshBasicMaterial color="#111820" side={DoubleSide} polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={2} />
    </mesh>
  );
}

function Section({ lot, depth, patch, cell, selected, onSelect }) {
  const [hover, setHover] = useState(false);
  const geometry = useMemo(
    () =>
      prismGeometry(
        patch.cells.get(lot),
        patch.surface,
        SURFACE_INSET + depth * 100,
        SURFACE_INSET + DEPTHS[depth]
      ),
    [patch, lot, depth]
  );
  const edges = useMemo(() => prismEdges(
    patch.cells.get(lot), patch.surface,
    SURFACE_INSET + depth * 100, SURFACE_INSET + DEPTHS[depth]
  ), [patch, lot, depth]);
  useEffect(
    () => () => {
      geometry.dispose();
      edges.dispose();
    },
    [geometry, edges]
  );
  const color = selected
    ? '#ffffff'
    : cell?.[3]
      ? ['#637681', theme.colors.main, '#88e675', '#faaf42'][cell[3]]
      : theme.colors.main;
  return (
    <group>
      <mesh
        geometry={geometry}
        renderOrder={21}
        onClick={(e) => {
          e.stopPropagation();
          if (e.delta < 4) onSelect(lot, depth);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
        }}
        onPointerOut={() => setHover(false)}
      >
        <meshBasicMaterial
          color={color}
          transparent
          opacity={selected ? 0.28 : hover ? 0.22 : cell?.[3] ? 0.18 : 0.025}
          side={DoubleSide}
          depthWrite={false}
          depthTest
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
      <lineSegments geometry={edges} renderOrder={22} raycast={() => null}>
        <lineBasicMaterial
          color={color}
          transparent
          opacity={selected ? 0.95 : cell?.[0] ? 0.65 : 0.18}
          depthTest
          depthWrite={false}
        />
      </lineSegments>
    </group>
  );
}

export default function ProspectingScene({
  attachTo,
  positions,
  lotTally,
  asteroidId
}) {
  const active = useProspecting((s) => s.active && s.asteroidId === asteroidId);
  const origin = useProspecting((s) => s.originIndex);
  const depth = useProspecting((s) => s.depth);
  const selected = useProspecting((s) => s.selected);
  const sections = useProspecting((s) => s.layers[s.depth]);
  const select = useProspecting((s) => s.select);
  const setPatch = useProspecting((s) => s.setPatch);
  const terrain = useMemo(() => active ? createTerrainSurface(attachTo) : null, [active, attachTo]);
  useEffect(() => () => terrain?.dispose(), [terrain]);
  const patch = useMemo(
    () => (active ? buildPatch(origin, positions, lotTally, terrain.height) : null),
    [active, origin, positions, lotTally, terrain]
  );
  useEffect(() => {
    if (patch) setPatch(patch);
  }, [patch, setPatch]);
  const lots = useMemo(() => sections.map((section) => section.lot), [sections]);
  const cut = useMemo(() => patch && ({
    ...patch,
    cells: new Map(lots.map((lot) => [lot, patch.cells.get(lot)]))
  }), [patch, lots]);
  if (!patch) return null;
  return createPortal(
    <group>
      <ProspectingTerrain attachTo={attachTo} patch={patch} lots={lots} />
      <ProspectingCamera attachTo={attachTo} origin={patch.origin} />
      {lots.length > 0 && <Excavation patch={cut} depth={depth} />}
      {sections.map((section) => (
        <Section
          key={`${section.lot}:${depth}`}
          lot={section.lot}
          depth={depth}
          patch={patch}
          cell={section.cell}
          selected={selected?.lot === section.lot}
          onSelect={select}
        />
      ))}
    </group>,
    attachTo
  );
}
