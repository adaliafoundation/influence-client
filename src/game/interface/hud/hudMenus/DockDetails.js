import { useCallback, useMemo, useState } from 'react';
import styled from 'styled-components';
import { Dock, Ship } from '@influenceth/sdk';

import ClipCorner from '~/components/ClipCorner';
import { MagnifyingIcon, MyAssetIcon } from '~/components/Icons';
import formatters from '~/lib/formatters';
import useCrewContext from '~/hooks/useCrewContext';
import useStore from '~/hooks/useStore';
import theme from '~/theme';
import { Tray } from './components/components';
import useLot from '~/hooks/useLot';
import { MiniBarChart, ShipImage } from '../actionDialogs/components';
import Dropdown from '~/components/Dropdown';
import UncontrolledTextInput from '~/components/TextInputUncontrolled';
import AssetBlock, { assetBlockCornerSize } from '~/components/AssetBlock';
import ThumbnailWithData from '~/components/AssetThumbnailWithData';
import { CrewCaptainCardFramed } from '~/components/CrewmateCardFramed';
import Button from '~/components/ButtonAlt';
import useBlockTime from '~/hooks/useBlockTime';

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  height: 100%;
`;

const FilterRow = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  padding-bottom: 12px;
  & > *:first-child, & > *:last-child {
    flex: 1;
  }
`;
const ListWrapper = styled.div`
  flex: 1;
  overflow: hidden auto;
`;

const ShipBlock = styled(AssetBlock)`
  padding-right: 8px;
  margin-bottom: 6px;
  & > div {
    align-items: center;
    display: flex;
    flex-direction: row;
  }
`;

const Ready = styled.div`
  color: ${p => p.theme.colors.main};
  font-weight: bold;
  min-height: 18px;
  margin-top: 4px;
  text-transform: uppercase;
  visibility: ${p => p.$visible ? 'visible' : 'hidden'};
`;

const DockDetails = ({ onClose }) => {
  const { accountCrewIds } = useCrewContext();
  const blockTime = useBlockTime();

  const lotId = useStore(s => s.asteroids.lot);
  const dispatchZoomScene = useStore(s => s.dispatchZoomScene);

  const { data: lot } = useLot(lotId);

  const [nameFilter, setNameFilter] = useState('');
  const [selectedShipId, setSelectedShipId] = useState();
  const selectedShip = useMemo(() => lot?.ships?.find((s) => s.id === selectedShipId), [lot?.ships, selectedShipId]);

  const onFilterChange = useCallback((e) => {
    setNameFilter(e.target.value || '');
  }, []);

  const zoomIn = useCallback(() => {
    dispatchZoomScene({ type: 'SHIP', shipId: selectedShipId });
  }, [selectedShipId]);

  const filteredShips = useMemo(() => {
    return (lot?.ships || []).filter((s) => {
      return formatters.shipName(s).toLowerCase().includes(nameFilter.toLowerCase())
    })
  }, [lot?.ships, nameFilter]);

  const barColor = theme.colors.main;
  const dockCapacity = Dock.TYPES[lot?.building?.Dock?.dockType]?.cap || 0;
  return (
    <Wrapper>
      <div style={{ padding: '12px 0', borderBottom: '1px solid #333', marginBottom: 12 }}>
        <MiniBarChart
          color={barColor}
          label="Ship Slots"
          valueStyle={{ color: barColor, fontWeight: 'bold' }}
          valueLabel={`${lot?.ships?.length || 0} / ${dockCapacity}`}
          value={(lot?.ships?.length || 0) / dockCapacity}
        />
      </div>

      <FilterRow>
        <div>
          <Dropdown
            disabled
            background="transparent"
            options={['Alphabetically']}
            size="small"
            textTransform="none"
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ width: 8 }} />

        <UncontrolledTextInput onChange={onFilterChange} placeholder="Filter by Name" />
      </FilterRow>

      <ListWrapper>
        <div>
          {/* TODO: formatting + asset icon */}
          {filteredShips.map((ship) => (
            <ShipBlock key={ship.id} isSelected={selectedShipId === ship.id} onClick={() => setSelectedShipId(ship.id)} subtle>
              <div>
                <ThumbnailWithData noWrap style={{ width: 'calc(100% - 60px)' }}>
                  <ShipImage
                    iconBadge={accountCrewIds?.includes(ship.Control?.controller?.id) ? <MyAssetIcon /> : null}
                    shipType={ship.Ship.shipType}
                    style={{ width: 100, height: 85 }} />
                  <label style={{ padding: '0 8px', width: 'calc(100% - 100px)' }}>
                    <h3 style={{ fontSize: '17px', margin: 0 }}>{formatters.shipName(ship)}</h3>
                    <div><b>{Ship.TYPES[ship.Ship.shipType]?.name}</b></div>
                    <Ready $visible={blockTime >= ship.Ship.readyAt}>Launch Ready</Ready>
                  </label>
                </ThumbnailWithData>
                <div style={{ width: 54 }}>
                  <CrewCaptainCardFramed crewId={ship.Control.controller.id} noAnimation width={54} />
                </div>
              </div>
              <ClipCorner dimension={assetBlockCornerSize} />
            </ShipBlock>
          ))}
        </div>
      </ListWrapper>

      {selectedShip && (
        <Tray>
          <Button onClick={zoomIn}>
            <MagnifyingIcon style={{ marginRight: 8 }} /> Zoom to Ship
          </Button>
          {/* TODO: station / eject / launch / etc? */}
        </Tray>
      )}
    </Wrapper>
  );
};

export default DockDetails;
