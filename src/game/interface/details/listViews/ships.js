import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Entity, Ship } from '@influenceth/sdk';

import { MyAssetIcon, SwayIcon } from '~/components/Icons';
import useSession from '~/hooks/useSession';
import useCrewContext from '~/hooks/useCrewContext';
import { LocationLink, ShipLocationLink } from './components';
import formatters from '~/lib/formatters';
import { formatFixed, locationsArrToObj } from '~/lib/utils';
import EntityName from '~/components/EntityName';
import styled from 'styled-components';
import theme from '~/theme';

const Me = styled.span`
  color: ${p => p.theme.colors.main};
  font-weight: bold;
  margin-left: 4px;
  &:after {
    content: '(Me)';
  }
`;

const useColumns = () => {
  const { accountAddress } = useSession();
  const { accountCrewIds, crew } = useCrewContext();

  return useMemo(() => {
    const columns = [
      { // TODO: implement this per agreements/ownership
        key: 'my',
        align: 'center',
        icon: <MyAssetIcon />,
        selector: row => {
          return accountCrewIds?.includes(row.Control?.controller?.id) ? <MyAssetIcon /> : null; 
        },
        bodyStyle: { fontSize: '24px' },
        requireLogin: true,
        unhideable: true
      },
      {
        key: 'name',
        label: 'Name',
        sortField: 'Name.name.raw',
        selector: row => (
          <div>
            <ShipLocationLink shipId={row?.id} data-tooltip-place="top" />
            <span>{formatters.shipName(row)}</span>
          </div>
        ),
        unhideable: true
      },
      {
        key: 'type',
        label: 'Type',
        sortField: 'Ship.shipType',
        selector: row => (
          <span>{Ship.TYPES[row.Ship?.shipType]?.name}</span>
        ),
        unhideable: true
      },
      {
        key: 'status',
        label: 'Status',
        sortField: 'Location.location.label',
        selector: row => {
          const loc = locationsArrToObj(row.Location?.locations || []);
          if (loc.buildingId) return 'Docked';
          if (loc.lotId) return 'Landed';
          if (loc.asteroidId) return <span style={{color: theme.colors.main}}>In Orbit</span>;
          if (loc.spaceId) return <span style={{color: theme.colors.lightOrange}}>In Flight</span>;
          return '';
        },
      },
      {
        key: 'asteroid',
        label: 'Asteroid',
        sortField: 'meta.asteroid.name.raw',
        selector: row => {
          const loc = locationsArrToObj(row.Location?.locations || []);
          if (loc.asteroidId) {
            return (
              <>
                <LocationLink asteroidId={loc.asteroidId} />
                <span>{row.meta.asteroid.name || formatters.asteroidName({ id: loc.asteroidId })}</span>
              </>
            );
          }
          if (row?.Ship?.transitDestination) {
            return (
              <>
                <LocationLink asteroidId={row.Ship.transitDestination?.id} />
                <EntityName {...row.Ship.transitDestination} />
              </>
            )
          }
          return null;
        },
      },
      {
        key: 'lot',
        label: 'Lot',
        selector: row => {
          const loc = locationsArrToObj(row.Location?.locations || []);
          if (loc.lotId) {
            return (
              <>
                <LocationLink lotId={loc.lotId} />
                <span>{loc.buildingId ? <EntityName label={Entity.IDS.BUILDING} id={loc.buildingId} /> : formatters.lotName(loc.lotId)}</span>
              </>
            );
          }
          else return 'N / A'
        },
      },
      {
        key: 'crew',
        label: 'Flight Crew',
        sortField: 'meta.crew.name.raw',
        selector: row => {
          if (row.Control?.controller?.id) {
            return (
              <Link to={`/crew/${row.Control.controller.id}`}>
                {row.meta.crew.name || <EntityName {...row.Control.controller} />}
                {row.Control?.controller?.id === crew?.id && <Me />}
              </Link>
            );
          }
          return null;
        }
      },
      {
        key: 'variant',
        label: 'Variant',
        sortField: 'Ship.variant',
        selector: row => Ship.getVariant(row.Ship?.variant)?.name || '',
      },
      {
        key: 'price',
        label: 'Sale Price',
        sortField: 'Nft.price',
        selector: row => {
          if (row.Nft?.price > 0) {
            return <><SwayIcon /> {formatFixed(row.Nft.price / 1e6)}</>
          }
          return null;
        }
      },
    ];

    return columns.filter((c) => accountAddress || !c.requireLogin);
  }, [accountAddress, accountCrewIds, crew?.id]);
};

export default useColumns;