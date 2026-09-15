import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { Asteroid, Crewmate, Entity, Inventory, Lot, Permission, Product, Time } from '@influenceth/sdk';

import { CheckedIcon, ChevronRightIcon, MarketplaceBuildingIcon, MultiSellIcon, SwayIcon, UncheckedIcon } from '~/components/Icons';
import useCrewContext from '~/hooks/useCrewContext';
import theme from '~/theme';
import { reactBool, formatTimer, formatFixed, formatPrice, locationsArrToObj, getCrewAbilityBonuses, ordersToFills } from '~/lib/utils';

import { ActionDialogInner, useAsteroidAndLot } from '../ActionDialog';
import { ActionDialogFooter, ActionDialogHeader, FlexSection, ActionDialogBody, FlexSectionBlock, MarketplaceAlert, ShoppingListPriceField, LiquidityWarning, SectionTitle, Section } from './components';
import actionStage from '~/lib/actionStages';
import useDeliveryManager from '~/hooks/actionManagers/useDeliveryManager';
import formatters from '~/lib/formatters';
import DataTableComponent from '~/components/DataTable';
import useAsteroidBuildings from '~/hooks/useAsteroidBuildings';
import useShoppingListData from '~/hooks/useShoppingListData';
import { TOKEN, TOKEN_SCALE } from '~/lib/priceUtils';
import api from '~/lib/api';
import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useLot from '~/hooks/useLot';
import { useSwayBalance } from '~/hooks/useWalletTokenBalance';
import useStore from '~/hooks/useStore';
import ResourceRequirement from '~/components/ResourceRequirement';
import useInterval from '~/hooks/useInterval';
import PageLoader from '~/components/PageLoader';
import Monospace from '~/components/Monospace';
import UncontrolledTextInput from '~/components/TextInputUncontrolled';
import { CheckboxButton } from '~/components/filters/components';

const ProductList = styled.div`
  padding: 1px 0;
  width: 100%;
`;
const Basics = styled.div`
  flex: 1;
  margin-left: 15px;
  & > h4 {
    color: white;
    flex: 1;
    font-weight: normal;
    margin: 0;
  }
  & > div {
    overflow: hidden;
    max-height: ${p => p.hasSelected ? '2em' : 0};
    transition: max-height 350ms ease;
  }
`;
const Detail = styled.div`
  text-align: right;
  text-transform: uppercase;
  width: 90px;
`;
const ProductHeader = styled.div`
  align-items: center;
  color: #999;
  display: flex;
  flex-direction: row;
  padding: 10px;
`;
const ProductItem = styled.div`
  max-height: ${p => p.selected ? '350px' : '90px'};
  overflow: hidden;
  transition: max-height 350ms ease;

  &:not(:last-child) {
    border-bottom: 1px solid #222;
  }
  ${p => p.selected
    ? `
      background: rgba(${p.theme.colors.mainRGB}, 0.2);
      outline: 1px solid rgba(${p.theme.colors.mainRGB}, 0.5);
    `
    : `
      &:hover {
        background: rgba(${p.theme.colors.mainRGB}, 0.15);
      }
    `
  }
`;

const IconWrapper = styled.div`
  color: white;
  font-size: 22px;
  margin-right: 4px;
`;

const TABLE_TOP_MARGIN = 0;
const TABLE_BOTTOM_MARGIN = 10;
const TABLE_MAX_HEIGHT = 256;
const DataTableWrapper = styled.div`
  background: black;
  margin: ${TABLE_TOP_MARGIN}px 10px ${TABLE_BOTTOM_MARGIN}px;
  max-height: ${TABLE_MAX_HEIGHT}px;
  overflow: auto;
  & > table {
    width: 100%;
  }
`;
const EmptyMessage = styled(DataTableWrapper)`
  color: #AAA;
  padding: 10px;
  text-align: center;
  & > b {
    color: white;
    font-weight: normal;
    white-space: nowrap;
  }
`;

const Insufficient = styled.div`
  font-size: 75%;
  cursor: ${p => p.theme.cursors.active};
  color: ${p => p.theme.colors.brightMain};
  opacity: ${p => p.visible ? 1 : 0};
  padding-right: 5px;
  text-transform: uppercase;
  transition: opacity 150ms ease;
  &:hover {
    opacity: 0.8;
  }
`;

