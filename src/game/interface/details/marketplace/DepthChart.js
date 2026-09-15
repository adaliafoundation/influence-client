import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { Building, Crewmate, Entity, Lot, Order, Permission } from '@influenceth/sdk';

import {
  LimitBuyIcon,
  LimitSellIcon,
  MarketBuyIcon,
  MarketSellIcon,
  RadioUncheckedIcon,
  RadioCheckedIcon,
  SwayIcon
} from '~/components/Icons';
import OnClickLink from '~/components/OnClickLink';
import CrewIndicator from '~/components/CrewIndicator';
import ResourceThumbnail from '~/components/ResourceThumbnail';
import Switcher from '~/components/SwitcherButton';
import UncontrolledTextInput, { TextInputWrapper } from '~/components/TextInputUncontrolled';
import ActionButton from '~/game/interface/hud/actionButtons/ActionButton';
import useMarketplaceManager from '~/hooks/actionManagers/useMarketplaceManager';
import useCrewContext from '~/hooks/useCrewContext';
import useOrderList from '~/hooks/useOrderList';
import useScreenSize from '~/hooks/useScreenSize';
import useStore from '~/hooks/useStore';
import formatters from '~/lib/formatters';
import { formatFixed, formatPrice, getCrewAbilityBonuses, nativeBool } from '~/lib/utils';
import theme, { hexToRGB } from '~/theme';
import { formatResourceAmount } from '../../hud/actionDialogs/components';
import useCoachmarkRefSetter from '~/hooks/useCoachmarkRefSetter';
import { COACHMARK_IDS } from '~/contexts/CoachmarkContext';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';
import useSimulationState from '~/hooks/useSimulationState';
import SIMULATION_CONFIG from '~/simulation/simulationConfig';

const Wrapper = styled.div`
  display: flex;
  flex-direction: row;
  height: 100%;
  width: 100%;
`;
const Main = styled.div`
  display: flex;
  flex-direction: column;
  flex: 3;
  height: 100%;
`;

const ActionPanel = styled.div`
  flex: 1;
  margin-left: 20px;
  & > div {
    background: #171717;
    ${p => p.theme.clipCorner(15)};
    height: calc(100% - 25px);
  }
`;

const PanelInner = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px 16px 0 12px;
`;

const trayHeight = 80;
const PanelTitle = styled.div`
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  display: flex;
  flex-direction: row;
  font-size: 18px;
  font-weight: bold;
  padding-bottom: 8px;
  padding-top: 4px;
  text-transform: uppercase;
`;

const PanelContent = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 0;
  padding: 15px 0 0;
  & > div:first-child {
    height: calc(100% - ${trayHeight}px);
    overflow-x: hidden;
    overflow-y: auto;
    padding-right: 15px;
    margin-right: -12px;
  }
`;

const Subheader = styled.div``;
const Header = styled.div`
  align-items: center;
  border-bottom: 1px solid #333;
  display: flex;
  flex-direction: row;
  padding-bottom: 10px;
  position: relative;

  & > div {
    h1 {
      align-items: center;
      display: flex;
      font-size: 50px;
      font-weight: normal;
      line-height: 1em;
      margin: 0 0 4px;
      text-transform: uppercase;
    }
    ${Subheader} {
      font-weight: normal;
      & span:first-child {
        padding-right: 10px;
      }
      & span:not(:first-child) {
        margin-left: 10px;
      }
    }
  }
`;

const Body = styled.div`
  display: flex;
  flex-direction: row;
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 25px 0;
`;

const ChartArea = styled.div`
  border: 1px solid #333;
  height: 100%;
  flex: 2;
  position: relative;
  & > svg {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 100%;
  }

  &:before {
    color: ${theme.colors.secondaryText};
    font-weight: bold;
    font-size: 90%;
    content: "${p => p.spread > 0 ? 'Spread' : ''}";
    border-bottom: 2px solid #333;
    padding: 0 0 4px 8px;
    position: absolute;
    bottom: calc(50% - 1px);
    left: 0;
    right: 0;
  }
  &:after {
    content: "${p => p.spread > 0 ? `${formatPrice(p.spread, { fixedPrecision: 4 })} SWAY` : ''}";
    padding: 0 0 4px 8px;
    position: absolute;
    top: calc(50% + 3px);
  }
`;

const TableArea = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding-left: 15px;
`;

const VolumeBar = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: ${p => 100 * p.volume}%;
  z-index: -1;
`;

