import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { Asteroid, Lot, Product } from '@influenceth/sdk';
import Button from '~/components/ButtonAlt';
import Dropdown from '~/components/Dropdown';
import SliderInput from '~/components/SliderInput';
import useStore from '~/hooks/useStore';
import useAsteroid from '~/hooks/useAsteroid';
import {
  Scrollable,
  Rule
} from '../interface/hud/hudMenus/components/components';
import { useProspecting, prospectingEnabled } from './store';
import { claim } from './rules';
import { DEPTHS, SURFACE_INSET } from './geometry';

const Panel = styled(Scrollable)`
  p {
    color: ${(p) => p.theme.colors.mainText};
    line-height: 1.5;
  }
  label {
    display: block;
    margin: 12px 0;
  }
`;
const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0;
`;

export default function ProspectingHUD() {
  const asteroidId = useStore((s) => s.asteroids.origin);
  const lotId = useStore((s) => s.asteroids.lot);
  const zoom = useStore((s) => s.asteroids.zoomStatus);
  const launcher = useStore((s) => s.launcherPage);
  const { data: asteroid } = useAsteroid(asteroidId);
  const p = useProspecting();
  const [resource, setResource] = useState(1);
  const enabled = prospectingEnabled();
  const { active, asteroidId: campaignAsteroid, close } = p;
  useEffect(() => {
    if (
      active &&
      (Number(asteroidId) !== Number(campaignAsteroid) || zoom !== 'in')
    )
      close();
  }, [asteroidId, zoom, active, campaignAsteroid, close]);
  useEffect(() => () => close(), [close]);
  const resources = useMemo(
    () =>
      asteroid?.Celestial?.abundances
        ? Object.entries(Asteroid.Entity.getAbundances(asteroid))
            .filter(([id, value]) => value > 0 && Product.TYPES[id])
            .sort((a, b) => b[1] - a[1])
            .map(([id]) => Number(id))
        : [],
    [asteroid]
  );
  useEffect(() => {
    if (resources.length && !resources.includes(resource))
      setResource(resources[0]);
  }, [resources, resource]);
  const selectedLot = p.selected?.lot;
  const section = p.layers[p.depth].find((entry) => entry.lot === selectedLot);
  const selectedCell = section?.cell;
  const maxDepth = Math.max(0, p.layers.findLastIndex((layer) => layer.length));
  const campaignResource = p.resource;
  const abundance = useMemo(
    () =>
      active && selectedLot && asteroid?.Celestial?.abundances
        ? Asteroid.Entity.getAbundanceAtLot(
            asteroid,
            selectedLot,
            campaignResource
          )
        : 0,
    [active, selectedLot, asteroid, campaignResource]
  );
  const estimate = selectedCell?.[3]
    ? claim(selectedCell, Math.round(abundance * 1e6))
    : null;
  if (!enabled || !lotId || zoom !== 'in' || launcher) return null;
  return (
    <Panel aria-label="Prospecting playtest">
      {!p.active ? (
        <>
          <p>Explore beneath this lot in the asteroid view.</p>
          <label>Material</label>
          <Dropdown
            initialSelection={resource}
            options={resources.map((id) => ({
              value: id,
              label: Product.TYPES[id].name
            }))}
            onChange={(option) => setResource(option.value)}
          />
          <Button
            disabled={!resources.length}
            onClick={() =>
              p.open(Number(asteroidId), Lot.toIndex(lotId), resource)
            }
          >
            Enter prospecting
          </Button>
          <p>Local playtest · no transactions</p>
        </>
      ) : (
        <>
          <p>
            {Product.TYPES[p.resource]?.name} · {p.history.length} / 10 samples
          </p>
          <label>
            Depth cut · {p.depth * 100}–{DEPTHS[p.depth]} m
            <SliderInput
              min={0}
              max={maxDepth}
              disabled={!maxDepth}
              increment={1}
              value={p.depth}
              onChange={p.setDepth}
            />
          </label>
          <p>
            Follow opens nearby sections and the next reachable depth. Surveyed sections stay visible.
          </p>
          <Rule />
          {p.selected && <p>
            Lot {p.selected?.lot} · {p.selected?.depth * 100}–
            {DEPTHS[p.selected?.depth]} m<br />
            Layers begin {SURFACE_INSET} m below the surface.<br />
            Local abundance: {(abundance * 100).toFixed(1)}%<br />
            {selectedCell
              ? selectedCell[3]
                ? `Grade ${selectedCell[3]} · width ${selectedCell[7] ? 'tested' : 'untested'} · hardness ${selectedCell[8] ? 'tested' : 'untested'}`
                : 'Surveyed · barren'
              : 'Unsurveyed'}
          </p>}
          {section?.sources.some((source) => source !== null) && (
            <>
              <label>Drill from</label>
              <Dropdown
                key={`${selectedLot}:${p.depth}:${section.sources.join(',')}`}
                initialSelection={p.source + 1}
                options={section.sources.map((index) => {
                  const cell = p.cells[index];
                  return {
                    value: index + 1,
                    label: `Lot ${cell[1]} · ${cell[2] * 100}–${DEPTHS[cell[2]]} m`
                  };
                })}
                onChange={(option) => p.setSource(option.value - 1)}
              />
            </>
          )}
          <Actions>
            <Button
              size="small"
              disabled={
                !section?.sources.length ||
                p.history.length >= 10 ||
                !!p.finalized
              }
              onClick={() => p.sample(0, abundance)}
            >
              Follow
            </Button>
            <Button
              size="small"
              disabled={
                !selectedCell?.[3] ||
                !!selectedCell?.[7] ||
                p.history.length >= 10 ||
                !!p.finalized
              }
              onClick={() => p.sample(1, abundance)}
            >
              Cross-cut
            </Button>
            <Button
              size="small"
              disabled={
                !selectedCell?.[3] ||
                !!selectedCell?.[8] ||
                p.history.length >= 10 ||
                !!p.finalized
              }
              onClick={() => p.sample(2, abundance)}
            >
              Characterize
            </Button>
          </Actions>
          {estimate && (
            <p>
              {Math.floor((estimate.quantity * 1.5) / 1000).toLocaleString()} t
              · {estimate.rate}% reference rate
              <br />
              Quantity includes the +50% playtest adjustment.
            </p>
          )}
          <p role="status">
            {p.message || 'Choose a section and take your first sample.'}
          </p>
          <Button
            disabled={!estimate || !!p.finalized}
            onClick={() => p.finalize(abundance)}
          >
            Select claim
          </Button>
          <Actions>
            <Button size="small" onClick={p.reset}>
              New playtest
            </Button>
            <Button size="small" onClick={p.close}>
              Exit view
            </Button>
          </Actions>
          <p>Local playtest · instant samples · progress lasts until reload.</p>
        </>
      )}
    </Panel>
  );
}