const PromptToSelectRecipe = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  padding: 0 8px;
`;

const ExpandableIcon = styled(ChevronRightIcon)`
  color: white;
  font-size: 150%;
  margin-left: 8px;
  transform: rotate(0);
  transition: transform 250ms ease;
  ${p => p.isExpanded && `transform: rotate(90deg);`}
`;

const CheckboxLabel = styled.label`
  align-items: center;
  color: ${p => p.selected ? 'white' : '#AAA'};
  cursor: ${p => p.theme.cursors.active};
  display: inline-flex;
  opacity: 0.8;
  transition: opacity 150ms ease;
  &:hover {
    opacity: 1;
  }

  & > *:first-child {
    color: ${p => p.selected ? p.theme.colors.brightMain : 'inherit'};
    margin-right: 4px;
    transition: color 150ms ease;
  }
`;

const columns = [
  {
    key: 'selector',
    label: <MarketplaceBuildingIcon />,
    selector: (row, { isSelected }) => (
      <span style={{ fontSize: '120%', lineHeight: '0' }}>
        {isSelected ? <CheckedIcon style={{ color: theme.colors.brightMain }} /> : <UncheckedIcon />}
      </span>
    ),
    align: 'center',
    isIconColumn: true,
    noMinWidth: true,
  },
  {
    key: 'marketplaceName',
    label: 'Marketplace',
    selector: (row, { tableState }) => (
      <span>{formatters.buildingName(row.marketplace || {})}</span>
    ),
    noMinWidth: true,
  },
  {
    key: 'distance',
    label: 'Distance',
    sortField: 'distance',
    alignBody: 'right',
    selector: row => <Monospace>{formatFixed(row.distance, 1, 1)} km</Monospace>,
    noMinWidth: true,
  },
  {
    key: 'price',
    label: 'Price (incl. fees)',
    sortField: '_dynamicUnitPrice',
    selector: (row, { tableState }) => (
      <ShoppingListPriceField>
        <div>
          <IconWrapper><SwayIcon /></IconWrapper>
          <div>{formatPrice(row._dynamicUnitPrice, { fixedPrecision: 4, minPrecision: 4 })}</div>
        </div>
        <small>({row._dynamicDemand.toLocaleString()}{tableState.resource.isAtomic ? '' : ' kg'})</small>
        {row._isLimited && <LiquidityWarning />}
      </ShoppingListPriceField>
    ),
    noMinWidth: true,
  }
];

export const ProductMarketSummary = ({
  crewBonuses,
  onSelected,
  productId,
  resourceMarketplaces = [],
  selected = [],
  selectionSummary,
  targetAmount
}) => {
  const [sort, setSort] = useState(['_dynamicUnitPrice', 'asc']);
  const [sortField, sortDirection] = sort;

  const getRowProps = useCallback((row) => ({
    onClick: () => {
      onSelected(row.buildingId);
    },
    selectedColorRGB: `128, 128, 128`,
    isSelected: selected.includes(row.buildingId),
    tableState: { resource: Product.TYPES[productId] }
  }), [onSelected, productId, selected]);

  // NOTE: this augments resourceMarketplaces, but updates less often
  const dynamicMarketplaces = useMemo(() => {
    return Object.values(resourceMarketplaces).map((m) => {
      const row = { ...m };
      const remainingToSource = selectionSummary.needed || targetAmount;
      row._dynamicDemand = Math.min(row.demand, selectionSummary.amounts[m.buildingId] || remainingToSource);
      row._isLimited = row.demand < remainingToSource;

      let marketFills = ordersToFills(
        'sell',
        row.orders,
        row._dynamicDemand,
        row.marketplace?.Exchange?.takerFee || 0,
        crewBonuses?.feeReduction?.totalBonus || 1,
        row.feeEnforcement || 1,
      );

      let total = marketFills.reduce((acc, cur) => acc + cur.paymentsUnscaled.toPlayer, 0) / TOKEN_SCALE[TOKEN.SWAY];
      row._dynamicTotalPrice = total;
      row._dynamicUnitPrice = total / row._dynamicDemand;
      row._fills = marketFills;
      return row;
    });
  }, [resourceMarketplaces, selectionSummary, targetAmount]);

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
    return (dynamicMarketplaces || [])
      .sort((a, b) => (sortDirection === 'asc' ? 1 : -1) * (a[sortField] < b[sortField] ? 1 : -1));
  }, [dynamicMarketplaces, sortField, sortDirection]);

  return (
    <DataTableWrapper>
      <DataTableComponent
        columns={columns}
        data={sortedMarketplaces || []}
        getRowProps={getRowProps}
        keyField="lotId"
        onClickColumn={handleSort}
        sortDirection={sortDirection}
        sortField={sortField}
      />
    </DataTableWrapper>
  );
};

const SellingList = ({ asteroid, origin, originSlot, initialSelection, preselect, stage, ...props }) => {
  const { execute } = useContext(ChainTransactionContext);
  const { crew, pendingTransactions } = useCrewContext();

  const [openProductId, setOpenProductId] = useState();
  const [selected, setSelected] = useState(initialSelection || {});

  const { data: exchanges, dataUpdatedAt: exchangesUpdatedAt } = useAsteroidBuildings(asteroid?.id, 'Exchange', Permission.IDS.SELL);
  const exchangesById = useMemo(() => {
    return (exchanges || []).reduce((acc, cur) => {
      acc[cur.id] = cur;
      return acc;
    }, {});
  }, [exchangesUpdatedAt])
  const { data: originLot } = useLot(locationsArrToObj(origin?.Location?.locations || []).lotId);
  useMemo(() => origin?.Inventories.find((i) => i.slot === originSlot), [origin, originSlot]);

  const [targets] = useState(Object.keys(preselect?.selectedItems || {}).map((k) => ({ productId: k, amount: preselect.selectedItems[k] })));

  // derive shopping list from selected site
  const [sellingList, productIds] = useMemo(() => {
    const list = targets.map(({ productId, amount }) => ({ product: Product.TYPES[productId], amount }));
    return [list, list.map((p) => p.product.i)];
  }, [targets]);

  const {
    data: resourceMarketplaces,
    dataUpdatedAt: resourceMarketplacesUpdatedAt,
    isLoading: resourceMarketplacesLoading,
    refetch: refetchResourceMarketplaces
  } = useShoppingListData(asteroid?.id, originLot?.id, productIds, 'sell');

  useInterval(() => { refetchResourceMarketplaces(); }, 60e3); // keep things loosely fresh

  // crew bonuses related to market buys and transport
  const crewBonuses = useMemo(() => {
    if (!crew) return {};

    const abilities = getCrewAbilityBonuses([
      Crewmate.ABILITY_IDS.HOPPER_TRANSPORT_TIME,
      Crewmate.ABILITY_IDS.FREE_TRANSPORT_DISTANCE,
      Crewmate.ABILITY_IDS.MARKETPLACE_FEE_REDUCTION,
    ], crew);
    return {
      hopperTransport: abilities[Crewmate.ABILITY_IDS.HOPPER_TRANSPORT_TIME],
      freeTransport: abilities[Crewmate.ABILITY_IDS.FREE_TRANSPORT_DISTANCE],
      feeReduction: abilities[Crewmate.ABILITY_IDS.MARKETPLACE_FEE_REDUCTION],
    }
  }, [crew]);

  const selectionSummary = useMemo(() => {
    return productIds.reduce((acc, productId) => {
      const targetAmount = sellingList.find((l) => l.product.i === productId)?.amount || 0;

      let needed = targetAmount;
      let totalPrice = 0;
      let maxTravelTime = 0;
      const allFills = [];
      const selectedAmounts = {};
      (selected[productId] || [])
        // TODO: should we index resourceMarketplaces by buildingId to simplify this?
        .map((buildingId) => resourceMarketplaces[productId].find((m) => m.buildingId === buildingId))
        .sort((a, b) => a.demand - b.demand)
        .forEach((row) => {
          selectedAmounts[row.buildingId] = 0;
          maxTravelTime = Math.max(
            maxTravelTime,
            Time.toRealDuration(
              Asteroid.getLotTravelTime(
                asteroid?.id, Lot.toIndex(originLot?.id), Lot.toIndex(row.lotId), crewBonuses?.hopperTransport.totalBonus, crewBonuses?.freeTransport.totalBonus
              ),
              crew?._timeAcceleration
            )
          );

          const fills = ordersToFills(
            'sell',
            row.orders,
            needed,
            row.marketplace?.Exchange?.takerFee || 0,
            crewBonuses?.feeReduction?.totalBonus || 1,
            row.feeEnforcement || 1,
          );

          fills.forEach((fill) => {
            selectedAmounts[row.buildingId] += fill.fillAmount;
            needed -= fill.fillAmount;
            totalPrice += fill.paymentsUnscaled.toPlayer;
          });

          allFills.push(...fills);
        });

      acc[productId] = {
        needed,
        maxTravelTime,
        totalPrice: totalPrice / TOKEN_SCALE[TOKEN.SWAY],
        totalFilled: targetAmount - needed,
        fills: allFills,
        amounts: selectedAmounts
      };
      return acc;
    }, {});
  }, [asteroid?.id, crew?._timeAcceleration, crewBonuses, originLot?.id, selected, sellingList]);

  const { totalPrice, exchangeTally, allFills } = useMemo(() => {
    return Object.keys(selectionSummary).reduce((acc, k) => {
      const s = selectionSummary[k];
      return {
        totalPrice: acc.totalPrice + (s.totalPrice || 0),
        totalMass: acc.totalMass + (s.totalFilled || 0) * Product.TYPES[k].massPerUnit,
        totalVolume: acc.totalVolume + (s.totalFilled || 0) * Product.TYPES[k].volumePerUnit,
        exchangeTally: acc.exchangeTally + Object.keys(s.amounts)?.length,
        allFills: [...acc.allFills, ...s.fills],
      };
    }, {
      totalPrice: 0,
      totalMass: 0,
      totalVolume: 0,
      exchangeTally: 0,
      allFills: []
    });
  }, [selectionSummary]);

  const handleSelected = useCallback((productId) => (buildingId) => {
    setSelected((old) => {
      const s = { ...old };
      if (!s[productId]) s[productId] = [];

      if (s[productId].includes(buildingId)) {
        s[productId] = s[productId].filter((b) => b !== buildingId);

      // if already filled, clear all --> select this one
      } else if (selectionSummary[productId].needed === 0) {
        s[productId] = [buildingId];

      // else, add this one
      } else {
        s[productId] = [...s[productId], buildingId];
      }

      return s;
    });
  }, [selectionSummary]);

  useEffect(() => {
    Object.keys(selected || {}).forEach((productId) => {
      selected[productId].forEach((buildingId) => {
        // deselect building if no longer available due to change in market conditions
        if (!resourceMarketplaces?.[productId]?.find((m) => buildingId === m.marketplace.id)) {
          setSelected((old) => {
            const s = { ...old };
            if (!s[productId]) s[productId] = [];
            s[productId] = s[productId].filter((b) => b !== buildingId);
            return s;
          })
        }
      });
    });
  }, [resourceMarketplacesUpdatedAt, selected])

  const [selling, setSelling] = useState();
  const handleSell = useCallback(async () => {
    // TODO: do syncronous refetch and return if significant change (i.e. > 2% change in price or anything that was satisfied is now unsatisfied)
    setSelling(true);
    try {
      // load all buyerCrews and exchangeControllerCrews
      // TODO: technically, can skip loading exchangeControllerCrews if fees 0?
      // TODO: in an upcoming update, crew.delegatedBy may be returned on the exchanges...
      //  should update to skip redundantly fetching of the controller crew here
      const allCrewIds = allFills.reduce((acc, fill) => {
        if (fill.crew?.id) acc.add(fill.crew?.id);

        const exchangeControllerId = exchangesById[fill.entity.id]?.Control?.controller?.id;
        if (exchangeControllerId) acc.add(exchangeControllerId);
        return acc;
      }, new Set());

      const crews = await api.getEntities({ ids: Array.from(allCrewIds), label: Entity.IDS.CREW, component: 'Crew' });

      await execute(
        'EscrowWithdrawalAndFillBuyOrders',
        allFills.map((fill) => {
          const exchangeControllerId = exchangesById[fill.entity.id]?.Control?.controller?.id;
          return {
            depositCaller: fill.initialCaller,
            seller_account: crew?.Crew?.delegatedTo,
            exchange_owner_account: crews.find((c) => c.id === exchangeControllerId)?.Crew?.delegatedTo,
            makerFee: fill.makerFee,// ? / Order.FEE_SCALE,
            payments: fill.paymentsUnscaled,
            origin: { id: origin?.id, label: origin?.label },
            origin_slot: originSlot,
            product: fill.product,
            amount: fill.fillAmount,
            buyer_crew: { id: fill.crew?.id, label: fill.crew?.label },
            price: Math.round(fill.price * TOKEN_SCALE[TOKEN.SWAY]),
            storage: { id: fill.storage?.id, label: fill.storage?.label },
            storage_slot: fill.storageSlot,
            exchange: { id: fill.entity.id, label: fill.entity.label },
            caller_crew: { id: crew?.id, label: crew?.label }
          };
        }),
        {
          originLotId: originLot?.id,
        },
      );

    } catch (e) {
      console.error(e);

    } finally {
      setTimeout(() => {
        setSelling(false);
      }, 1000);
    }

  }, [allFills, crew?.id, origin, originLot?.id, originSlot, exchangesUpdatedAt, execute]);

  const handleProductClick = useCallback((productId) => () => {
    setOpenProductId((p) => p === productId ? null : productId);
  }, []);

  const sellingListSaleTally = useMemo(() => {
    return (pendingTransactions || []).filter((tx) => tx.key === 'EscrowWithdrawalAndFillBuyOrders' && tx.meta?.originLotId === originLot?.id);
  }, [originLot?.id, pendingTransactions]);

  // if sellingListSaleTally on this lot changes while in `selling` mode, close dialog
  useEffect(() => {
    if (selling && props.onClose) {
      props.onClose();
    }
  }, [sellingListSaleTally]);

  return (
    <>
      <ActionDialogHeader
        action={{
          icon: <MultiSellIcon />,
          label: 'Market Sell Multiple',
        }}
        actionCrew={crew}
        location={{ asteroid, lot: originLot }}
        onClose={props.onClose}
        stage={stage} />

      <ActionDialogBody style={{ display: 'flex', flexDirection: 'column' }}>

        <Section><SectionTitle>Sell Items</SectionTitle></Section>
        
        <FlexSection style={{ flex: '1 1 calc(100% - 105px)', flexDirection: 'column', marginTop: 0, overflow: 'auto' }}>
          {resourceMarketplacesLoading && !resourceMarketplaces && <PageLoader />}
          {resourceMarketplaces && (
            <ProductList>
              {/* TODO: add to list */}
              {sellingList.map(({ product, amount }) => {
                const hasSelected = selectionSummary[product.i]?.totalFilled > 0;
                const selectedMarkets = Object.keys(selectionSummary[product.i]?.amounts || {});
                return (
                  <ProductItem
                    key={product.i}
                    selected={openProductId === product.i}>
                    <ProductHeader onClick={handleProductClick(product.i)}>
                      <ResourceRequirement
                        isOutgoing
                        item={{ numerator: selectionSummary[product.i]?.totalFilled, denominator: amount }}
                        resource={product}
                        size="70px"
                        tooltipContainer="actionDialogTooltip" />

                      <Basics hasSelected={hasSelected}>
                        <h4>{product.name}</h4>
                        <div>
                          {selectedMarkets.length === 1 && `To ${formatters.buildingName(exchangesById[selectedMarkets[0]])}`}
                          {selectedMarkets.length > 1 && `To ${selectedMarkets.length} Marketplaces`}
                        </div>
                      </Basics>
                      {hasSelected
                        ? (
                          <>
                            <Detail>
                              {selectionSummary[product.i]?.maxTravelTime > 0
                                ? formatTimer(selectionSummary[product.i]?.maxTravelTime, 2)
                                : <span style={{ opacity: 0.5 }}>Instant</span>
                              }
                            </Detail>
                            <Detail style={{ color: 'white', whiteSpace: 'nowrap' }}>
                              <SwayIcon /> {Math.round(selectionSummary[product.i]?.totalPrice || 0).toLocaleString()}
                            </Detail>
                          </>
                        )
                        : (
                          <Detail style={{ width: 'auto', ...(resourceMarketplaces?.[product.i]?.length ? {} : { color: theme.colors.error }) }}>
                            {resourceMarketplaces?.[product.i]?.length || 0} Marketplace{resourceMarketplaces?.[product.i]?.length === 1 ? '' : 's'}
                          </Detail>
                        )
                      }
                      <ExpandableIcon isExpanded={openProductId === product.i} />
                      {/*
                      <div>{formatResourceAmount(selectionSummary[product.i]?.totalFilled || 0, product.i)} filled of {formatResourceAmount(amount, product.i)}</div>
                      <div>@ <SwayIcon /> <span>{formatPrice(selectionSummary[product.i]?.totalPrice / selectionSummary[product.i]?.totalFilled, { fixedPrecision: 4 })}</span></div>
                      */}
                    </ProductHeader>

                    {openProductId === product.i
                      ? (
                        resourceMarketplaces?.[product.i]?.length
                          ? (
                            <ProductMarketSummary
                              asteroidId={asteroid?.id}
                              crewBonuses={crewBonuses}
                              lotId={originLot?.id}
                              productId={product.i}
                              selected={selected[product.i]}
                              selectionSummary={selectionSummary[product.i]}
                              onSelected={handleSelected(product.i)}
                              resourceMarketplaces={resourceMarketplaces?.[product.i]}
                              targetAmount={amount} />
                          )
                          : (
                            <EmptyMessage>
                              There are currently no accessible marketplaces on <b>{asteroid?.Name?.name}</b><br/>
                              with available demand for <b>{product.name}</b>.
                            </EmptyMessage>
                          )
                      )
                      : /* TODO: use some constants so this is more upkeepable */ (
                        <div style={{ height: TABLE_TOP_MARGIN + TABLE_BOTTOM_MARGIN + Math.min(TABLE_MAX_HEIGHT, 40 * (1 + (resourceMarketplaces?.[product.i]?.length || 0))) }} />
                      )
                    }
                  </ProductItem>
                );
              })}
            </ProductList>
          )}
        </FlexSection>

        <FlexSection style={{ flex: '0 0 105px' }}>
          <FlexSectionBlock
            title="Orders Total"
            bodyStyle={{ height: 'auto', padding: 0 }}
            style={{ width: '100%', marginTop: 10 }}>
            <MarketplaceAlert scheme={totalPrice === 0 ? 'empty' : 'success'}>
              <div>
                <div>
                  <label>Market Sell</label>
                  <div style={{ fontSize: '100%' }}><b>{exchangeTally || 0} Order{exchangeTally === 1 ? '' : 's'}</b></div>
                </div>
                <div>
                  <label>Total</label>
                  <span>
                    <SwayIcon /> {totalPrice > 0.5 ? '+' : ''}{formatFixed(totalPrice || 0)}
                  </span>
                </div>
              </div>
            </MarketplaceAlert>
          </FlexSectionBlock>
        </FlexSection>
      </ActionDialogBody>

      <ActionDialogFooter
        disabled={!(allFills?.length > 0)}
        goLabel="Sell Items"
        onGo={handleSell}
        stage={stage}
        {...props} />

      {stage === actionStage.NOT_STARTED && (
        <>
          {/* TODO: inventory selection */}
        </>
      )}
    </>
  );
};

const Wrapper = (props) => {
  const { asteroid, lot, isLoading } = useAsteroidAndLot(props);
  const actionManager = { actionStage: actionStage.NOT_STARTED };

  const [origin, originSlot] = useMemo(() => {
    const origin = props.origin || lot?.building;
    const originSlot = props.originSlot || origin?.Inventories.find((i) => i.status === Inventory.STATUSES.AVAILABLE)?.slot;
    return [origin, originSlot];
  }, [lot?.building, props.origin, props.originSlot]);

  useEffect(() => {
    if (!asteroid || !lot || !origin || !originSlot) {
      if (!isLoading) {
        if (props.onClose) props.onClose();
      }
    }
  }, [asteroid, lot, origin, originSlot, isLoading]);

  return (
    <ActionDialogInner
      actionImage="Marketplace"
      isLoading={reactBool(isLoading)}
      stage={actionManager.actionStage}>
      <SellingList
        asteroid={asteroid}
        origin={origin}
        originSlot={originSlot}
        actionManager={actionManager}
        stage={actionManager.actionStage}
        {...props} />
    </ActionDialogInner>
  )
};

export default Wrapper;