const centerPriceHeight = 48;
const centerPriceMargin = 6;
const SellTable = styled.div`
  display: flex;
  flex-direction: column-reverse;
  justify-content: flex-start;
  height: calc(50% - ${(centerPriceHeight + 2 * centerPriceMargin) / 2}px);
  overflow: auto;
  table {
    border-collapse: collapse;
    width: 100%;

    tr > * {
      white-space: nowrap;
      border-bottom: 1px solid #000;
      color: #FFF;
      font-size: 88%;
      padding: 2px 10px 2px 4px;
      text-align: right;
    }
    th {
      background: black;
      color: ${theme.colors.secondaryText};
      font-size: 90%;
      font-weight: bold;
      position: sticky;
      top: 0;
      z-index: 1;
      padding: 2px 10px 6px 0px;
    }
    td {
      font-family: 'Jetbrains Mono', sans-serif;
      font-weight: 100;
      &:first-child {
        color: ${p => p.theme.colors.buy};
        position: relative;
        width: 135px;
      }
    }
  }
  ${VolumeBar} {
    background: rgba(${p => hexToRGB(p.theme.colors.buy)}, 0.25);
  }
`;

const BuyTable = styled(SellTable)`
  justify-content: flex-end;
  table tr td:first-child {
    color: ${p => p.theme.colors.sell};
  }
  ${VolumeBar} {
    background: rgba(${p => hexToRGB(p.theme.colors.sell)}, 0.2);
  }
`;

const CenterPrice = styled.div`
  align-items: center;
  background: #111;
  display: flex;
  flex-direction: row;
  height: ${centerPriceHeight}px;
  margin: ${centerPriceMargin}px 0;
  font-weight: normal;
  &:after {
    color: #777;
    content: "Center Price";
    font-weight: bold;
    font-size: 90%;
    margin-right: 10px;
  }

  & > svg {
    font-size: 36px;
  }
`;

const Price = styled.div`
  flex: 1 0 0;
  font-size: 30px;
  text-align: left;
  ${p => p.unit && `
    &:after {
      content: "/${p.unit}";
      font-size: 67%;
      opacity: 0.6;
    }
  `}
`;

const FormSection = styled.div`
  margin-top: 15px;
  &:first-child {
    margin-top: 0;
  }
`;

const RadioRow = styled.label`
  align-items: center;
  display: flex;
  flex-direction: row;
  width: 100%;
  font-size: 90%;
  padding: 6px 0 0 0;
  & > svg {
    font-size: 120%
  }

  ${p => p.selected
    ? `
      color: white;
      & > svg { color: white };
    `
    : `
      color: ${theme.colors.secondaryText};
      cursor: ${p.theme.cursors.active};
      &:hover {
        color: white;
        & > svg { color: white };
      }
    `
  }

  & > span {
    flex: 1;
    padding-left: 6px;
  }
`;

const InputLabel = styled.div`
  display: flex;
  flex-direction: row;
  font-size: 14px;
  padding: 6px 0;
  & > label {
    color: ${theme.colors.secondaryText};
    flex: 1;
  }
  & > span {
    b {
      color: white;
      font-weight: normal;
    }
  }
`;

const Tray = styled.div`
  align-items: center;
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  display: flex;
  flex-direction: row;
  height: ${trayHeight}px;
  justify-content: space-between;
  position: relative;
`;

const Summary = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  font-size: 36px;
  & > svg {
    font-size: 36px;
  }
`;

const SummaryHeader = styled.label`
  display: block;
  font-size: 90%;
  margin-bottom: 4px;
  &:before {
    content: "${p => p.type === 'limit' ? 'Limit' : 'Market'} ${p => p.mode === 'buy' ? 'Buy' : 'Sell'} ";
    color: ${p => p.mode === 'buy' ? p.theme.colors.buy : p.theme.colors.sell};
  }
  &:after {
    content: "Preview";
    color: ${theme.colors.secondaryText};
  }
