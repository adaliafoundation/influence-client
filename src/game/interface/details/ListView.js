import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { Tooltip } from 'react-tooltip';

import usePagedAssets from '~/hooks/usePagedAssets';
import DataTable from '~/components/DataTable';
import Details, { borderColor } from '~/components/DetailsV2';
import Pagination from '~/components/Pagination';
import SearchFilters from '~/components/SearchFilters';
import SearchFilterTray from '~/components/SearchFilterTray';
import InProgressIcon from '~/components/InProgressIcon';
import {
  AgreementIcon,
  AsteroidIcon,
  BuildingIcon,
  ColumnsIcon,
  CrewIcon,
  CrewmateIcon,
  LinkIcon,
  LoggedEventsIcon,
  ShipIcon,
  SlidersIcon
} from '~/components/Icons';
import Button from '~/components/ButtonAlt';
import Dropdown from '~/components/Dropdown';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import Multiselect from '~/components/Multiselect';
import { statuses } from '~/lib/actionItem';
import usePagedActionItems from '~/hooks/usePagedActionItems';
import usePagedAgreements from '~/hooks/usePagedAgreements';
import usePagedEvents from '~/hooks/usePagedEvents';
import useStore from '~/hooks/useStore';
import theme from '~/theme';
import listConfigs from './listViews';
import { reactBool } from '~/lib/utils';
import { TimerIcon } from '~/components/Icons';
import { ListViewIcon } from '~/components/Icons';
import IconButton from '~/components/IconButton';

const footerMargin = 12;
const filterWidth = 344;

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  height: calc(100% - 1px);
`;
const Controls = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  height: 59px;
  padding: 10px 10px 0;
  width: 100%;
  & > div {
    padding-bottom: 5px;
  }
`;
const LeftControls = styled.div`
  align-items: center;
  display: flex;
  height: 100%;
  width: 334px;
  border-right: 1px solid ${p => p.filtersOpen ? borderColor : 'transparent'};
  transition: border-color 250ms ease;
`;

const ResultContainer = styled.div`
  align-items: center;
  color: ${p => p.theme.colors.main};
  display: flex;
  height: 100%;
  padding-left: ${p => p.filtersOpen ? '16px' : '0'};
  transition: padding-left 250ms ease;
`;
const ResultCount = styled.div`
  &:before {
    background: ${p => p.theme.colors.main};
    content: '';
    display: inline-block;
    height: 10px;
    margin-right: 8px;
    transform: rotate(45deg);
    transform-origin: center center;
    width: 10px;
  }
`;
const MainWrapper = styled.div`
  display: flex;
  flex: 1;
  flex-direction: row;
  height: 0;
  margin-bottom: ${footerMargin}px;
`;

const FilterContainer = styled.div`
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  transition: margin 250ms ease, width 250ms ease;

  ${p => p.open
    ? `
      border-right: 1px solid ${borderColor};
      margin-right: 16px;
      width: ${filterWidth}px;
    `
    : `
      border-right: 1px solid transparent;
      margin-right: 0;
      width: 0;
    `
  }

  & > div:last-child {
    border-top: 0;
  }
`;
const InnerFilterContainer = styled.div`
  height: 100%;
  margin-right: -12px;
  overflow-x: hidden;
  overflow-y: auto;
  padding-right: 28px;
`;
const TableContainer = styled.div`
  flex: 1;
  height: 100%;
  overflow-x: auto;
`;
const Tray = styled.div`
  align-items: center;
  border-top: 1px solid ${borderColor};
  display: flex;
  flex-direction: row;
  height: 80px;
`;

const Loading = styled.div`
  display: flex;
  justify-content: center;
`;

const Pages = styled.div`
  color: #999;
  display: flex;
  flex: 1;
  justify-content: flex-end;
  padding-right: 15px;
  & b {
    color: white;
    font-weight: normal;
  }
`;

