import { useMemo } from 'react';
import theme from '~/theme';
import styled from 'styled-components';
import { Entity, Permission } from '@influenceth/sdk';

import { MyAssetIcon, SwayIcon, WarningIcon, ChevronRightIcon } from '~/components/Icons';
import useSession from '~/hooks/useSession';
import useCrewContext from '~/hooks/useCrewContext';
import { LocationLink } from './components';
import formatters from '~/lib/formatters';

import { formatFixed, formatTimer, getTerminatedAgreementStatus, locationsArrToObj, monthsToSeconds, secondsToDays } from '~/lib/utils';
import useBlockTime from '~/hooks/useBlockTime';
import actionButtons from '../../hud/actionButtons';
import useActionButtons from '~/hooks/useActionButtons';
import EntityLink from '~/components/EntityLink';
import AddressLink from '~/components/AddressLink';

const ExpandableIcon = styled(ChevronRightIcon)`
  color: white;
  font-size: 150%;
  transform: rotate(0);
  transition: transform 150ms ease;
  ${p => p.isexpanded && `transform: rotate(90deg);`}
`;

const ProgressBar = styled.div`
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  height: 6px;
  margin-right: 15px;
  position: relative;
  width: 115px;
  &:before {
    content: ' ';
    background: ${p => p.theme.colors[p.overrideColor || 'main']};
    border-radius: 3px;
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: ${p => p.progress}%;
  }
`;

const Expired = styled.span`
  color: ${p => p.theme.colors.error};
  & > svg {
    font-size: 20px;
  }
`;

const Remaining = styled.span`
  display: inline-block;
  text-align: left;
  padding-right: 8px;
  width: 75px;
`;

const My = styled.span`
  color: white;
  font-size: 20px;
  margin-right: 4px;
`;

const Progress = ({ start, finish, overrideColor }) => {
  const blockTime = useBlockTime();

  const [progress, timeRemaining] = useMemo(() => ([
    100 * (Date.now() / 1000 - start) / (finish - start),
    formatTimer(finish - (Date.now() / 1000), 2)
  ]), [blockTime, start, finish])

  return (
    <>
      <Remaining>{timeRemaining}</Remaining>
      <ProgressBar progress={progress} overrideColor={overrideColor} />
    </>
  );
}

