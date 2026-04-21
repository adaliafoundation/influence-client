import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';
import { Permission, Station } from '@influenceth/sdk';
import { FixedSizeList } from 'react-window';

import Button from '~/components/ButtonAlt';
import Dropdown from '~/components/Dropdown';
import { MagnifyingIcon } from '~/components/Icons';
import UncontrolledTextInput from '~/components/TextInputUncontrolled';
import actionButtons from '~/game/interface/hud/actionButtons';
import useActionButtons from '~/hooks/useActionButtons';
import useCrewContext from '~/hooks/useCrewContext';
import useLot from '~/hooks/useLot';
import useScreenSize from '~/hooks/useScreenSize';
import useShip from '~/hooks/useShip';
import useStationedCrews from '~/hooks/useStationedCrews';
import useStore from '~/hooks/useStore';
import formatters from '~/lib/formatters';
import theme from '~/theme';
import { CrewInputBlock, MiniBarChart } from '../actionDialogs/components';
import { HudMenuCollapsibleSection, Tray } from './components/components';

const defaultBlockStyle = {
  height: 152, // (causes margin bottom of 8px)
  overflow: 'hidden',
  width: '100%'
};

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

const StationManifest = () => {
  const { props: actionProps } = useActionButtons();
  const history = useHistory();
  const { height: screenHeight } = useScreenSize();
  const lotId = useStore(s => s.asteroids.lot);
  const zoomScene = useStore(s => s.asteroids.zoomScene);

  const { accountCrewIds, crew, crewCan } = useCrewContext();
  const { data: lot } = useLot(lotId);

  const zoomShipId = zoomScene?.type === 'SHIP' ? zoomScene.shipId : null;
  const { data: zoomShip } = useShip(zoomShipId);

  const [shipId, ship] = useMemo(() => zoomShipId ? [zoomShipId, zoomShip] : [lot?.surfaceShip?.id, lot?.surfaceShip], [lot, zoomShip, zoomShipId]);

  const station = useMemo(() => ship || lot?.building, [lot, ship]);

  const { data: unfilteredCrews } = useStationedCrews(station);

  const [nameFilter, setNameFilter] = useState('');
  const [selectedCrewId, setSelectedCrewId] = useState();

  const onFilterChange = useCallback((e) => {
    setNameFilter(e.target.value || '');
  }, []);

  const canStation = useMemo(
    () => crewCan(Permission.IDS.STATION_CREW, station),
    [crewCan, station]
  );

  const crews = useMemo(() => {
    return (unfilteredCrews || [])
      .filter((c) => formatters.crewName(c).toLowerCase().includes(nameFilter.toLowerCase()))
      .map((c) => ({ ...c, _crewmates: c.Crew.roster.map((id) => ({ id })) }))
      .sort((a, b) => formatters.crewName(a) < formatters.crewName(b) ? -1 : 1)
  }, [unfilteredCrews, nameFilter]);

  const crewIsStationed = shipId ? (crew?._location?.shipId === ship?.id) : (crew?._location?.buildingId === lot?.building?.id);
  const hasTray = !crewIsStationed || selectedCrewId;

  const [flightCrew, passengerCrews, population] = useMemo(() => ([
    crews?.find(c => c.id === ship?.Control?.controller?.id),
    crews?.filter(c => c.id !== ship?.Control?.controller?.id),
    unfilteredCrews?.reduce((acc, cur) => acc + cur.Crew.roster.length, 0)
  ]), [crews, ship, unfilteredCrews]);

  const handleInspect = useCallback(() => {
    history.push(`/crew/${selectedCrewId}`);
  }, [selectedCrewId]);

  const renderCrewRow = useCallback(({ index, style }) => (
    <div style={{ ...style, paddingRight: 10 }}>
      <CrewInputBlock
        cardWidth={64}
        crew={crews[index]}
        inlineDetails
        isSelected={selectedCrewId && crews[index].id === selectedCrewId}
        onClick={() => setSelectedCrewId(crews[index].id)}
        subtle
        style={defaultBlockStyle} />
    </div>
  ), [crews, selectedCrewId]);

  const listWrapper = useRef();
  const [listHeight, setListHeight] = useState(0);
  useEffect(() => {
    setListHeight(listWrapper.current?.clientHeight || 500);
  }, [screenHeight]);

  const barColor = theme.colors.main;
  const stationCapacity = Station.TYPES[station?.Station?.stationType]?.cap || 0;
  return (
    <Wrapper>
      {!shipId && (
        <>
          <div style={{ padding: '12px 0', borderBottom: '1px solid #333', marginBottom: 12 }}>
            <MiniBarChart
              color={barColor}
              label="Station Population"
              valueStyle={{ color: barColor, fontWeight: 'bold' }}
              valueLabel={`${population || 0} / ${stationCapacity}`}
              value={(population || 0) / stationCapacity}
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
        </>
      )}

      <ListWrapper ref={listWrapper}>
        {shipId && (
          <>
            <HudMenuCollapsibleSection titleText="Flight Crew" collapsed={!flightCrew}>
              <div style={{ paddingRight: 10 }}>
                <CrewInputBlock
                  cardWidth={64}
                  crew={flightCrew}
                  inlineDetails
                  isSelected={selectedCrewId && flightCrew?.id === selectedCrewId}
                  onClick={flightCrew ? () => setSelectedCrewId(flightCrew?.id) : null}
                  subtle
                  style={defaultBlockStyle} />
              </div>
            </HudMenuCollapsibleSection>

            <HudMenuCollapsibleSection titleText="Passengers" collapsed={!(passengerCrews?.length > 0)}>
              <div style={{ paddingRight: 10 }}>
                {(passengerCrews || []).map((passengerCrew) => (
                  <CrewInputBlock
                    key={passengerCrew.id}
                    cardWidth={64}
                    crew={passengerCrew}
                    inlineDetails
                    isSelected={selectedCrewId && passengerCrew.id === selectedCrewId}
                    onClick={() => setSelectedCrewId(passengerCrew.id)}
                    subtle
                    style={defaultBlockStyle} />
                ))}
              </div>
            </HudMenuCollapsibleSection>
          </>
        )}
        {!shipId && (
          <FixedSizeList
            width={372}
            height={listHeight}
            itemCount={crews?.length || 0}
            itemSize={152}
            itemKey={(index) => crews?.[index]?.id || index}
            overscanCount={5}>
            {renderCrewRow}
          </FixedSizeList>
        )}
      </ListWrapper>

      {hasTray && (
        <Tray>
          {!crewIsStationed && crew && (
            <actionButtons.StationCrew.Component
              {...actionProps}
              labelAddendum={canStation ? '' : 'access restricted'}
              flags={{ disabled: !canStation }}
            />
          )}

          {selectedCrewId && accountCrewIds?.includes(selectedCrewId) && <actionButtons.EjectCrew.Component {...actionProps} />}

          {selectedCrewId && !accountCrewIds?.includes(selectedCrewId) && accountCrewIds?.includes(station?.Control?.controller?.id) && (
            <actionButtons.EjectGuestCrew.Component {...actionProps} dialogProps={{ guestId: selectedCrewId }}
            />
          )}

          <div style={{ flex: 1 }} />

          {selectedCrewId && (
            <Button onClick={handleInspect}>
              <MagnifyingIcon style={{ marginRight: 8 }} /> Inspect
            </Button>
          )}
        </Tray>
      )}
    </Wrapper>
  );
};

export default StationManifest;