`;

const STROKE_WIDTH = 2;

const MarketplaceDepthChart = ({ lot, marketplace, marketplaceOwner, resource }) => {
  const history = useHistory();
  const { search } = useLocation();

  const urlMode = useMemo(() => {
    const q = new URLSearchParams(search);
    return q.get('mode');
  }, [search]);

  const { width, height } = useScreenSize();
  const { crew, crewCan } = useCrewContext();
  const simulationEnabled = useSimulationEnabled();

  const setCoachmarkRef = useCoachmarkRefSetter();
  const setCoachmarkHelperRef = useMemo(() => setCoachmarkRef(COACHMARK_IDS.asteroidMarketsHelper), [setCoachmarkRef]);
  
  const actionDialog = useStore(s => s.actionDialog);
  const coachmarkHelperProduct = useStore(s => s.coachmarks?.[COACHMARK_IDS.asteroidMarketsHelper]);
  const simulationActions = useStore((s) => s.simulationActions);
  const onSetAction = useStore(s => s.dispatchActionDialog);

  const { data: orders } = useOrderList(marketplace?.id, resource?.i);

  const { getPendingOrder } = useMarketplaceManager(marketplace?.id);

  const [buyOrders, sellOrders, bid, ask] = useMemo(() => {
    const buys = (orders || []).filter((o) => o.orderType === Order.IDS.LIMIT_BUY);
    const sells = (orders || []).filter((o) => o.orderType === Order.IDS.LIMIT_SELL);
    const highestBuy = Math.max(...buys.map(b => b.price));
    const lowestSell = Math.min(...sells.map(s => s.price));
    return [buys, sells, highestBuy, lowestSell];
  }, [orders]);

  const buyBuckets = useMemo(() => {
    const buckets = buyOrders.reduce((acc, { price, amount }) => ({
      ...acc,
      [price]: (acc[price] || 0) + amount
    }), {});
    return Object.keys(buckets)
      .map((price) => ({ price: Number(price), amount: buckets[price] }))
      .sort((a, b) => a.price > b.price ? -1 : 1);
  }, [buyOrders]);

  const sellBuckets = useMemo(() => {
    const buckets = sellOrders.reduce((acc, { price, amount }) => ({
      ...acc,
      [price]: (acc[price] || 0) + amount
    }), {});
    return Object.keys(buckets)
      .map((price) => ({ price: Number(price), amount: buckets[price] }))
      .sort((a, b) => a.price > b.price ? -1 : 1);
  }, [sellOrders]);

  const [mode, setMode] = useState(urlMode || 'buy');
  const [type, setType] = useState('market');
  const chartWrapperRef = useRef({ clientHeight: 0, clientWidth: 0 });

  // make sure render again once chartWrapperRef is ready
  const [refIsReady, setRefIsReady] = useState();
  const checkRefIsReady = useCallback(() => {
    if (chartWrapperRef.current.clientWidth > 0) {
      setRefIsReady(true);
    } else if (!refIsReady) {
      setTimeout(checkRefIsReady, 50);
    }
  }, [refIsReady]);
  useEffect(checkRefIsReady, []);

  const {
    xViewbox,
    yViewbox,
    buyPoints,
    buyLine,
    sellPoints,
    sellLine,
    spread,
    centerPrice,
    totalBuying,
    totalSelling
  } = useMemo(() => {
    if (!chartWrapperRef.current) return {};
    if (!(buyBuckets?.length > 0 || sellBuckets?.length > 0)) return {};

    const xViewbox = chartWrapperRef.current.clientWidth;
    const yViewbox = chartWrapperRef.current.clientHeight;

    // calculate centerPrice and spread for the orders
    let centerPrice;
    let spread;
    if (buyBuckets[0] && sellBuckets[sellBuckets.length - 1]) {
      centerPrice = (buyBuckets[0].price + sellBuckets[sellBuckets.length - 1].price) / 2;
      spread = sellBuckets[sellBuckets.length - 1].price - buyBuckets[0].price;
    } else {
      centerPrice = buyBuckets?.[0]?.price || sellBuckets?.[sellBuckets.length - 1]?.price || 0;
    }

    // set the size of the y-axis
    let yAxisHalf = 0.05 * centerPrice;
    if (buyBuckets.length) {
      yAxisHalf = Math.max(yAxisHalf, centerPrice - buyBuckets[buyBuckets.length - 1].price);
    }
    if (sellBuckets.length) {
      yAxisHalf = Math.max(yAxisHalf, sellBuckets[0].price - centerPrice);
    }
    yAxisHalf *= 1.05; // add enough buffer that can draw last step

    const yAxisLength = 2 * yAxisHalf;
    const yAxisMin = centerPrice - yAxisHalf;

    // set the size of the x-axis
    const buySum = buyBuckets.reduce((acc, cur) => acc + cur.amount, 0);
    const sellSum = sellBuckets.reduce((acc, cur) => acc + cur.amount, 0);
    const xAxisLength = 2 * Math.max(buySum, sellSum);

    // create helper functions
    const amountToX = (amount) => {
      return xViewbox * (1 - amount / xAxisLength);
    };
    const priceToY = (price) => {
      return yViewbox * (1 - (price - yAxisMin) / yAxisLength);
    };

    // calculate the "buy" polygon
    let totalBuying = 0;
    const buyPoints = [];
    buyBuckets.forEach(({ price, amount }) => {
      if (buyPoints.length === 0) {
        buyPoints.push(`${xViewbox + STROKE_WIDTH},${priceToY(price)}`);
      }
      buyPoints.push(`${amountToX(totalBuying)},${priceToY(price)}`);
      totalBuying += amount;
      buyPoints.push(`${amountToX(totalBuying)},${priceToY(price)}`);
    });
    buyPoints.push(`${amountToX(totalBuying)},${yViewbox + 2 * STROKE_WIDTH}`);
    buyPoints.push(`${xViewbox + STROKE_WIDTH},${yViewbox + 2 * STROKE_WIDTH}`);
    const buyLine = `M ${amountToX(totalBuying)},${yViewbox / 2} v ${yViewbox / 2}`;

    // calculate the "sell" polygon
    let totalSelling = 0;
    const sellPoints = [];
    [...sellBuckets].reverse().forEach(({ price, amount }) => {
      if (sellPoints.length === 0) {
        sellPoints.push(`${xViewbox + STROKE_WIDTH},${priceToY(price)}`);
      }
      sellPoints.push(`${amountToX(totalSelling)},${priceToY(price)}`);
      totalSelling += amount;
      sellPoints.push(`${amountToX(totalSelling)},${priceToY(price)}`);
    });
    sellPoints.push(`${amountToX(totalSelling)},${-2 * STROKE_WIDTH}`);
    sellPoints.push(`${xViewbox + STROKE_WIDTH},${-2 * STROKE_WIDTH}`);
    const sellLine = `M ${amountToX(totalSelling)},0 v ${yViewbox / 2}`;

    return {
      xViewbox,
      yViewbox,
      buyPoints: buyPoints.join(' '),
      buyLine,
      sellPoints: sellPoints.join(' '),
      sellLine,
      spread,
      centerPrice,
      totalBuying,
      totalSelling
    };
  }, [refIsReady, buyBuckets, sellBuckets, height, width]);

  // if nothing available for market order, default to limit
  useEffect(() => {
    if (type === 'market' && mode === 'buy' && totalSelling === 0) setType('limit');
  }, [mode, totalBuying, totalSelling]);

  let rowBuyVolume = 0;
  let rowSaleVolume = totalSelling + 0;
  let volumeBenchmark = Math.max(totalBuying, totalSelling);

  // TODO: re-release sdk and reference there
  const feeReductionBonus = useMemo(() => {
    if (!crew) return {};
    return getCrewAbilityBonuses(Crewmate.ABILITY_IDS.MARKETPLACE_FEE_REDUCTION, crew);
  }, [crew]);

  const feeEnforcementBonus = useMemo(() => {
    if (!marketplaceOwner) return {};
    return getCrewAbilityBonuses(Crewmate.ABILITY_IDS.MARKETPLACE_FEE_ENFORCEMENT, marketplaceOwner) || {};
  }, [marketplaceOwner]);

  const baseMarketplaceFee = useMemo(
    () => marketplace?.Exchange?.[type === 'market' ? 'takerFee' : 'makerFee'],
    [marketplace, type]
  );

  const marketplaceFee = useMemo(() => {
    const adjusted = Order.adjustedFee(baseMarketplaceFee, feeReductionBonus.totalBonus, feeEnforcementBonus.totalBonus);
    return adjusted;
  }, [baseMarketplaceFee, feeReductionBonus, feeEnforcementBonus]);

  const [quantity, setQuantity] = useState();
  const [limitPrice, setLimitPrice] = useState();

  useEffect(() => {
    setLimitPrice(0);
  }, [mode, type]);

  const createOrder = useCallback(() => {
    onSetAction('MARKETPLACE_ORDER', {
      asteroidId: lot?.asteroid,
      lotId: lot?.id,
      mode,
      type,
      resourceId: resource?.i,
      preselect: { limitPrice, quantity }
    });
  }, [limitPrice, lot, mode, quantity, resource, type]);

  const handleChangeQuantity = useCallback((e) => {
    let input = parseInt(e.currentTarget.value) || 0;
    if (input && type === 'market') {
      if (mode === 'buy') input = Math.max(0, Math.min(input, totalSelling));
      if (mode === 'sell') input = Math.max(0, Math.min(input, totalBuying));
    }
    // TODO: set limits for limit orders
    setQuantity(input);
  }, [mode, type, totalBuying, totalSelling]);

  const handleChangeLimitPrice = useCallback((price, blur = false) => {
    if (blur) {
      if ((mode === 'buy' && price >= ask) || (mode === 'sell' && price <= bid)) {
        setType('market');
        return;
      }
    }

    setLimitPrice(price);
  }, [bid, ask, mode]);

  // TODO: is quantity right here for non-atomic?
  const [totalMarketPrice, avgMarketPrice] = useMemo(() => {
    let total = 0;
    let needed = quantity;
    const priceSortMult = mode === 'buy' ? 1 : -1;
    const orders = []
      .concat(mode === 'buy' ? sellOrders : buyOrders)
      .sort((a, b) => a.price === b.price ? a.validTime - b.validTime : (priceSortMult * (a.price - b.price)));
    orders.forEach(({ price, amount }) => {
      const levelAmount = Math.min(needed, amount);
      total += levelAmount * price;
      needed -= levelAmount;
    })
    return [total, total / quantity];
  }, [buyOrders, mode, quantity, sellOrders]);

  const totalLimitPrice = useMemo(() => {
    return (limitPrice || 0) * quantity;
  }, [limitPrice, quantity]);

  const fee = useMemo(() => {
    return (type === 'market' ? totalMarketPrice : totalLimitPrice)
      * marketplaceFee / Order.FEE_SCALE;
  }, [marketplaceFee, totalMarketPrice, totalLimitPrice, type]);

  const total = useMemo(() => {
    let sum = type === 'limit' ? totalLimitPrice : totalMarketPrice;
    return sum + (mode === 'buy' ? fee : -fee);
  }, [fee, mode, totalLimitPrice, totalMarketPrice, type]);

  const loading = useMemo(
    () => getPendingOrder(mode, type, { product: resource.i, exchange: marketplace }),
    [mode, type, resource, marketplace, getPendingOrder]
  );

  const sameAsteroid = useMemo(() => {
    if (marketplace?.Location?.locations) {
      return !!marketplace?.Location?.locations.find((l) => {
        return l.id === crew?._location?.asteroidId && l.label === Entity.IDS.ASTEROID;
      });
    }

    return false;
  }, [crew, marketplace]);

  const hasPermission = useMemo(() => {
    let perm = 0;
    if (type === 'limit' && mode === 'buy') perm = Permission.IDS.LIMIT_BUY;
    if (type === 'limit' && mode === 'sell') perm = Permission.IDS.LIMIT_SELL;
    if (type === 'market' && mode === 'buy') perm = Permission.IDS.BUY;
    if (type === 'market' && mode === 'sell') perm = Permission.IDS.SELL;
    return crewCan(perm, marketplace);
  }, [crewCan, marketplace, mode, type]);

  const [coachToBuy, coachToSell, coachToLimit, coachToMarket, coachToQuantity, coachToUnitPrice, coachToButton] = useMemo(() => {
    let disable = (coachmarkHelperProduct !== resource.i) || !!actionDialog?.type;
    
    const toBuy = !disable && mode === 'sell' && !(simulationActions.includes('MarketSell') || simulationActions.includes('LimitSell'));
    const toSell = !disable && mode === 'buy' && !(simulationActions.includes('MarketBuy') || simulationActions.includes('LimitBuy'));
    disable = disable || toBuy || toSell;

    const toLimit = !disable && type === 'market' && !(simulationActions.includes('MarketBuy') || simulationActions.includes('MarketSell'));
    const toMarket = !disable && type === 'limit' && !(simulationActions.includes('LimitBuy') || simulationActions.includes('LimitSell'));
    disable = disable || toLimit || toMarket;

    const toQuantity = !disable && !(quantity > 0);
    disable = disable || toQuantity;
    const toUnitPrice = !disable && !toQuantity && !(limitPrice > 0);
    disable = disable || toUnitPrice;
    const toButton = !disable && total > 0;

    return [
      toBuy,
      toSell,
      toLimit,
      toMarket,
      toQuantity,
      toUnitPrice,
      toButton
    ];  
  }, [actionDialog?.type, coachmarkHelperProduct, limitPrice, mode, quantity, resource.i, simulationActions, total, type]);

  const simulation = useSimulationState();
  const handleQuantityFocus = useCallback((e) => {
    if (coachToQuantity && !quantity) {
      let q = '';
      if (SIMULATION_CONFIG.marketplaceAmounts[coachmarkHelperProduct] === true) {
        const warehouseInventory = Object.values(simulation?.lots || {}).find((l) => l.buildingType === Building.IDS.WAREHOUSE)?.inventoryContents?.[2];
        q = Math.floor(warehouseInventory?.[coachmarkHelperProduct] || 1);
      } else if (SIMULATION_CONFIG.marketplaceAmounts[coachmarkHelperProduct]) {
        q = SIMULATION_CONFIG.marketplaceAmounts[coachmarkHelperProduct];
      }
      setQuantity(q);
    }
  }, [coachToQuantity, quantity, simulation]);

  const handleLimitPriceFocus = useCallback((e) => {
    if (coachToUnitPrice && !limitPrice) {
      let p = 1;
      if (sellBuckets?.length) {
        p = 0.99 * sellBuckets[sellBuckets.length - 1].price;
      } else if (buyBuckets?.length) {
        p = 1.01 * buyBuckets[0].price;
      }
      setLimitPrice(Math.round(1e6 * p) / 1e6);
    }
  }, [coachToUnitPrice, limitPrice]);

  const actionButtonDetails = useMemo(() => {
    const a = { label: '', icon: null };

    if (type === 'limit') {
      a.label = `${loading ? 'Creating' : 'Create'} Limit Order`;
      a.icon = mode === 'buy' ? <LimitBuyIcon /> : <LimitSellIcon />;
    } else {
      a.label = `${loading ? 'Creating' : 'Create'} Market Order`;
      a.icon = mode === 'buy' ? <MarketBuyIcon /> : <MarketSellIcon />;
    }

    if (loading) {
      a._disabled = true;
    } else {
      let disabledReason;
      if (!sameAsteroid) disabledReason = 'different asteroid';
      else if (!crew?._location?.lotId) disabledReason = 'in orbit';
      else if (!hasPermission) disabledReason = 'restricted';
      else if (!crew?._ready && type === 'limit') disabledReason = 'crew busy';
      else if (!(total > 0)) disabledReason = 'form incomplete';
      else if (simulationEnabled && !simulationActions.find((a) => a.toLowerCase() === `${type}${mode}`)) {
        disabledReason = 'simulation restricted';
      }
      
      if (disabledReason) {
        a.labelAddendum = disabledReason;
        a._disabled = true;
      }
    }

    if (simulationEnabled && !a._disabled) {
      a.attention = true;
    }
    return a;
  }, [crew, loading, hasPermission, mode, sameAsteroid, simulationActions, simulationEnabled, total, type]);

  const goToListings = useCallback(() => {
    const { asteroidId, lotIndex } = Lot.toPosition(lot?.id) || {};
    history.push(`/marketplace/${asteroidId}/${lotIndex}`);
  }, [lot]);

  const actionButtonDisabled = loading || !hasPermission || !(total > 0) || actionButtonDetails?._disabled;
  return (
    <Wrapper>
      <Main>
        <Header>
            <ResourceThumbnail resource={resource} size="110px" tooltipContainer={null} />
            <div style={{ flex: 1, paddingLeft: 20 }}>
              <h1>{resource.name}</h1>
              <Subheader>
                {totalSelling > 0
                  ? (<span style={{ color: theme.colors.buy }}><b>{formatResourceAmount(totalSelling || 0, resource.i)}</b> Available</span>)
                  : (<span style={{ color: theme.colors.secondaryText }}>None Available</span>)
                }
                <>  |  </>
                {totalBuying > 0
                  ? (<span style={{ color: theme.colors.sell }}><b>{formatResourceAmount(totalBuying, resource.i)}</b> Sellable</span>)
                  : (<span style={{ color: theme.colors.secondaryText }}>None Sellable</span>)
                }
                <span>at <OnClickLink onClick={goToListings}> {formatters.buildingName(marketplace)} </OnClickLink></span>
              </Subheader>
            </div>
          {marketplaceOwner && <CrewIndicator crew={marketplaceOwner} flip label="Managed by" />}
        </Header>
        <Body>
          <ChartArea ref={chartWrapperRef} spread={spread}>
            <svg focusable="false" viewBox={`0 0 ${xViewbox || 1} ${yViewbox || 1}`}>
              <g>
                <polygon
                  points={sellPoints}
                  fill={`rgba(${hexToRGB(theme.colors.buy)}, 0.4)`}
                  stroke={theme.colors.buy}
                  strokeWidth={STROKE_WIDTH} />
                <path d={sellLine} stroke={`rgba(${hexToRGB(theme.colors.buy)}, 0.35)`} strokeDasharray="3" />
              </g>
              <g>
                <polygon
                  points={buyPoints}
                  fill={`rgba(${hexToRGB(theme.colors.sell)}, 0.4)`}
                  stroke={theme.colors.sell}
                  strokeWidth={STROKE_WIDTH} />
                <path d={buyLine} stroke={`rgba(${hexToRGB(theme.colors.sell)}, 0.35)`} strokeDasharray="3" />
              </g>
            </svg>
          </ChartArea>
          <TableArea>
            <SellTable>
                <table>
                  <thead>
                    {sellBuckets.length == 0
                      ? (
                        <tr>
                          <th style={{ textAlign: 'center' }}>No Sellers</th>
                        </tr>
                      )
                      : (
                        <tr>
                          <th>Selling Price</th>
                          <th>Quantity</th>
                          <th>Total</th>
                        </tr>
                      )
                    }
                  </thead>
                  <tbody>
                    {sellBuckets.map(({ price, amount }, i) => {
                      const rowVolume = rowSaleVolume;
                      rowSaleVolume -= amount;
                      return (
                        <tr key={i}>
                          <td><VolumeBar volume={volumeBenchmark > 0 ? rowVolume / volumeBenchmark : 0} />{price.toLocaleString(undefined, { maximumFractionDigits: 4, minimumFractionDigits: 4 } )}</td>
                          <td>{amount.toLocaleString()}</td>
                          <td>{formatPrice(price * amount, { fixedPrecision: 2, minPrecision: 2 })}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
            </SellTable>

            <CenterPrice>
              <SwayIcon />
              <Price unit={resource.isAtomic ? 'unit' : 'kg'}>{formatPrice(centerPrice, { fixedPrecision: 4 })}</Price>
            </CenterPrice>

            <BuyTable>
              <table>
                <thead>
                  {buyBuckets.length == 0
                      ? (
                        <tr>
                          <th style={{ textAlign: 'center' }}>No Buyers</th>
                        </tr>
                      )
                      : (
                        <tr>
                          <th>Buying Price</th>
                          <th>Quantity</th>
                          <th>Total</th>
                        </tr>
                      )
                    }
                </thead>
                <tbody>
                  {buyBuckets.map(({ price, amount }, i) => {
                    rowBuyVolume += amount;
                    return (
                      <tr key={i}>
                        <td><VolumeBar volume={volumeBenchmark > 0 ? rowBuyVolume / volumeBenchmark : 0} />{price.toLocaleString(undefined, { maximumFractionDigits: 4, minimumFractionDigits: 4 } )}</td>
                        <td>{amount.toLocaleString()}</td>
                        <td>{formatPrice(price * amount, { fixedPrecision: 2, minPrecision: 2 })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </BuyTable>
          </TableArea>
        </Body>
      </Main>
      <ActionPanel>
        <div>
          <PanelInner>
            <PanelTitle>
              Transact
            </PanelTitle>
            <PanelContent>
              <div>
                <FormSection>
                  <Switcher
                    buttons={[
                      { label: 'Buy', value: 'buy', setRef: coachToBuy ? setCoachmarkHelperRef : null },
                      { label: 'Sell', value: 'sell', setRef: coachToSell ? setCoachmarkHelperRef : null }
                    ]}
                    buttonWidth="50%"
                    onChange={setMode}
                    value={mode}
                  />
                </FormSection>

                <FormSection>
                  <InputLabel>
                    <label>Order Type</label>
                  </InputLabel>
                  <RadioRow
                    ref={coachToMarket ? setCoachmarkHelperRef : null}
                    onClick={() => setType('market')}
                    selected={nativeBool(type === 'market')}>
                    {type === 'market' ? <RadioCheckedIcon /> : <RadioUncheckedIcon />}
                    <span>Market Order</span>
                  </RadioRow>
                  <RadioRow
                    ref={coachToLimit ? setCoachmarkHelperRef : null}
                    onClick={() => setType('limit')}
                    selected={nativeBool(type === 'limit')}>
                    {type === 'limit' ? <RadioCheckedIcon /> : <RadioUncheckedIcon />}
                    <span>Limit Order</span>
                  </RadioRow>
                </FormSection>

                <FormSection>
                  <InputLabel>
                    <label>Quantity</label>
                    {type === 'market' && (
                      <span>Max <b style={!(mode === 'buy' ? totalSelling : totalBuying) ? { color: theme.colors.error} : {}}>{((mode === 'buy' ? totalSelling : totalBuying) || 0).toLocaleString()}{resource.massPerUnit === 1000 ? ' kg' : ''}</b></span>
                    )}
                  </InputLabel>
                  <TextInputWrapper rightLabel={resource.isAtomic ? '' : ' kg'}>
                    <UncontrolledTextInput
                      ref={coachToQuantity ? setCoachmarkHelperRef : null}
                      monospace
                      size="large"
                      disabled={nativeBool(type === 'market' && ((mode === 'buy' && !totalSelling) || (mode === 'sell' && !totalBuying)))}
                      min={0}
                      max={type === 'market' ? (mode === 'buy' ? totalSelling : totalBuying) : undefined}
                      onChange={handleChangeQuantity}
                      onFocus={handleQuantityFocus}
                      placeholder="Specify Quantity"
                      step={1}
                      type="number"
                      value={quantity || ''} />
                  </TextInputWrapper>
                </FormSection>

                {type === 'market' && (
                  <FormSection>
                    <InputLabel>
                      <label>Market Price</label>
                    </InputLabel>
                    <TextInputWrapper rightLabel={`SWAY${resource.isAtomic ? '' : ' / kg'}`}>
                      <UncontrolledTextInput
                        monospace
                        size="large"
                        disabled
                        value={formatPrice(avgMarketPrice ? (avgMarketPrice || 0) : ((centerPrice || 0) + (spread || 0) / 2), { fixedPrecision: 4 })} />
                    </TextInputWrapper>
                  </FormSection>
                )}
                {type === 'limit' && (
                  <FormSection>
                    <InputLabel>
                      <label>Price</label>
                    </InputLabel>
                    <TextInputWrapper rightLabel={`SWAY${resource.isAtomic ? '' : ' / kg'}`}>
                      <UncontrolledTextInput
                        ref={coachToUnitPrice ? setCoachmarkHelperRef : null}
                        monospace
                        size="large"
                        onChange={(e) => handleChangeLimitPrice(e.currentTarget.value)}
                        onBlur={(e) => handleChangeLimitPrice(e.currentTarget.value, true)}
                        onFocus={handleLimitPriceFocus}
                        placeholder="Specify Price"
                        value={limitPrice || ''} />
                    </TextInputWrapper>
                  </FormSection>
                )}

                <FormSection>
                  <InputLabel>
                    <label>Subtotal</label>
                  </InputLabel>
                  <TextInputWrapper rightLabel="SWAY">
                    <UncontrolledTextInput
                      monospace
                      size="large"
                      disabled
                      value={formatFixed((type === 'market' ? totalMarketPrice : totalLimitPrice) || 0)} />
                  </TextInputWrapper>
                </FormSection>

                <FormSection>
                  <InputLabel>
                    <label>Marketplace Fee</label>
                    {marketplaceFee !== baseMarketplaceFee && (
                      <span style={{ color: 'white', opacity: 0.3, paddingRight: 4 }}>
                        BASE: {formatFixed(100 * baseMarketplaceFee / Order.FEE_SCALE, 2)}% ▸
                      </span>
                    )}
                    <span
                      style={{
                        color: marketplaceFee === baseMarketplaceFee
                          ? theme.colors.main
                          : (marketplaceFee > baseMarketplaceFee ? theme.colors.error : theme.colors.success),
                        fontWeight: 'bold'
                      }}>{formatFixed(100 * marketplaceFee / Order.FEE_SCALE, 2)}%</span>
                  </InputLabel>
                  <TextInputWrapper rightLabel="SWAY">
                    <UncontrolledTextInput
                      monospace
                      size="large"
                      disabled
                      value={formatFixed(fee || 0, 2)} />
                  </TextInputWrapper>
                </FormSection>

              </div>

              <SummaryHeader type={type} mode={mode} />

              <Tray style={{ overflow: 'hidden' }}>
                <Summary>
                  <SwayIcon /> <span>{total > 0 ? formatFixed(total) : 0}</span>
                </Summary>
                {crew && (
                  <ActionButton
                    {...actionButtonDetails}
                    ref={coachToButton ? setCoachmarkHelperRef : null}
                    flags={{
                      attention: actionButtonDetails.attention,
                      disabled: actionButtonDisabled,
                      loading
                    }}
                    onClick={createOrder} />
                )}
              </Tray>
            </PanelContent>
          </PanelInner>
        </div>
      </ActionPanel>
    </Wrapper>
  );
};

export default MarketplaceDepthChart;
