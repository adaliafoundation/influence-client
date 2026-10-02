import { useMemo } from 'react';
import styled from 'styled-components';
import { Asteroid, Building, Lot, Permission } from '@influenceth/sdk';

import EntityLink from '~/components/EntityLink';
import { MyAssetIcon, SwayIcon } from '~/components/Icons';
import useBlockTime from '~/hooks/useBlockTime';
import useCrewContext from '~/hooks/useCrewContext';
import useSession from '~/hooks/useSession';
import formatters from '~/lib/formatters';
import { formatFixed } from '~/lib/utils';
import { LocationLink } from './components';
import { TOKEN, TOKEN_SCALE } from '~/lib/priceUtils';

const AccessSubrow = styled.tr`
  & > th {
    align-items: center;
    color: ${p => {
      if (p.value === 'controller') return p.theme.colors.brightMain;
      else if (p.value === 'granted') return p.theme.colors.success;
      else if (p.value === 'restricted') return p.theme.colors.error;
      return 'white';
    }};
    display: flex;
    padding: 1px 0;
    text-align: right;
    vertical-align: middle;
  }
  & > td {
    font-size: 85%;
    padding-left: 4px;
    vertical-align: middle;
  }
`;
const AccessRowMin = styled.div`
  background: ${p => p.theme.colors.backgroundMain};
  border-radius: 6px;
  color: #CCC;
  display: inline-block !important;
  font-size: 10px;
  padding: 1px 5px !important;
  width: auto !important;
`;

const useColumns = () => {
  const { accountAddress } = useSession();
  const blockTime = useBlockTime();
  const { accountCrewIds, crew, crewAuthorization } = useCrewContext();

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
        key: 'type',
        label: 'Building Type',
        sortField: 'Building.buildingType',
        selector: row => {
          const lotId = row.Location?.location?.id;
          return (
            <>
              <LocationLink lotId={lotId} zoomToLot />
              <span>{Building.TYPES[row.Building.buildingType].name}</span>
            </>
          );
        },
        unhideable: true
      },
      {
        key: 'name',
        label: 'Name',
        sortField: 'Name.name.raw', // TODO: use meta.building.name?
        selector: row => {
          return (
            <span>{formatters.buildingName(row)}</span>
          );
        },
        unhideable: true
      },
      {
        key: 'asteroid',
        label: 'Asteroid',
        sortField: 'meta.asteroid.name.raw',
        selector: row => {
          const loc = Lot.toPosition(row.Location?.location);
          return (
            <>
              <LocationLink asteroidId={loc.asteroidId} />
              <span>{row.meta?.asteroid?.name || `#${loc.asteroidId}`}</span>
            </>
          );
        },
      },
      {
        key: 'lot',
        label: 'Lot',
        sortOptions: { nested: { path: 'Location.locations' } },
        sortField: 'Location.locations.id',
        selector: row => {
          const lotId = row.Location?.location?.id;
          return (
            <>
              <LocationLink lotId={lotId} />
              <span>{lotId ? Lot.toIndex(lotId).toLocaleString() : null}</span>
            </>
          );
        },
      },
      crew?._location && {
        key: 'distance',
        label: 'Distance',
        noMinWidth: true,
        selector: row => {
          const { asteroidId, lotIndex } = Lot.toPosition(row.Location?.location);
          if (!crew?._location?.lotId || asteroidId !== crew?._location?.asteroidId) {
            return '';
          }
          return `${formatFixed(Asteroid.getLotDistance(asteroidId, lotIndex, crew._location.lotIndex) || 0)} km`;
        },
      },
      crew && {
        key: 'access',
        label: 'Access',
        noMinWidth: true,
        selector: row => {
          const policyDetails = Permission.getPolicyDetails(row, undefined, blockTime);

          let lines = {};
          Object.keys(policyDetails).forEach((permId) => {
            const access = crewAuthorization(Number(permId), row);
            const policy = policyDetails[permId];
            if (access.status === 'unresolved') lines[permId] = 'checking';
            else if (access.status === 'allowed') lines[permId] = ['controller', 'shared-delegate', 'exact-entity'].includes(access.reason) ? 'controller' : 'granted';
            else if (policy.policyType === Permission.POLICY_IDS.PREPAID) lines[permId] = `${policy.policyDetails.rate}_${policy.policyDetails.initialTerm}`;
            else lines[permId] = 'restricted';
          });

          const isSingleRow = (new Set(Object.values(lines))).size === 1;
          return (
            <table style={{ margin: '6px 0' }}>
              <tbody>
                {(isSingleRow ? [Object.keys(lines)[0]] : Object.keys(lines))
                  .filter((p) => lines[p] !== 'restricted')
                  .sort((a, b) => lines[a] < lines[b] ? 1 : -1)
                  .map((permId) => {
                    const [value, min] = lines[permId].split('_');
                    const thValue = isNaN(parseInt(value))
                      ? (value || '').toUpperCase()
                      : (
                        <>
                          <span style={{ fontSize: '115%' }}><SwayIcon /></span>
                          <span>
                            {formatFixed(value / TOKEN_SCALE[TOKEN.SWAY])} / hr
                          </span>
                        </>
                      );
                    return (
                      <AccessSubrow key={permId} value={lines[permId]}>
                        <th>{thValue}</th>
                        {!isSingleRow && <td>{Permission.TYPES[permId].name}</td>}
                        {min > 0 && <td><AccessRowMin>&gt; {(min / 3600).toLocaleString()} hr</AccessRowMin></td>}
                      </AccessSubrow>
                    );
                  })
                }
              </tbody>
            </table>
          );
        },
      },
      {
        key: 'crew',
        label: 'Controller',
        // sortField: 'Control.controller.id',
        selector: row => {
          return row.Control?.controller?.id ? <EntityLink {...row.Control.controller} /> : 'Uncontrolled';
        }
      },
      {
        key: 'occupation',
        label: 'Lot Use Type',
        selector: row => {
          if (row.meta?.lotOccupation) {
            return row.meta.lotOccupation.charAt(0).toUpperCase() + row.meta.lotOccupation.slice(1);
          }

          return 'Un-occupied';
        },
      },
      {
        key: 'construction',
        label: 'Construction Status',
        sortField: 'Building.status',
        selector: row => {
          if (row.Building?.status) {
            return Building.CONSTRUCTION_STATUS_LABELS[row.Building.status];
          }
          return null;
        }
      },
    ];

    return columns.filter((c) => c && (accountAddress || !c.requireLogin));
  }, [crewAuthorization, accountAddress, accountCrewIds, blockTime, crew]);
};

export default useColumns;