const useColumns = () => {
  const { accountAddress } = useSession();
  const { accountCrewIds, crew } = useCrewContext();
  const { props: actionProps } = useActionButtons();
  const blockTime = useBlockTime();

  return useMemo(() => {
    const columns = [
      {
        key: 'expandedIcon',
        align: 'right',
        selector: (row, { expanded }) => {
          if (row._agreement._type === Permission.POLICY_IDS.PREPAID) {
            if (crew?.id === row._agreement?.permitted?.id || row.Control?.controller?.id === crew?.id) {
              return <ExpandableIcon isexpanded={expanded} />;
            }
          }
          return null;
        },
        unhideable: true
      },
      {
        key: 'type',
        label: 'Agreement Type',
        sortField: '_agreement._type',
        selector: row => (
            <span style={{ color: Permission.POLICY_TYPES[row._agreement._type]?.name ? 'white' : theme.colors.success }}>
              {Permission.POLICY_TYPES[row._agreement._type]?.name || 'On Allowlist'}
            </span>
        )
      },
      {
        key: 'target',
        label: 'Target',
        sortField: 'uuid',
        selector: row => {
          const loc = locationsArrToObj(row.Location?.locations || []);
          return (
            <>
              <LocationLink asteroidId={loc?.asteroidId} lotId={loc?.lotId || row?.id} />
              <span>
                {row.label === Entity.IDS.BUILDING && formatters.buildingName(row)}
                {row.label === Entity.IDS.LOT && formatters.lotName(row)}
                {row.label === Entity.IDS.SHIP && formatters.shipName(row)}
              </span>
            </>
          )
        },
        unhideable: true
      },
      {
        key: 'controller',
        label: 'Controlling Crew',
        sortField: 'Control.controller.id',
        selector: row => (
          <>
            {accountCrewIds?.includes(row.Control?.controller?.id) && <My><MyAssetIcon /></My>}
            <EntityLink {...row.Control?.controller} />
          </>
        ), // TODO: is meta.crew.name populated?
        // unhideable: true
      },
      {
        key: 'permitted',
        label: 'Permitted Entity',
        sortField: '_agreement.permitted.id',
        selector: row => (
          row._agreement?.permitted?.id
            ? (
              <>
                {crew?.id === row._agreement?.permitted?.id && <My><MyAssetIcon /></My>}
                <EntityLink {...row._agreement?.permitted} />
              </>
            )
            : (
              <>
                {crew?.Crew?.delegatedTo && crew?.Crew?.delegatedTo === row._agreement?.permitted && <My><MyAssetIcon /></My>}
                <AddressLink address={row._agreement?.permitted} doNotReplaceYou truncate />
              </>
            )
        ), // TODO: is meta.crew.name populated?
        // unhideable: true
      },
      {
        key: 'permission',
        label: 'Permission',
        sortField: '_agreement.permission',
        selector: row => Permission.TYPES[row._agreement.permission].name
      },
      {
        key: 'time',
        label: 'Time Remaining',
        sortField: '_agreement.endTime',
        selector: row => {
          if (row._agreement._type === Permission.POLICY_IDS.PREPAID) { // TODO: factor in noticeTime?
            const timeRemaining = row._agreement.endTime - blockTime;
            if (timeRemaining > 0) {
              return (
                <Progress
                  start={row._agreement.startTime}
                  finish={row._agreement.endTime}
                  overrideColor={timeRemaining < 7 * 86400 ? 'error' : 'main'} />
              );
            }
            return (
              <Expired>
                <WarningIcon /> <span>{getTerminatedAgreementStatus(row._agreement.status)}</span>
              </Expired>
            );
          }
          return <>N / A</>;
        }
      },
      {
        key: 'rate',
        label: 'Rate',
        sortField: '_agreement.rate',
        selector: row => row._agreement._type === Permission.POLICY_IDS.PREPAID
          ? (
            <>
              <SwayIcon />
              {formatFixed((monthsToSeconds(1) * row._agreement.rate / 3600) / 1e6, 2)}
              {' '}/ mo
            </>
          )
          : `N / A`
      },
      {
        key: 'min',
        label: 'Minimum',
        sortField: '_agreement.initialTerm',
        selector: row => row._agreement._type === Permission.POLICY_IDS.PREPAID
          ? `${formatFixed(secondsToDays(row._agreement.initialTerm), 2)} day`
          : `N / A`
      },
      {
        key: 'notice',
        label: 'Notice',
        sortField: '_agreement.noticePeriod',
        selector: row => row._agreement._type === Permission.POLICY_IDS.PREPAID
          ? `${formatFixed(secondsToDays(row._agreement.noticePeriod), 2)} day`
          : `N / A`
      },
      {
        key: '_expandable',
        skip: true,
        selector: row => {
          if (row._agreement._type === Permission.POLICY_IDS.PREPAID) {
            if (row.Control?.controller?.id === crew?.id) {
              return (
                <div style={{ padding: '10px 15px' }}>
                  <actionButtons.EndAgreement.Component
                    {...actionProps}
                    entity={row}
                    permission={row._agreement.permission}
                    agreementPath={row._agreement._path} />
                </div>
              )
            } else if (row._agreement.permitted?.id === crew?.id || (crew?.Crew?.delegatedTo && row._agreement.permitted === crew.Crew.delegatedTo)) {
              return (
                <div style={{ padding: '10px 15px' }}>
                  <actionButtons.ExtendAgreement.Component
                    {...actionProps}
                    entity={row}
                    permission={row._agreement.permission} />
                  <actionButtons.TransferAgreement.Component
                    {...actionProps}
                    entity={row}
                    permission={row._agreement.permission} />
                </div>
              )
            }
          }
          return null;
        }
      },
    ];

    return columns.filter((c) => accountAddress || !c.requireLogin);
  }, [accountAddress, accountCrewIds, blockTime, crew?.id]);
};

export default useColumns;