const assetTypes = {
  asteroids: {
    keyField: 'id',
    icon: <AsteroidIcon />,
    title: 'Asteroids',
    useColumns: listConfigs.asteroids,
  },
  // NOTE: this was mostly rolled into the buildings with the ecs refactor...
  //  it's not clear what additional info would make sense here at this point
  // lots: {
  //   keyField: 'id',
  //   icon: <LotSearchIcon />,
  //   title: 'Lots',
  //   useColumns: listConfigs.lots,
  // },
  crewmates: {
    keyField: 'id',
    icon: <CrewmateIcon />,
    title: 'Crewmates',
    useColumns: listConfigs.crewmates,
  },
  crews: {
    keyField: 'id',
    icon: <CrewIcon />,
    title: 'Crews',
    useColumns: listConfigs.crews,
  },
  buildings: {
    keyField: 'id',
    icon: <BuildingIcon />,
    title: 'Buildings',
    useColumns: listConfigs.buildings,
  },
  // coresamples: {
  //   keyField: 'id',
  //   icon: <CoreSampleIcon />,
  //   title: 'Core Samples',
  //   useColumns: listConfigs.coreSamples,
  // },
  ships: {
    keyField: 'id',
    icon: <ShipIcon />,
    title: 'Ships',
    useColumns: listConfigs.ships,
  },
  agreements: {
    keyField: 'key',
    icon: <AgreementIcon />,
    title: 'Agreements',
    useColumns: listConfigs.agreements,
    // TODO: link to agreements on asset
    usePagedAssetsOverride: usePagedAgreements,
    // hideInDropdown: true,
    // disableFilters: true
  },
  // leases: {
  //   keyField: 'i',
  //   icon: <RocketIcon />, // TODO
  //   title: 'Leases',
  //   useColumns: listConfigs.asteroids,
  // },
  // actions: {
  //   keyField: 'i',
  //   icon: <RocketIcon />, // TODO
  //   title: 'Actions',
  //   useColumns: listConfigs.asteroids,
  // },
  // transactions: {
  //   keyField: 'i',
  //   icon: <TransactionIcon />,
  //   title: 'Transactions',
  //   useColumns: listConfigs.asteroids,
  // },
  actionitems: {
    keyField: 'key',
    icon: <TimerIcon />,
    title: 'Active Events',
    useColumns: listConfigs.actionItems,
    usePagedAssetsOverride: usePagedActionItems,
    getRowProps: (row) => {
      if (row._expired || statuses[row.type]) {
        return {
          status: row._expired ? '_expired' : row.type
        };
      }
      return {};
    }
  },
  eventlog: {
    keyField: 'i',
    icon: <LoggedEventsIcon />,
    title: 'Logged Events',
    useColumns: listConfigs.events,
    usePagedAssetsOverride: usePagedEvents,
    disableFilters: true
  }
}

const assetsAsOptions = Object.keys(assetTypes)
  .map((key) => ({
    value: key,
    label: assetTypes[key].title,
    hide: assetTypes[key].hideInDropdown,
    icon: assetTypes[key].icon
  }));

