import { useEffect, useMemo, useState } from 'react';
import { createPortal } from '@react-three/fiber';
import { Color, DoubleSide } from 'three';
import { Line } from '@react-three/drei';
import theme from '~/theme';
import { Asteroid } from '@influenceth/sdk';
import useAsteroid from '~/hooks/useAsteroid';
import { followOreChance } from './samplingPreview';
import { buildVeinGeometry } from './veinGeometry';
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
    // Draw the excavation over terrain at its projected rim as well as its ground footprint.
    <mesh geometry={geometry} renderOrder={20} raycast={() => null}>
      <meshBasicMaterial
        color="#09131b"
        side={DoubleSide}
        depthTest={false}
        depthWrite
        transparent
        opacity={1}
      />
    </mesh>
  );
}

function Section({ lot, depth, patch, cell, selected, chance, onSelect }) {
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
  const outline = theme.colors.main;
  const heatColor = useMemo(() => new Color(theme.colors.main)
    .lerp(new Color('#8ce8ed'), Math.min(1, chance / 75)), [chance]);
  const edgePoints = useMemo(() => Array.from(edges.attributes.position.array), [edges]);
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
          color={cell?.[0] ? theme.colors.main : heatColor}
          transparent
          opacity={cell?.[0] ? selected ? 0.09 : hover ? 0.065 : 0.035 : 0.025 + chance / 100 * 0.23 + (selected ? 0.035 : hover ? 0.02 : 0)}
          side={DoubleSide}
          depthWrite={false}
          depthTest={false}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
      {(selected || hover) && (
        <Line
          points={edgePoints}
          segments
          color={outline}
          lineWidth={selected ? 8 : 5}
          transparent
          opacity={selected ? 0.09 : 0.04}
          depthTest={false}
          depthWrite={false}
          renderOrder={22}
          raycast={() => null}
        />
      )}
      <Line
        points={edgePoints}
        segments
        color={outline}
        lineWidth={selected ? 2.5 : hover ? 1.8 : 1}
        transparent
        opacity={selected ? 1 : hover ? 0.65 : cell?.[0] ? 0.22 : 0.08 + chance / 100 * 0.28}
        depthTest={false}
        depthWrite={false}
        renderOrder={23}
        raycast={() => null}
      />
    </group>
  );
}

function VeinNetwork({ cells, patch, context, depth }) {
  const network = useMemo(() => buildVeinGeometry(cells, patch, context), [cells, patch, context]);
  useEffect(() => () => {
    network.nodes.forEach(({ geometry }) => geometry.dispose());
    network.links.forEach(({ geometry }) => geometry.dispose());
  }, [network]);
  const pieces = [
    ...network.nodes.map((node) => ({ ...node, cells: [node.cell] })),
    ...network.links
  ];
  return pieces.map(({ key, geometry, cells: discovered }) => {
    if (!discovered.every((cell) => Math.abs(cell[2] - depth) <= 1)) return null;
    const current = discovered.some((cell) => cell[2] === depth);
    return (
      <mesh key={key} geometry={geometry} renderOrder={current ? 25 : 24} raycast={() => null}>
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={current ? 0.85 : 0.16}
          depthWrite={false}
          depthTest={false}
          side={DoubleSide}
        />
      </mesh>
    );
  });
}

export default function ProspectingScene({
  attachTo,
  positions,
  lotTally,
  asteroidId
}) {
  const { data: asteroid } = useAsteroid(asteroidId);
  const resource = useProspecting((s) => s.resource);
  const active = useProspecting((s) => s.active && s.asteroidId === asteroidId);
  const origin = useProspecting((s) => s.originIndex);
  const depth = useProspecting((s) => s.depth);
  const selected = useProspecting((s) => s.selected);
  const sections = useProspecting((s) => s.layers[s.depth]);
  const cells = useProspecting((s) => s.cells);
  const context = useProspecting((s) => s.context);
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
  const chances = useMemo(() => new Map(sections.map((section) => {
    const site = patch?.sites.find((candidate) => candidate.index === section.lot);
    const source = section.sources[0];
    const abundance = asteroid?.Celestial?.abundances && site
      ? Asteroid.Entity.getAbundanceAtLot(asteroid, section.lot, resource) : 0;
    return [section.lot, section.cell || !site ? 0 : followOreChance({
      source: source === null || source === undefined ? null : cells[source],
      site, depth, abundance
    })];
  })), [sections, patch, asteroid, resource, cells, depth]);
  if (!patch) return null;
  return createPortal(
    <group>
      <ProspectingTerrain attachTo={attachTo} patch={patch} lots={lots} />
      <ProspectingCamera attachTo={attachTo} origin={patch.origin} />
      {lots.length > 0 && <Excavation patch={cut} depth={depth} />}
      <VeinNetwork cells={cells} patch={patch} context={context} depth={depth} />
      {sections.map((section) => (
        <Section
          key={`${section.lot}:${depth}`}
          lot={section.lot}
          depth={depth}
          patch={patch}
          cell={section.cell}
          chance={chances.get(section.lot)}
          selected={selected?.lot === section.lot}
          onSelect={select}
        />
      ))}
    </group>,
    attachTo
  );
}
