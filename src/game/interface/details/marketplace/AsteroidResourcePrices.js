import { useCallback, useMemo, useState } from 'react';
import { useHistory } from 'react-router-dom';
import styled from 'styled-components';
import { Asteroid, Entity, Lot, Permission } from '@influenceth/sdk';

import Button from '~/components/ButtonAlt';
import ClipCorner from '~/components/ClipCorner';
import CrewIndicator from '~/components/CrewIndicator';
import DataTable from '~/components/DataTable';
import { MarketplaceBuildingIcon, SwayIcon } from '~/components/Icons';
import ResourceThumbnail from '~/components/ResourceThumbnail';
import { formatResourceAmount } from '~/game/interface/hud/actionDialogs/components';
import useCrew from '~/hooks/useCrew';
import useCrewContext from '~/hooks/useCrewContext';
import useOrderSummaryByExchange from '~/hooks/useOrderSummaryByMarket';
import useEntities from '~/hooks/useEntities';
import useLot from '~/hooks/useLot';
import { formatFixed, formatPrice, nativeBool } from '~/lib/utils';
import { getBuildingIcon } from '~/lib/assetUtils';
import formatters from '~/lib/formatters';
import theme from '~/theme';
import useCoachmarkRefSetter from '~/hooks/useCoachmarkRefSetter';
import useStore from '~/hooks/useStore';
import { COACHMARK_IDS } from '~/contexts/CoachmarkContext';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';
import { IconLink, LocationLink, MarketplacePermissionsIcon } from '../listViews/components';
import SIMULATION_CONFIG from '~/simulation/simulationConfig';


const Header = styled.div`
  align-items: center;
  border-bottom: 1px solid #333;
  color: #999;
  display: flex;
  flex-direction: row;
  height: 291px;
  margin-top: -25px;
  padding-bottom: 25px;
  padding-top: 25px;

  & > div:first-child {
    flex: 1;
    h1 {
      color: white;
      font-size: ${p => {
        if (p.resourceName.length >= 30) return `30px`;
        if (p.resourceName.length >= 24) return `40px`;
        return '50px';
      }};
      font-weight: normal;
      line-height: 1em;
      margin: 0;
      text-transform: uppercase;
    }
  }
`;
const Subheader = styled.div`
  line-height: 1em;
  padding-top: 5px;
  span:not(:first-child) {
    border-left: 1px solid #777;
    margin-left: 10px;
    padding-left: 10px;
  }
`;

const MarketSummary = styled.div`
  border: solid #333;
  border-width: 1px 0;
  display: inline-block;
  line-height: 1.4em;
  margin: 20px 0 12px;
  padding: 10px 40px 10px 0;
  b {
    color: white;
    font-weight: normal;
  }
`;
const MarketPrice = styled.div`
  color: white;
  font-size: 25px;
  label {
    color: #999;
    font-size: 18px;
  }
`;

const Body = styled.div`
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
  padding-bottom: 15px;
  padding-top: 15px;
`;

const TableContainer = styled.div`
  flex: 1;
  height: 100%;
  overflow-y: auto;
  thead th {
    background: rgba(0, 0, 0, 0.75);
  }
`;

const IconWrapper = styled.div`
  color: white;
  font-size: 22px;
  margin-right: 4px;
`;

const SelectedMarketplace = styled.div`
& label {
    text-align: right;
    color: white;
    display: block;
    font-size: 24px;
    margin-bottom: 12px;
  }
  & > div:last-child {
    align-items: center;
    display: flex;
    margin-bottom: 4px;
  }
`;
const MarketplaceImage = styled.div`
  border: 1px solid #333;
  ${p => p.theme.clipCorner(10)};
  margin-left: 15px;
  padding: 6px;
  position: relative;
  & img {
    ${p => p.theme.clipCorner(6)};
    width: 232px;
  }
`;

const PseudoFooterButton = styled(Button)`
  position: absolute;
  bottom: 15px;
  right: 0px;
`;