const ListViewComponent = ({ assetType, onAssetTypeChange, onParamsApplied, params }) => {
  const { keyField, getRowProps, useColumns, usePagedAssetsOverride, disableFilters } = assetTypes[assetType];
  const { query, page, perPage, setPage, sort, setSort, disablePagination } = usePagedAssetsOverride ? usePagedAssetsOverride(params) : usePagedAssets(assetType); // eslint-disable-line react-hooks/rules-of-hooks
  const [sortField, sortDirection, sortOptions] = sort || [];

  const filters = useStore(s => s.assetSearch[assetType].filters);
  const isAssetSearchFilterMatchingDefault = useStore(s => s.isAssetSearchFilterMatchingDefault);
  const createAlert = useStore(s => s.dispatchAlertLogged);
  const updateFilters = useStore(s => s.dispatchFiltersUpdated(assetType));

  const columns = useColumns();

  const [disabledColumns, setDisabledColumns] = useState([]);
  const [filtersOpen, setFiltersOpen] = useState();

  const onCopyLink = useCallback(() => {
    try {
      const { origin, pathname } = window.location || {};
      navigator.clipboard.writeText(`${origin}${pathname}?filters=${JSON.stringify(filters)}&sort=${JSON.stringify(sort)}`);
      createAlert({
        type: 'ClipboardAlert',
        data: { content: 'Advanced search link copied to clipboard.' },
        duration: 3000
      });
    } catch (e) {
      console.warn(e);
    }
  }, [filters, sort]);

  useEffect(() => {
    try {
      if (params?.filters) updateFilters(JSON.parse(params?.filters));
      if (params?.sort) setSort(JSON.parse(params?.sort));
      if (params?.filters || params?.sort) onParamsApplied();
    } catch (e) {
      console.error(e);
    }
  }, [params])

  const onToggleColumns = useCallback((col) => () => {
    setDisabledColumns((colKeys) => {
      if (colKeys.find((k) => k === col.key)) {
        return colKeys.filter((k) => k !== col.key);
      }
      return [...colKeys, col.key];
    });
  }, []);

  const onToggleFilters = useCallback(() => {
    setFiltersOpen((o) => !o);
  }, []);

  const onClickFilters = useCallback(() => {
    setFiltersOpen(true);
  }, []);

  const handleSort = useCallback((field, options = {}) => () => {
    if (!field) return;

    let updatedSortField = sortField;
    let updatedSortDirection = sortDirection;
    if (field === sortField) {
      updatedSortDirection = sortDirection === 'desc' ? 'asc' : 'desc';
    } else {
      updatedSortField = field;
      updatedSortDirection = 'desc';
    }

    setSort([updatedSortField, updatedSortDirection, options]);
  }, [sortDirection, sortField, sortOptions]);

  useEffect(() => {
    if (query?.data?.length === 0) setPage(1);
  }, [ query?.data, setPage ]);

  // on asset type change
  useEffect(() => {
    setDisabledColumns([]);
    setPage(1);
  }, [assetType, setPage]);

  const enabledColumns = useMemo(() => {
    return columns.filter((c) => !disabledColumns.includes(c.key));
  }, [columns, disabledColumns]);

  const hideableColumns = useMemo(() => {
    return columns.filter((c) => !c.skip).filter((c) => !c.unhideable);
  }, [columns]);

  const enabledColumnKeys = useMemo(() => enabledColumns.map((c) => c.key), [enabledColumns]);

  const activeFilters = useMemo(() => {
    return Object.keys(filters || {})
      .reduce((acc, fieldName) => acc + (isAssetSearchFilterMatchingDefault(assetType, fieldName) ? 0 : 1), 0)
  }, [assetType, filters]);

  return (
    <Details fullWidth title="Advanced Search" contentProps={{ hasFooter: true }}>
      <Tooltip id="listViewTooltip" />
      <Wrapper>
        <Controls>
          <LeftControls filtersOpen={filtersOpen}>
            <Dropdown
              initialSelection={assetType}
              onChange={onAssetTypeChange}
              options={assetsAsOptions.filter((o) => !o.hide || (o.value === assetType))}
              size="medium"
              width={272} />
            <div style={{ marginLeft: 6 }}>
              <Button
                data-tooltip-id="globalTooltip"
                data-tooltip-place="right"
                data-tooltip-content={filtersOpen ? 'Hide Filters' : 'Show Filters'}
                background={filtersOpen ? `rgba(${theme.colors.mainRGB}, 0.6)` : undefined}
                badge={filtersOpen ? undefined : activeFilters}
                disabled={disableFilters}
                onClick={onToggleFilters}
                size="bigicon">
                <SlidersIcon />
              </Button>
            </div>
          </LeftControls>
          <ResultContainer filtersOpen={reactBool(filtersOpen)}>
            {query?.isLoading
              ? <Loading><InProgressIcon height={14} /></Loading>
              : <ResultCount>{(query?.data?.total || 0).toLocaleString()} Result{query?.data?.total === 1 ? '' : 's'}</ResultCount>
            }
          </ResultContainer>
          <div style={{ flex: 1 }} />
          {!!activeFilters && !usePagedAssetsOverride && (
            <div style={{ marginRight: 6 }}>
              <Button
                data-tooltip-content="Copy Search Link"
                data-tooltip-id="listViewTooltip"
                data-tooltip-place="left"
                onClick={onCopyLink}
                size="bigicon" >
                <LinkIcon />
              </Button>
            </div>
          )}
          <Multiselect
            enabledKeys={enabledColumnKeys}
            buttonIcon={<ColumnsIcon />}
            buttonLabel="Columns"
            onChange={onToggleColumns}
            options={hideableColumns}
            size="medium"
            width={175}
          />
        </Controls>

        <MainWrapper>
          <FilterContainer open={filtersOpen}>
            <InnerFilterContainer>
              <SearchFilters
                isListView={true}
                assetType={assetType}
                filters={filters}
                updateFilters={updateFilters} />
            </InnerFilterContainer>
          </FilterContainer>
          <TableContainer>
            <DataTable
              columns={enabledColumns}
              data={query?.data?.hits || []}
              getRowProps={getRowProps}
              keyField={keyField}
              onClickColumn={handleSort}
              sortOptions={sort[2]}
              sortDirection={sort[1]}
              sortField={sort[0]}
            />
          </TableContainer>
        </MainWrapper>
        <Tray>
          <div style={{ display: 'flex' }}>
            <SearchFilterTray
              assetType={assetType}
              handleClickFilters={onClickFilters} />
          </div>
          {!disablePagination && (
            <>
              <Pages>
                {!query?.isLoading && query?.data?.total > 0 && (
                  <>
                    <b>
                      {((page - 1) * perPage + 1).toLocaleString()}-{Math.min(page * perPage, query?.data?.total).toLocaleString()} |
                    </b>
                    &nbsp;
                    <span>
                      Page {page.toLocaleString()} of {Math.ceil(query.data.total / perPage).toLocaleString()}
                    </span>
                  </>
                )}
              </Pages>
              <div>
                <Pagination
                  currentPage={page}
                  rowsPerPage={perPage}
                  rowCount={query?.data?.total || 0}
                  onChangePage={setPage} />
              </div>
            </>
          )}
        </Tray>
      </Wrapper>
    </Details>
  );
};

const ListView = () => {
  const { assetType } = useParams();
  const { search } = useLocation();
  const history = useHistory();

  const onAssetTypeChange = useCallback(({ value }) => {
    history.push(`/listview/${value}`);
  }, []);

  useEffect(() => {
    if (!assetType) history.push('/listview/asteroids');
    else if (!assetTypes[assetType]) history.replace('/listview/asteroids');
  }, [assetType]);

  const params = useMemo(() => Object.fromEntries(new URLSearchParams(search)), [search]);
  const onParamsApplied = useCallback(() => {
    history.replace(`/listview/${assetType}`);
  }, [assetType]);

  if (!assetType) return null;

  // (NOTE: key forces remount so that doesn't complain about hook order changing due to useColumns)
  return (
    <ListViewComponent
      key={assetType}
      assetType={assetType}
      onAssetTypeChange={onAssetTypeChange}
      onParamsApplied={onParamsApplied}
      params={params} />
  );
};

export default ListView;
