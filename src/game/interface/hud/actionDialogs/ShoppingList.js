import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { Asteroid, Building, Crewmate, Entity, Inventory, Lot, Permission, Process, Product, Time } from '@influenceth/sdk';

import {
  CheckedIcon,
  ChevronRightIcon,
  InventoryIcon,
  MultiBuyIcon,
  MarketplaceBuildingIcon,
  SwayIcon,
  UncheckedIcon,
  WarningIcon,
  WarningOutlineIcon
} from '~/components/Icons';
import useCrewContext from '~/hooks/useCrewContext';
import theme from '~/theme';
import { reactBool, formatTimer, formatFixed, formatPrice, locationsArrToObj, getCrewAbilityBonuses, ordersToFills } from '~/lib/utils';

import { ActionDialogInner, useAsteroidAndLot } from '../ActionDialog';
import {
  ActionDialogFooter,
  ActionDialogHeader,
  FlexSection,
  ActionDialogBody,
  FlexSectionBlock,
  MarketplaceAlert,
  ShoppingListPriceField,
  LiquidityWarning,
  getRecipeRequirements,
  ProcessSelectionBlock,
  ProcessSelectionDialog,
  SectionTitle,
  Section,
  EmptyResourceImage,
  SectionTitleRight,
  formatTimeRequirements
} from './components';
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
        <small>({row._dynamicSupply.toLocaleString()}{tableState.resource.isAtomic ? '' : ' kg'})</small>
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
  const [sort, setSort] = useState(['_dynamicUnitPrice', 'desc']);
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
      row._dynamicSupply = Math.min(row.supply, selectionSummary.amounts[m.buildingId] || remainingToSource);
      row._isLimited = row.supply < remainingToSource;

      let marketFills = ordersToFills(
        'buy',
        row.orders,
        row._dynamicSupply,
        row.marketplace?.Exchange?.takerFee || 0,
        crewBonuses?.feeReduction?.totalBonus || 1,
        row.feeEnforcement || 1,
      );

      let total = marketFills.reduce((acc, cur) => acc + cur.fillPaymentTotal, 0) / TOKEN_SCALE[TOKEN.SWAY];
      row._dynamicTotalPrice = total;
      row._dynamicUnitPrice = total / row._dynamicSupply;
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

