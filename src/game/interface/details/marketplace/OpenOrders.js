import { useCallback, useMemo, useState } from 'react';
import styled from 'styled-components';
import moment from 'moment';
import { Lot, Order, Product } from '@influenceth/sdk';

import CrewIndicator from '~/components/CrewIndicator';
import DataTable from '~/components/DataTable';
import { CloseIcon, MarketplaceBuildingIcon, MarketsIcon, ProductIcon, SwayIcon } from '~/components/Icons';
import { formatPrice } from '~/lib/utils';
import theme from '~/theme';
import { LocationLink } from '../listViews/components';
import formatters from '~/lib/formatters';
import IconButton from '~/components/IconButton';
import useStore from '~/hooks/useStore';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';

const Subheader = styled.div``;
const Header = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  height: 150px;
  margin-bottom: 15px;
  margin-top: -25px;
  padding-bottom: 25px;
  padding-top: 25px;

  & > div:first-child {
    flex: 1;
    h1 {
      align-items: center;
      display: flex;
      font-size: 50px;
      font-weight: normal;
      line-height: 1em;
      margin: 0;
      text-transform: uppercase;
      svg {
        color: ${p => p.theme.colors.main};
        height: 1em;
        margin-right: 6px;
      }
    }
    ${Subheader} {
      color: #999;
      line-height: 1em;
      padding-left: 56px;
      padding-top: 15px;
      span:not(:first-child) {
        border-left: 1px solid #777;
        margin-left: 10px;
        padding-left: 10px;
      }
      b {
        color: white;
        font-weight: normal;
      }
    }
  }
`;

const Body = styled.div`
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
  border-top: 1px solid #333;
`;

const TableContainer = styled.div`
  flex: 1;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  thead th {
    background: rgba(0, 0, 0, 0.75);
  }
  tbody td {
    background: transparent;
  }
`;

const IconWrapper = styled.div`
  color: white;
  font-size: 22px;
  margin-right: 4px;
`;

const OrderType = styled.div`
  color: ${p => p.type === 'LimitBuy' ? theme.colors.green : theme.colors.main};