const Empty = styled.span`
  opacity: 0.5;
`;

const Demand = styled.span`
  color: ${theme.colors.main};
`;

const Supply = styled.span`
  color: ${theme.colors.green};
`;

const MarketplaceName = styled.span`
  color: ${p => {
    if (p.crew && p.acesss === 'full') return p.theme.colors.white;
    if (p.crew && p.access === 'limited') return p.theme.colors.yellow;
    if (p.crew && p.access === 'none') return p.theme.colors.red;
  }};
`;

const AsteroidResourcePrices = ({ asteroid, mode, resource }) => {
  const history = useHistory();

  const { crew, crewCan } = useCrewContext();
  const [selected, setSelected] = useState();
  const [sort, setSort] = useState(['sellPrice', 'asc']);
  const [sortField, sortDirection] = sort;

  const setCoachmarkRef = useCoachmarkRefSetter();
  const coachmarkHelperProduct = useStore(s => s.coachmarks?.[COACHMARK_IDS.asteroidMarketsHelper]);
  const simulationEnabled = useSimulationEnabled();
  const simulationActions = useStore((s) => s.simulationActions);

  const { data: selectedLot } = useLot(selected);
  const { data: marketplaceOwner } = useCrew(selectedLot?.building?.Control?.controller?.id);

  const { data: orderSummary } = useOrderSummaryByExchange(asteroid.id, resource.i);

  const marketPlaceIds = useMemo(() => Array.from(new Set((orderSummary || []).map((o) => o.marketplace.id))), [orderSummary]);
  const { data: resourceMarketplaceEntities, isLoading: marketplacesLoading } = useEntities({ ids: marketPlaceIds, label: Entity.IDS.BUILDING });

  const isPermitted = useCallback(({ exchange, mode, type, isCancellation }) => {
    if (isCancellation) return true;

    let perm = 0;
    if (type === 'limit' && mode === 'buy') perm = Permission.IDS.LIMIT_BUY;
    if (type === 'limit' && mode === 'sell') perm = Permission.IDS.LIMIT_SELL;
    if (type === 'market' && mode === 'buy') perm = Permission.IDS.BUY;
    if (type === 'market' && mode === 'sell') perm = Permission.IDS.SELL;
    return crewCan(perm, exchange);
  }, [crewCan]);

  const resourceMarketplaces = useMemo(() => {
    if (!orderSummary) return [];
    const transformedOrders = orderSummary.map((o) => {
      const exchange = resourceMarketplaceEntities?.find((mp) => mp.id === o.marketplace.id);
      const permissions = {
        'Limit Buy': (exchange) ? isPermitted({ exchange, type: 'limit', mode: 'buy' }) : null,
        'Limit Sell': (exchange) ? isPermitted({ exchange, type: 'limit', mode: 'sell' }) : null,
        'Market Buy': (exchange) ? isPermitted({ exchange, type: 'market', mode: 'buy' }) : null,
        'Market Sell': (exchange) ? isPermitted({ exchange, type: 'market', mode: 'sell' }) : null,
        map(fn) {
          return Object.keys(this).map((k) => {
            if (typeof this[k] !== 'function') return fn(k, this[k]);
          });
        },
        values() {
          return Object.keys(this).reduce((acc, k) => {
            if (typeof this[k] !== 'function') acc.push(this[k]);
            return acc;
          }, []);
        },
        accessLevel() {
          if (this.values().every((v) => v === true)) return 'full';
          if (this.values().some((v) => v === true))  return 'limited';
          return 'none';
        }
      };

      return {
        permissions,
        marketplaceName: formatters.buildingName(o.marketplace),
        lotId: o.marketplace?.Location?.location?.id,
        supply: o.sell.amount,
        demand: o.buy.amount,
        distance: crew?._location?.asteroidId === asteroid.id ? Asteroid.getLotDistance(asteroid.id, crew?._location?.lotIndex, Lot.toIndex(o.marketplace?.Location?.location?.id)) : 0,
        buyPrice: o.buy.price,
        sellPrice: o.sell.price,
        centerPrice: (o.sell.price && o.buy.price) ? (o.sell.price + o.buy.price) / 2 : (o.sell.price || o.buy.price || 0),
        makerFee: o.marketplace?.Exchange?.makerFee,
        takerFee: o.marketplace?.Exchange?.takerFee,
      };
    });

    if (simulationEnabled && resource.i === coachmarkHelperProduct) {
      if (simulationActions.includes('MarketBuy') && !simulationActions.includes('LimitSell')) {
        return transformedOrders.filter((o) => o.supply > parseInt(SIMULATION_CONFIG.marketplaceAmounts[coachmarkHelperProduct]) || 0);
      } else if (simulationActions.includes('MarketSell') && !simulationActions.includes('LimitBuy')) {
        return transformedOrders.filter((o) => o.demand > parseInt(SIMULATION_CONFIG.marketplaceAmounts[coachmarkHelperProduct]) || 0);
      }
    }
    return transformedOrders;
  }, [asteroid.id, coachmarkHelperProduct, crew, orderSummary, simulationEnabled, simulationActions, resourceMarketplaceEntities]);

  useMemo(() => {
    return resourceMarketplaces.find((m) => m.lotId === selected)?.supply || 0;
  }, [selected]);

  const handleSort = useCallback((field) => () => {
    if (!field) return;

    let updatedSortField = sortField;
    let updatedSortDirection = sortDirection;

    if (field === sortField) {
      updatedSortDirection = sortDirection === 'desc' ? 'asc' : 'desc';
    } else {
      updatedSortField = field;
      updatedSortDirection = 'desc';
    }

    setSort([
      updatedSortField,
      updatedSortDirection
    ]);
  }, [sortDirection, sortField]);

  const sortedMarketplaces = useMemo(() => {
    const fieldSortOrder = (a, b) => {
      if (a[sortField] < b[sortField]) {
        return sortDirection === 'asc' ? -1 : 1;
      } else if (a[sortField] > b[sortField]) {
        return sortDirection === 'asc' ? 1 : -1;
      } else {
        return 0;
      }
    };

    return (resourceMarketplaces || []).sort((a,b) => {
      if (['supply', 'sellPrice'].includes(sortField)) {
        if (a.supply > 0 && b.supply === 0) return -1;
        if (b.supply > 0 && a.supply === 0) return 1;
        return fieldSortOrder(a, b);
      } else if (['demand', 'buyPrice'].includes(sortField)) {
        if (a.demand > 0 && b.demand === 0) return -1;
        if (b.demand > 0 && a.demand === 0) return 1;
        return fieldSortOrder(a, b);
      } else {
        // Marketplace or Distance sort
        return fieldSortOrder(a, b);
      }
    });
  }, [resourceMarketplaces, sortField, sortDirection]);

  const columns = useMemo(() => {
    const c = [
      {
        key: 'marketplaceName',
        label: 'Marketplace',
        sortField: 'marketplaceName',
        selector: row => (
          <>
            <LocationLink
              style={{ marginRight: 6 }}
              asteroidId={asteroid.id}
              lotId={row.lotId}
              data-tooltip-id="detailsTooltip" />
            <MarketplaceName
              access={marketplacesLoading ? 'full' : row.permissions.accessLevel()}
              crew>
              {row.marketplaceName}
              {(!marketplacesLoading && (!crew || row.permissions.accessLevel() === 'full')) || (
                <MarketplacePermissionsIcon
                  style={{ marginLeft: 6, fontSize:'140%'}}
                  permissions={row.permissions}
                  data-tooltip-id={"detailsTooltip"}
                />
              )}
            </MarketplaceName>
          </>
        ),
      },
      {
        key: 'supply',
        label: 'Supply',
        sortField: 'supply',
        selector: row => (
          <>
            {row.supply === 0 ||
            <IconLink
              style={{ marginRight: 6 }}
              onClick={() => history.push(`/marketplace/${asteroid.id}/${Lot.toIndex(row.lotId)}/${resource.i}?back=all&mode=buy`)}
              tooltip="View Orderbook"
              data-tooltip-id="detailsTooltip">
              <MarketplaceBuildingIcon />
            </IconLink>
            }
            {row.supply === 0
              ? <Empty>None</Empty>
              : <Supply>{formatResourceAmount(row.supply, resource.i)}</Supply>
            }
          </>
        )
      },
      {
        key: 'sellPrice',
        label: 'Selling Price',
        sortField: 'sellPrice',
        selector: row => (
          <>
            {row.sellPrice === 0
              ? <Empty>—</Empty>
              : <><IconWrapper><SwayIcon /></IconWrapper> {formatPrice(row.sellPrice, { fixedPrecision: 4 })}</>
            }
          </>
        )
      },
      {
        key: 'demand',
        label: 'Demand',
        sortField: 'demand',
        selector: row => (
          <>
            {row.demand === 0 ||
            <IconLink
              style={{ marginRight: 6 }}
              onClick={() => history.push(`/marketplace/${asteroid.id}/${Lot.toIndex(row.lotId)}/${resource.i}?back=all&mode=sell`)}
              tooltip="View Orderbook"
              data-tooltip-id="detailsTooltip">
              <MarketplaceBuildingIcon />
            </IconLink>
            }
            {row.demand === 0
              ? <Empty>None</Empty>
              : <Demand>{formatResourceAmount(row.demand, resource.i)}</Demand>
            }
          </>
        )
      },
      {
        key: 'buyPrice',
        label: 'Buying Price',
        sortField: 'buyPrice',
        selector: row => (
          <>
          {row.buyPrice === 0
            ? <Empty>—</Empty>
            : <><IconWrapper><SwayIcon /></IconWrapper> {formatPrice(row.buyPrice, { fixedPrecision: 4 })}</>
          }
          </>
        )
      },
      {
        key: 'makerFee',
        label: 'Fees',
        sortField: 'makerFee',
        selector: row => (
          <>
            <span
              permissions={row.permissions}
              data-tooltip-id={"detailsTooltip"}
              data-tooltip-place="top"
              data-tooltip-html={`
                <div style="width: 200px">
                    <div style= "display: flex; height: 20px; margin-bottom: 2px; border-bottom:1px solid rgba(255, 255, 255, 0.25)">Maker Fees</div>
                    <div style="display: flex; margin-top: 4px">
                      <div style="color: #a0a0a0; flex-grow: 1">Limit Orders</div>
                      <div>${(row.makerFee / 100)}%</div>
                    </div>
                    <div style= "display: flex; height: 20px; margin-top: 8px; margin-bottom: 2px; border-bottom:1px solid rgba(255, 255, 255, 0.25)">Taker Fees</div>
                    <div style="display: flex; margin-top: 4px">
                      <div style="color: #a0a0a0; flex-grow: 1">Market Orders</div>
                      <div>${(row.takerFee / 100)}%</div>
                    </div>
                </div>
              `}>
            {row.makerFee === row.takerFee && row.makerFee === 0
              ? <Empty>None</Empty>
              : row.makerFee != row.takerFee
                ? <>{row.takerFee === 0
                  ? <>{(row.makerFee / 100)}% / 0%</>
                  : <>None / {(row.takerFee / 100)}%</>
                }</>
                : <>{(row.makerFee / 100)}%</>
            }
            </span>
          </>
        )
      },
      {
        key: 'permissions',
        label: 'permissions',
        skip: true
      },
    ];
    if (crew?._location?.asteroidId === asteroid.id) {
      c.splice(1, 0, ({
        key: 'distance',
        label: 'Distance to Crew',
        sortField: 'distance',
        selector: row => `${formatFixed(row.distance, 1)} km`,
      }))
    }
    return c;
  }, [asteroid, crew, marketplacesLoading, resource]);

  const getRowProps = useCallback((row) => {
    return {
      onClick: () => {
        setSelected(row.lotId);
      },
      isSelected: (selected === row.lotId)
    }
  }, [selected]);

  const onViewMarketplace = useCallback(() => {
    history.push(`/marketplace/${asteroid.id}/${Lot.toIndex(selected)}/${resource.i}?back=all`);
  }, [asteroid, resource, selected]);

  const [ totalSupply, totalDemand, medianPrice ] = useMemo(() => {
    let s = 0, d = 0, m = 0;

    const nonzeroCenterMarkets = (resourceMarketplaces || []).filter((n) => {
      s += n.supply;
      d += n.demand;

      return Number(n.centerPrice) !== 0;
    });

    if (nonzeroCenterMarkets.length > 0) {
      nonzeroCenterMarkets.sort((a, b) => a.centerPrice - b.centerPrice);
      if (nonzeroCenterMarkets.length % 2 === 1) {
        m = nonzeroCenterMarkets[(nonzeroCenterMarkets.length / 2) - 0.5].centerPrice;
      } else {
        m = (
          nonzeroCenterMarkets[(nonzeroCenterMarkets.length / 2) - 1].centerPrice
          + nonzeroCenterMarkets[(nonzeroCenterMarkets.length / 2)].centerPrice
        ) / 2;
      }
    }
    return [s, d, m];
  }, [resourceMarketplaces]);

  return (
    <>
      <Header resourceName={resource.name}>
        <div style={{ alignItems: 'center', display: 'flex', flexDirection: 'row' }}>
          <ResourceThumbnail resource={resource} size="240px" tooltipContainer={null} />
          <div style={{ flex: 1, paddingLeft: 25 }}>
            <h1>{resource.name}</h1>
            <Subheader>
              <span>{resource.classification}</span>
              <span>{resource.category}</span>
            </Subheader>
            <MarketSummary>
              <div>
                Listed at <b>{resourceMarketplaces.length} Marketplace{resourceMarketplaces.length === 1 ? '' : 's'}</b> on <b>{formatters.asteroidName(asteroid)}</b>
              </div>
              <div>
                Total Supply: <span style={{ color: theme.colors.green }}>{formatResourceAmount(totalSupply, resource.i)}</span>
              </div>
              <div>
                Total Demand: <span style={{ color: theme.colors.main }}>{formatResourceAmount(totalDemand, resource.i)}</span>
              </div>
            </MarketSummary>
            <MarketPrice>
              <label>Median Center Price:</label> <SwayIcon />{formatPrice(medianPrice, { fixedPrecision: 4 })}<label>/{resource.isAtomic ? 'unit' : 'kg'}</label>
            </MarketPrice>
          </div>
        </div>

        {selectedLot && (
          <SelectedMarketplace>
          <label>{formatters.buildingName(selectedLot.building)}</label>
            <div>
              {marketplaceOwner && <CrewIndicator crew={marketplaceOwner} flip label="Managed by" />}
              <MarketplaceImage>
                <img src={getBuildingIcon(8, 'w400')} alt="Marketplace" />
                <ClipCorner dimension={10} color="#333" />
              </MarketplaceImage>
            </div>
          </SelectedMarketplace>
        )}
      </Header>

      <Body>
        <TableContainer>
          <DataTable
            columns={columns}
            data={sortedMarketplaces || []}
            getRowProps={getRowProps}
            keyField="lotId"
            onClickColumn={handleSort}
            sortDirection={sortDirection}
            sortField={sortField}
          />
        </TableContainer>
      </Body>

      <PseudoFooterButton
        setRef={selected && coachmarkHelperProduct === resource?.i ? setCoachmarkRef(COACHMARK_IDS.asteroidMarketsHelper) : undefined}
        disabled={nativeBool(!selected)}
        onClick={onViewMarketplace}>
        Transact
      </PseudoFooterButton>
    </>
  );
};

export default AsteroidResourcePrices;