const ShoppingList = ({ asteroid, destination, destinationSlot, stage, ...props }) => {
  const { execute } = useContext(ChainTransactionContext);
  const { crew, pendingTransactions } = useCrewContext();
  const { data: swayBalance } = useSwayBalance();

  const dispatchLauncherPage = useStore(s => s.dispatchLauncherPage);

  const [openProductId, setOpenProductId] = useState();
  const [selected, setSelected] = useState({});

  const { data: exchanges, dataUpdatedAt: exchangesUpdatedAt } = useAsteroidBuildings(asteroid?.id, 'Exchange', Permission.IDS.BUY);
  const exchangesById = useMemo(() => {
    return (exchanges || []).reduce((acc, cur) => {
      acc[cur.id] = cur;
      return acc;
    }, {});
  }, [exchangesUpdatedAt])
  const { data: destinationLot } = useLot(locationsArrToObj(destination?.Location?.locations || []).lotId);
  const destinationInventory = useMemo(() => destination?.Inventories.find((i) => i.slot === destinationSlot), [destination, destinationSlot]);

  const { currentDeliveryActions } = useDeliveryManager({ destination, destinationSlot });

  const [processId, setProcessId] = useState();
  const [processSelectorOpen, setProcessSelectorOpen] = useState(false);
  const recipe = useMemo(() => Process.TYPES[processId], [processId]);
  const [recipeTally, setRecipeTally] = useState(1);
  const [isAdditive, setIsAdditive] = useState(false);

  const isInSiteMode = destination?.Building?.status === Building.CONSTRUCTION_STATUSES.PLANNED;
  useEffect(() => {
    if (isInSiteMode && destination?.Building?.buildingType) {
      const constructionProcessId = Object.values(Process.IDS).find((id) => Process.TYPES[id].name === `${Building.TYPES[destination.Building.buildingType].name} Construction`);
      if (constructionProcessId) {
        setProcessId(constructionProcessId);
        setIsAdditive(true);
      }
      else if (destination) {
        console.warn('No construction process found for building type', destination.Building.buildingType);
        if (props.onClose) props.onClose();
      }
    }
  }, [isInSiteMode, destination?.Building, props.onClose])

  // derive targets from selected recipe
  const totalTargets = useMemo(() => {
    if (!recipe) return [];
    return getRecipeRequirements(recipe.inputs, destinationInventory, recipeTally, currentDeliveryActions);
  }, [currentDeliveryActions, destinationInventory, recipe, recipeTally]);

  // convert targets into shopping list
  const [shoppingList, productIds] = useMemo(() => {
    const list = totalTargets
      .filter((req) => (isAdditive ? req.inNeed : req.totalRequired) > 0)
      .map((req) => ({
        product: Product.TYPES[req.i],
        amount: isAdditive ? req.inNeed : req.totalRequired
      }));
    return [list, list.map((p) => p.product.i)];
  }, [isAdditive, totalTargets]);

  const {
    data: resourceMarketplaces,
    dataUpdatedAt: resourceMarketplacesUpdatedAt,
    isLoading: resourceMarketplacesLoading,
    refetch: refetchResourceMarketplaces
  } = useShoppingListData(asteroid?.id, destinationLot?.id, productIds);

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
      const targetAmount = shoppingList.find((l) => l.product.i === productId)?.amount || 0;

      let needed = targetAmount;
      let totalPrice = 0;
      let maxTravelTime = 0;
      const allFills = [];
      const selectedAmounts = {};
      (selected[productId] || [])
        // TODO: should we index resourceMarketplaces by buildingId to simplify this?
        .map((buildingId) => resourceMarketplaces[productId].find((m) => m.buildingId === buildingId))
        .sort((a, b) => a.supply - b.supply)
        .forEach((row) => {
          selectedAmounts[row.buildingId] = 0;
          maxTravelTime = Math.max(
            maxTravelTime,
            Time.toRealDuration(
              Asteroid.getLotTravelTime(
                asteroid?.id, Lot.toIndex(row.lotId), Lot.toIndex(destinationLot?.id), crewBonuses?.hopperTransport.totalBonus, crewBonuses?.freeTransport.totalBonus
              ),
              crew?._timeAcceleration
            )
          );

          const fills = ordersToFills(
            'buy',
            row.orders,
            needed,
            row.marketplace?.Exchange?.takerFee || 0,
            crewBonuses?.feeReduction?.totalBonus || 1,
            row.feeEnforcement || 1,
          );

          fills.forEach((fill) => {
            selectedAmounts[row.buildingId] += fill.fillAmount;
            needed -= fill.fillAmount;
            totalPrice += fill.fillPaymentTotal;
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
  }, [asteroid?.id, crew?._timeAcceleration, crewBonuses, destinationLot?.id, selected, shoppingList]);

  const { totalPrice, totalMass, totalVolume, taskTimeTotal, exchangeTally, allFills } = useMemo(() => {
    return Object.keys(selectionSummary).reduce((acc, k) => {
      const s = selectionSummary[k];
      return {
        totalPrice: acc.totalPrice + (s.totalPrice || 0),
        totalMass: acc.totalMass + (s.totalFilled || 0) * Product.TYPES[k].massPerUnit,
        totalVolume: acc.totalVolume + (s.totalFilled || 0) * Product.TYPES[k].volumePerUnit,
        taskTimeTotal: Math.max(acc.taskTimeTotal, s.maxTravelTime),
        exchangeTally: acc.exchangeTally + Object.keys(s.amounts)?.length,
        allFills: [...acc.allFills, ...s.fills],
      };
    }, {
      totalPrice: 0,
      totalMass: 0,
      totalVolume: 0,
      taskTimeTotal: 0,
      exchangeTally: 0,
      allFills: []
    });
  }, [selectionSummary]);

  const taskTimeRequirement = useMemo(() => formatTimeRequirements(taskTimeTotal), [taskTimeTotal]);

  const insufficientSway = useMemo(() => totalPrice * TOKEN_SCALE[TOKEN.SWAY] > swayBalance, [totalPrice, swayBalance]);

  const invConfig = useMemo(() => {
    if (destinationInventory) {
      return Inventory.getType(destinationInventory.inventoryType, crew?._inventoryBonuses);
    }
    return null;
  }, [destinationInventory, crew?._inventoryBonuses]);

  const [targetMass, targetVolume] = useMemo(() => {
    return shoppingList.reduce((acc, { product, amount }) => {
      acc[0] += amount * product.massPerUnit;
      acc[1] += amount * product.volumePerUnit;
      return acc;
    }, [0, 0]);
  }, [shoppingList]);

  const insufficientCapacity = useMemo(() => {
    const massConstraint = invConfig?.massConstraint - (destinationInventory?.mass + destinationInventory?.reservedMass);
    const volumeConstraint = invConfig?.volumeConstraint - (destinationInventory?.volume + destinationInventory?.reservedVolume);

    if (totalMass > massConstraint || totalVolume > volumeConstraint) return 'error';
    if (targetMass > massConstraint || targetVolume > volumeConstraint) return 'warning';
    return null;
  }, [
    destinationInventory,
    invConfig,
    targetMass,
    targetVolume,
    totalMass,
    totalVolume
  ]);

  const inventoryConstrained = useMemo(() => {
    if (invConfig?.productConstraints) {
      const allowed = Object.keys(invConfig.productConstraints);
      if (Object.keys(selectionSummary).find((k) => selectionSummary[k].totalFilled > 0 && !allowed.includes(k))) return 'error';
      if (shoppingList.find(({ product }) => !allowed.includes(String(product.i)))) return 'warning';
    }
    return null;
  }, [
    invConfig,
    targetMass,
    targetVolume,
    totalMass,
    totalVolume
  ]);

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

  const [purchasing, setPurchasing] = useState();
  const handlePurchase = useCallback(async () => {
    // TODO: do syncronous refetch and return if significant change (i.e. > 2% change in price or anything that was satisfied is now unsatisfied)
    setPurchasing(true);
    try {
      // load all sellerCrews and exchangeControllerCrews
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

      // TODO: could move this all into useMarketplaceManager but would have to rework it the manager some
      await execute(
        'BulkFillSellOrder',
        allFills.map((fill) => {
          const exchangeControllerId = exchangesById[fill.entity.id]?.Control?.controller?.id;
          return {
            seller_account: crews.find((c) => c.id === fill.crew?.id)?.Crew?.delegatedTo,
            exchange_owner_account: crews.find((c) => c.id === exchangeControllerId)?.Crew?.delegatedTo,
            takerFee: fill.takerFee,
            payments: fill.paymentsUnscaled,

            seller_crew: { id: fill.crew?.id, label: fill.crew?.label },
            amount: fill.fillAmount,
            price: fill.price * TOKEN_SCALE[TOKEN.SWAY],
            storage: { id: fill.storage?.id, label: fill.storage?.label },
            storage_slot: fill.storageSlot,

            product: fill.product,
            destination: { id: destination?.id, label: destination?.label },
            destination_slot: destinationSlot,

            exchange: { id: fill.entity.id, label: fill.entity.label },
            caller_crew: { id: crew?.id, label: crew?.label }
          };
        }),
        {
          destinationLotId: destinationLot?.id,
        },
      );

    } catch (e) {
      console.error(e);

    } finally {
      setTimeout(() => {
        setPurchasing(false);
      }, 1000);
    }

  }, [allFills, crew?.id, destination, destinationLot?.id, destinationSlot, exchangesUpdatedAt, execute]);

  const handleProductClick = useCallback((productId) => () => {
    setOpenProductId((p) => p === productId ? null : productId);
  }, []);

  const goToSwayStore = useCallback(() => {
    dispatchLauncherPage('store', 'sway');
  }, []);

  const shoppingListPurchaseTally = useMemo(() => {
    return (pendingTransactions || []).filter((tx) => tx.key === 'BulkFillSellOrder' && tx.meta?.destinationLotId === destinationLot?.id);
  }, [destinationLot?.id, pendingTransactions]);

  // if shoppingListPurchaseTally on this lot changes while in `purchasing` mode, close dialog
  useEffect(() => {
    if (purchasing && props.onClose) {
      props.onClose();
    }
  }, [shoppingListPurchaseTally]);

  return (
    <>
      <ActionDialogHeader
        action={{
          icon: <MultiBuyIcon />,
          label: isInSiteMode ? 'Source Materials' : 'Market Buy Multiple',
          status: isInSiteMode && stage === actionStage.NOT_STARTED ? 'Source Remaining Materials' : undefined,
        }}
        actionCrew={crew}
        location={{ asteroid, lot: destinationLot }}
        taskCompleteTime={taskTimeRequirement}
        onClose={props.onClose}
        stage={stage} />

      <ActionDialogBody style={{ display: 'flex', flexDirection: 'column' }}>

        {!isInSiteMode && (
          <FlexSection>
            <FlexSectionBlock title="Recipe" bodyStyle={{ alignItems: 'center', display: 'flex', flexDirection: 'row', height: 'auto',  }} style={{ width: '100%' }}>
              <div style={{ alignItems: 'center', display: 'flex' }}>
                <UncontrolledTextInput
                  disabled={stage !== actionStage.NOT_STARTED}
                  onChange={(e) => setRecipeTally(e.currentTarget.value)}
                  step={0.1}
                  max={1e6}
                  min={1}
                  type="number"
                  style={{ textAlign: 'right', height: 40, width: 80 }}
                  value={recipeTally} />
              </div>
              <div style={{ textAlign: 'center', width: 24 }}>x</div>
              <div>
                <ProcessSelectionBlock
                  height={40}
                  width={350}
                  onClick={stage === actionStage.NOT_STARTED ? () => setProcessSelectorOpen(true) : undefined}
                  selectedProcess={recipe} />
              </div>
              <div style={{ flex: 1, textAlign: 'right' }}>
                <CheckboxLabel onClick={() => setIsAdditive((a) => !a)} selected={isAdditive}>
                  {isAdditive ? <CheckedIcon /> : <UncheckedIcon />} <span>Include Existing Contents</span>
                </CheckboxLabel>
              </div>
            </FlexSectionBlock>
          </FlexSection>
        )}

        <Section>
          {!isInSiteMode && (
            <SectionTitle>
              Shopping List
              {insufficientCapacity && (
                <>
                  <b style={{ flex: 1 }} />
                  <SectionTitleRight style={{ color: theme.colors[insufficientCapacity], fontSize: 16, maxWidth: 256 }}>
                    {insufficientCapacity === 'warning' && <><WarningOutlineIcon /> Inventory Capacity Warning</>}
                    {insufficientCapacity === 'error' && <><WarningIcon /> Inventory Capacity Exceeded</>}
                  </SectionTitleRight>
                </>
              )}
              {!insufficientCapacity && inventoryConstrained && (
                <>
                  <b style={{ flex: 1 }} />
                  <SectionTitleRight style={{ color: theme.colors[inventoryConstrained], fontSize: 16, maxWidth: 256 }}>
                    {inventoryConstrained === 'warning' && <><WarningOutlineIcon /> Product Constraint Warning</>}
                    {inventoryConstrained === 'error' && <><WarningIcon /> Product Constraint Error</>}
                  </SectionTitleRight>
                </>
              )}
            </SectionTitle>
          )}
        </Section>
        
        <FlexSection style={{ flex: '1 1 calc(100% - 105px)', flexDirection: 'column', marginTop: 0, overflow: 'auto' }}>
          {resourceMarketplacesLoading && !resourceMarketplaces && <PageLoader />}
          {resourceMarketplaces && (
            <ProductList>
              {!processId && (
                <PromptToSelectRecipe>
                  <EmptyResourceImage iconOverride={<InventoryIcon />} size="80px" />
                  <div style={{ flex: 1, paddingLeft: 10 }}>
                    Select a recipe above to generate a shopping list.
                  </div>
                  <div style={{ fontSize: 28, lineHeight: 0 }}>
                    <ChevronRightIcon />
                  </div>
                </PromptToSelectRecipe>
              )}
              {processId && isAdditive && shoppingList.length === 0 && (
                <PromptToSelectRecipe>
                  <EmptyResourceImage iconOverride={<CheckedIcon />} iconStyle={{ color: theme.colors.success }} size="80px" />
                  <div style={{ color: theme.colors.success, flex: 1, paddingLeft: 10 }}>
                    The existing contents of this inventory already satisfy this recipe configuration.
                  </div>
                </PromptToSelectRecipe>
              )}
              {shoppingList.map(({ product, amount }) => {
                const hasSelected = selectionSummary[product.i]?.totalFilled > 0;
                const selectedMarkets = Object.keys(selectionSummary[product.i]?.amounts || {});
                return (
                  <ProductItem
                    key={product.i}
                    selected={openProductId === product.i}>
                    <ProductHeader onClick={handleProductClick(product.i)}>
                      <ResourceRequirement
                        item={{ numerator: selectionSummary[product.i]?.totalFilled, denominator: amount }}
                        resource={product}
                        size="70px"
                        tooltipContainer="actionDialogTooltip" />

                      <Basics hasSelected={hasSelected}>
                        <h4>{product.name}</h4>
                        <div>
                          {selectedMarkets.length === 1 && `From ${formatters.buildingName(exchangesById[selectedMarkets[0]])}`}
                          {selectedMarkets.length > 1 && `From ${selectedMarkets.length} Marketplaces`}
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
                              lotId={destinationLot?.id}
                              productId={product.i}
                              selected={selected[product.i]}
                              selectionSummary={selectionSummary[product.i]}
                              onSelected={handleSelected(product.i)}
                              resourceMarketplaces={resourceMarketplaces?.[product.i]}
                              targetAmount={amount} />
                          )
                          : (
                            <EmptyMessage>
                              There are currently no accessible marketplaces on <b>{asteroid?.Name?.name}</b> with <b>{product.name}</b> available for purchase.
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
            titleDetails={<Insufficient onClick={goToSwayStore} visible={insufficientSway}><b>+</b> Get More Sway</Insufficient>}
            bodyStyle={{ height: 'auto', padding: 0 }}
            style={{ width: '100%', marginTop: 10 }}>
            <MarketplaceAlert scheme={totalPrice === 0 ? 'empty' : (insufficientSway ? 'error' : 'success')}>
              <div>
                <div>
                  <label>Market Buy</label>
                  <div style={{ fontSize: '100%' }}><b>{exchangeTally || 0} Order{exchangeTally === 1 ? '' : 's'}</b></div>
                </div>
                <div>
                  <label>Total</label>
                  <span>
                    <SwayIcon /> {totalPrice > 0.5 ? '-' : ''}{formatFixed(totalPrice || 0)}
                  </span>
                </div>
              </div>
            </MarketplaceAlert>
          </FlexSectionBlock>
        </FlexSection>
      </ActionDialogBody>

      <ActionDialogFooter
        disabled={!(allFills?.length > 0) || insufficientSway || insufficientCapacity === 'error' || inventoryConstrained === 'error'}
        goLabel="Purchase"
        onGo={handlePurchase}
        stage={stage}
        taskCompleteTime={taskTimeRequirement}
        {...props} />

      {stage === actionStage.NOT_STARTED && (
        <>
          <ProcessSelectionDialog
            initialSelection={processId}
            onClose={() => setProcessSelectorOpen(false)}
            onSelected={setProcessId}
            open={processSelectorOpen}
          />
        </>
      )}
    </>
  );
};

const Wrapper = (props) => {
  const { asteroid, lot, isLoading } = useAsteroidAndLot(props);
  const actionManager = { actionStage: actionStage.NOT_STARTED };

  const [destination, destinationSlot] = useMemo(() => {
    const destination = props.destination || lot?.building;
    const destinationSlot = props.destinationSlot || destination?.Inventories.find((i) => i.status === Inventory.STATUSES.AVAILABLE)?.slot;
    return [destination, destinationSlot];
  }, [lot?.building, props.destination, props.destinationSlot]);

  useEffect(() => {
    if (!asteroid || !lot || !destination || !destinationSlot) {
      if (!isLoading) {
        if (props.onClose) props.onClose();
      }
    }
  }, [asteroid, lot, destination, destinationSlot, isLoading]);

  return (
    <ActionDialogInner
      actionImage="Marketplace"
      isLoading={reactBool(isLoading)}
      stage={actionManager.actionStage}>
      <ShoppingList
        asteroid={asteroid}
        destination={destination}
        destinationSlot={destinationSlot}
        actionManager={actionManager}
        stage={actionManager.actionStage}
        {...props} />
    </ActionDialogInner>
  )
};

export default Wrapper;