`;

const MarketplaceOpenOrders = ({ asteroid, orders, marketplace = null, marketplaceOwner = null }) => {
  const [sort, setSort] = useState(['createdAt', 'asc']);
  const [sortField, sortDirection] = sort;
  const onSetAction = useStore(s => s.dispatchActionDialog);
  const simulationEnabled = useSimulationEnabled();

  const onCancelOrder = useCallback((order) => {
    onSetAction('MARKETPLACE_ORDER', {
      exchange: order?.marketplace,
      asteroidId: asteroid?.id,
      lotId: order.lotId,
      mode: order.orderType === Order.IDS.LIMIT_BUY ? 'buy' : 'sell',
      type: 'limit',
      resourceId: order.product,
      isCancellation: true,
      cancellationInitialCaller: order.initialCaller,
      cancellationMakerFee: order.orderType === Order.IDS.LIMIT_BUY ? order.makerFee : undefined,
      preselect: {
        crew: order.crew,
        limitPrice: order.price,
        quantity: order.amount,
        storage: order.storage,
        storageSlot: order.storageSlot
      }
     });
  }, []);

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

  const sortedOrders = useMemo(() => {
    return (orders || [])
      .map((o) => ({
        ...o,
        lotId: o.marketplace?.Location?.location?.id,
        marketplaceName: formatters.buildingName(o.marketplace),
        resourceName: Product.TYPES[o.product]?.name,
        total: o.price * o.amount,
        ago: (new moment(new Date(1000 * (o.validTime || 0)))).fromNow()
      }))
      .sort((a, b) => (sortDirection === 'asc' ? 1 : -1) * (a[sortField] < b[sortField] ? 1 : -1));
  }, [orders, sortField, sortDirection]);

  const CancelButton = ({ row }) => {
    if (simulationEnabled) return <div />;
    if (row.validTime > (Date.now() / 1000)) return <div />;
    return (
      <IconButton
        borderless
        dataTip="Cancel Order"
        onClick={() => onCancelOrder(row)}
        style={{ marginRight: 0 }}
        themeColor="error">
        <CloseIcon />
      </IconButton>
    );
  }

  const columns = useMemo(() => {
    const c = [
      {
        key: 'orderType',
        label: 'Order Type',
        sortField: 'orderType',
        selector: row => (
          <>
            <CancelButton row={row} />
            {row.orderType === Order.IDS.LIMIT_BUY && <OrderType type="LimitBuy">Limit Buy</OrderType>}
            {row.orderType === Order.IDS.LIMIT_SELL && <OrderType type="LimitSell">Limit Sell</OrderType>}
          </>
        ),
      },
      {
        key: 'resourceName',
        label: 'Product',
        sortField: 'resourceName',
        selector: row => (
          <>
            <IconWrapper><ProductIcon /></IconWrapper>
            {row.resourceName}
          </>
        ),
      },
      {
        key: 'validTime',
        label: 'Placed',
        sortField: 'validTime',
        selector: row => <span style={row.validTime > Date.now() / 1e3 ? { color: theme.colors.warning } : {}}>{row.ago}</span>,
      },
      {
        key: 'amount',
        label: 'Quantity',
        sortField: 'amount',
        selector: row => (row.amount || 0).toLocaleString()
      },
      {
        key: 'price',
        label: 'Price',
        sortField: 'price',
        selector: row => (
          <>
            <IconWrapper><SwayIcon /></IconWrapper>
            {formatPrice(row.price, (
              row.price < 1 ? { fixedPrecision: 4 }
                : (
                  row.price < 10 ? { fixedPrecision: 6 } : undefined
                )
              )
            )}
          </>
        )
      },
      {
        key: 'total',
        label: 'Order Total',
        sortField: 'total',
        selector: row => (
          <>
            <IconWrapper><SwayIcon /></IconWrapper>
            {formatPrice(row.total, { fixedPrecision: 4 })}
          </>
        )
      },
      // TODO: ... would need to pre-load or pre-pop these in ES
      // {
      //   key: 'storage',
      //   label: 'Storage',
      //   sortField: 'storage',
      //   selector: row => (
      //     <>
      //       <LocationLink lotId={row.storage} />
      //       <span>Lot {Lot.toIndex(row.storage).toLocaleString()}</span>
      //     </>
      //   ),
      // },
      // {
      //   key: 'cancel',
      //   label: '',
      //   selector: row => {
      //     if (simulationEnabled) return <div />;
      //     if (row.validTime > (Date.now() / 1000)) return <div />;
      //     return (
      //       <IconButton
      //         borderless
      //         dataTip="Cancel Order"
      //         onClick={() => onCancelOrder(row)}
      //         themeColor="error">
      //         <CloseIcon />
      //       </IconButton>
      //     );
      //   }
      // },
    ];
    if (!marketplace) {
      c.unshift({
        key: 'marketplaceName',
        label: 'Marketplace',
        sortField: 'marketplaceName',
        selector: row => (
          <>
            <LocationLink lotId={row.lotId} zoomToLot />
            <span>{row.marketplaceName || `Marketplace at Lot #${Lot.toIndex(row.lotId).toLocaleString()}`}</span>
          </>
        )
      });
    }
    return c;
  }, [marketplace]);

  return (
    <>
      <Header>
        <div>
          {/* TODO: marketplace icon */}
          {marketplace && <h1><MarketplaceBuildingIcon /> {marketplace?.name || 'Marketplace'}</h1>}
          {!marketplace && <h1><MarketsIcon /> {formatters.asteroidName(asteroid)}</h1>}
          <Subheader>
            <span><b>{orders.length || 0}</b> Open Order{orders.length === 1 ? '' : 's'} {marketplace ? 'at this Marketplace' : 'on this Asteroid'}</span>
          </Subheader>
        </div>
        {marketplace && marketplaceOwner && <CrewIndicator crew={marketplaceOwner} flip label="Managed by" />}
      </Header>

      <Body>
        <TableContainer>
          <DataTable
            columns={columns}
            data={sortedOrders || []}
            keyField="validTime"
            onClickColumn={handleSort}
            sortDirection={sortDirection}
            sortField={sortField}
          />
        </TableContainer>
      </Body>
    </>
  );
};

export default MarketplaceOpenOrders;
