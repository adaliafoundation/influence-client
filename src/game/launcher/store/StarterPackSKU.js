import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { Building, Crewmate, Process } from '@influenceth/sdk';
import cloneDeep from 'lodash/cloneDeep';

import CrewmateCardFramed from '~/components/CrewmateCardFramed';
import { CheckIcon, CrewmateCreditIcon, MyAssetDoubleIcon, MyAssetIcon, MyAssetTripleIcon, SwayIcon } from '~/components/Icons';
import UserPrice from '~/components/UserPrice';
import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useCrewContext from '~/hooks/useCrewContext';
import useFundingFlow from '~/hooks/useFundingFlow';
import usePriceConstants from '~/hooks/usePriceConstants';
import usePriceHelper from '~/hooks/usePriceHelper';
import useSession from '~/hooks/useSession';
import useShoppingListData from '~/hooks/useShoppingListData';
import useStore from '~/hooks/useStore';
import useSwapHelper from '~/hooks/useSwapHelper';
import useWalletPurchasableBalances, { GAS_BUFFER_VALUE_USDC } from '~/hooks/useWalletPurchasableBalances';
import { useEthBalance } from '~/hooks/useWalletTokenBalance';
import { TOKEN, TOKEN_FORMAT, TOKEN_SCALE } from '~/lib/priceUtils';
import { fireTrackingEvent, ordersToFills } from '~/lib/utils';
import theme, { hexToRGB } from '~/theme';
import { PurchaseForm } from './components/PurchaseForm';
import SKUTitle from './components/SKUTitle';
import SKUButton from './components/SKUButton';
import SKUHighlight from './components/SKUHighlight';

const introPackPriceUSD = 14;
const introPackCrewmates = 2;
const basicPackPriceUSD = 29;
const basicPackCrewmates = 2;
const advPackPriceUSD = 89;
const advPackCrewmates = 5;

const MARKET_BUFFER = 0.1;

const buildingIdsToShoppingList = (buildingIds) => {
  return buildingIds.reduce((acc, b) => {
    const inputs = Process.TYPES[Building.TYPES[b].processType].inputs;
    Object.keys(inputs).forEach((product) => {
      if (!acc[product]) acc[product] = 0;
      acc[product] += inputs[product];
    });
    return acc;
  }, {});
};

const introBuildings = [Building.IDS.WAREHOUSE];
const basicBuildings = [Building.IDS.WAREHOUSE, Building.IDS.EXTRACTOR, Building.IDS.REFINERY];
const advBuildings = [...basicBuildings, Building.IDS.BIOREACTOR, Building.IDS.FACTORY];
const introBuildingShoppingList = buildingIdsToShoppingList(introBuildings);
const basicBuildingShoppingList = buildingIdsToShoppingList(basicBuildings);
const advBuildingShoppingList = buildingIdsToShoppingList(advBuildings);
const uniqueProductIds = Array.from(
  new Set([
    ...Object.keys(introBuildingShoppingList),
    ...Object.keys(basicBuildingShoppingList),
    ...Object.keys(advBuildingShoppingList)
  ])
);

export const barebonesCrewmateAppearance = '0x1200010000000000041';

export const packUI = {
  intro: {
    checkMarks: [
      `${introPackCrewmates}x Crewmate${introPackCrewmates === 1 ? '' : 's'} to perform game tasks (Recommended Miner and Engineer)`,
      `SWAY to construct 1x Warehouse (Production buildings may be leased from other players)`
    ],
    color: theme.colors.glowGreen,
    colorLabel: 'green',
    crewmateAppearance: barebonesCrewmateAppearance,
    flavorText: 'A pair of hands and a plan are all you need to get going in the Belt!',
    flairIcon: <MyAssetIcon />,
    name: 'Explorer',
  },
  basic: {
    checkMarks: [
      `${basicPackCrewmates}x Crewmate${basicPackCrewmates === 1 ? '' : 's'} to perform game tasks (Recommended Miner and Engineer)`,
      `SWAY to construct 1x Warehouse, 1x Extractor, and 1x Refinery`
    ],
    color: theme.colors.main,
    colorLabel: undefined,
    crewmateAppearance: '0x2700020002000300032', //'0x22000200070002000a2'
    flavorText: 'A self-sufficient starter kit for your own mining and refining operation!',
    flairIcon: <MyAssetDoubleIcon />,
    name: 'Strategist',
  },
  advanced: {
    checkMarks: [
      `${advPackCrewmates}x Crewmate${advPackCrewmates === 1 ? '' : 's'} to form a full crew and perform game tasks efficiently`,
      `SWAY to construct all Strategist pack buildings, plus 1x Bioreactor and 1x Factory`
    ],
    color: theme.colors.lightPurple,
    colorLabel: 'purple',
    crewmateAppearance: '0x30001000400070002000a2', //'0x3000100030002000300032'
    flavorText: 'Ready to take on the Belt with a specialized crew and expanded production capabilities!',
    flairIcon: <MyAssetTripleIcon />,
    name: 'Industrialist',
  }
};

const StarterPacksOuter = styled.div`
  display: flex;
  flex-direction: row;
  height: 440px;
  width: 100%;
  & > div {
    flex: 1;
  }
`;

const StarterPackPurchaseForm = styled(PurchaseForm)`
  flex-basis: 290px;
  & > h2 {
    text-align: left;
    padding-left: 100px;
  }
`;

const PackWrapper = styled.div`
  height: 350px;
  overflow: hidden auto;
  padding: 0px 8px 10px;
`;

const PackFlavor = styled.div`
  align-items: center;
  color: ${p => p.color || p.theme.colors.main};
  display: flex;
  ${p => p.smaller
    ? `
      font-size: 13px;
    `
    : `
      font-size: 14px;
    `
  }
  height: 85px;
  filter: brightness(135%);
  padding: 0 5px 0 95px;
  text-align: left;
`;

const PackContents = styled.div`
  padding: 10px 0 15px;
`;
const PackChecks = styled.div`
  margin-top: 5px;
  & > div {
    align-items: center;
    display: flex;
    flex-direction: row;
    margin-bottom: 15px;
    padding-right: 4px;
    &:last-child {
      margin-bottom: 0;
    }
    & > span {
      color: ${p => p.color};
      flex: 0 0 32px;
      font-size: 12px;
      padding-top: 3px;
    }
    & > label {
      color: white;
      font-size: 13px;
      line-height: 18px;
      & > b {
        color: white;
        font-weight: normal;
        white-space: nowrap;
      }
    }
  }
`;
const Flair = styled.div`
  background: ${p => p.color || p.theme.colors.main};
  clip-path: polygon(0 0, 100% 0, 0 100%);
  font-size: 23px;
  height: 44px;
  left: 0;
  padding: 2px 3px;
  position: absolute;
  text-align: left;
  top: 0;
  width: 44px;
  z-index: 2;
`;
const FlairCard = styled.div`
  left: 5px;
  position: absolute;
  top: 5px;
  z-index: 1;
  filter: drop-shadow(2px 2px 6px black);
`;

const useStarterPackPricing = () => {
  const { data: priceConstants } = usePriceConstants();
  const priceHelper = usePriceHelper();
  const { data: wallet } = useWalletPurchasableBalances();

  const adalianPrice = useMemo(() => {
    return priceHelper.from(
      priceConstants?.ADALIAN_PURCHASE_PRICE || 0n,
      priceConstants?.ADALIAN_PURCHASE_TOKEN || TOKEN.USDC
    );
  }, [priceConstants]);

  const {
    data: resourceMarketplaces,
    dataUpdatedAt: resourceMarketplacesUpdatedAt,
  } = useShoppingListData(1, 0, uniqueProductIds);

  // TODO: could just add adv building difference to basic to avoid repeating all those calcs for shared buildings
  const getMarketCostForBuildingList = useCallback((buildingIds) => {
    if (!resourceMarketplaces) return 0;

    // get instance of resourceMarketplaces that we can be destructive with
    const dynamicMarketplaces = cloneDeep(resourceMarketplaces);

    // split building list into granular orders
    const allOrders = buildingIds.reduce((acc, b) => {
      const inputs = Process.TYPES[Building.TYPES[b].processType].inputs;
      Object.keys(inputs).forEach((productId) => {
        acc.push({ productId, amount: inputs[productId] });
      });
      return acc;
    }, []);

    // sort by size desc
    allOrders.sort((a, b) => b.amount - a.amount);
    
    // walk through orders... for each, get best remaining price, then continue
    allOrders.forEach((order) => {
      let totalFilled = 0;
      let totalPaid = 0;
      if (dynamicMarketplaces[order.productId]) {

        // for each marketplace, set _dynamicUnitPrice for min(target, avail)
        dynamicMarketplaces[order.productId].forEach((row) => {
          let marketFills = ordersToFills(
            'buy',
            row.orders,
            Math.min(row.supply, order.amount),
            row.marketplace?.Exchange?.takerFee || 0,
            1,
            row.feeEnforcement || 1
          );
          const marketplaceCost = marketFills.reduce((acc, cur) => acc + cur.fillPaymentTotal, 0);
          const marketplaceFilled = marketFills.reduce((acc, cur) => acc + cur.fillAmount, 0);
          row._dynamicUnitPrice = marketplaceCost / marketplaceFilled;
        });

        // sort by _dynamicUnitPrice (asc)
        dynamicMarketplaces[order.productId].sort((a, b) => a._dynamicUnitPrice - b._dynamicUnitPrice);

        // process orders destructively until target met
        dynamicMarketplaces[order.productId].every((row) => {
          let marketFills = ordersToFills(
            'buy',
            row.orders,
            Math.min(row.supply, order.amount - totalFilled),
            row.marketplace?.Exchange?.takerFee || 0,
            1,
            row.feeEnforcement || 1,
            true
          );
          const marketplaceCost = marketFills.reduce((acc, cur) => acc + cur.fillPaymentTotal, 0);
          const marketplaceFilled = marketFills.reduce((acc, cur) => acc + cur.fillAmount, 0);

          row.supply -= marketplaceFilled;
          totalPaid += marketplaceCost;
          totalFilled += marketplaceFilled;
          return (totalFilled < order.amount);
        });

      }

      order.cost = totalPaid / TOKEN_SCALE[TOKEN.SWAY];
      if (totalFilled < order.amount) {
        console.warn(`Unable to fill productId ${order.productId}! ${totalFilled} < ${order.amount}`);
      }
    });

    return allOrders.reduce((acc, o) => acc + o.cost, 0);
  }, [resourceMarketplacesUpdatedAt]);

  const introPackSwayMin = useMemo(() => {
    const marketCost = getMarketCostForBuildingList(introBuildings);
    return (1 + MARKET_BUFFER) * marketCost;
  }, [getMarketCostForBuildingList]);

  const basicPackSwayMin = useMemo(() => {
    const marketCost = getMarketCostForBuildingList(basicBuildings);
    return (1 + MARKET_BUFFER) * marketCost;
  }, [getMarketCostForBuildingList]);

  const advPackSwayMin = useMemo(() => {
    const marketCost = getMarketCostForBuildingList(advBuildings);
    return (1 + MARKET_BUFFER) * marketCost;
  }, [getMarketCostForBuildingList]);

  return useMemo(() => {
    const introMinPrice = priceHelper.from(introPackPriceUSD * TOKEN_SCALE[TOKEN.USDC], TOKEN.USDC);
    const introMinSwayValue = priceHelper.from(introPackSwayMin * TOKEN_SCALE[TOKEN.SWAY], TOKEN.SWAY);
    const introCrewmatesValue = priceHelper.from(introPackCrewmates * adalianPrice.usdcValue, TOKEN.USDC);
    const introEthValue = priceHelper.from(wallet?.shouldMaintainGasReserve ? GAS_BUFFER_VALUE_USDC : 0, TOKEN.USDC);
    const introSwayValue = priceHelper.from(
      Math.max(
        introMinSwayValue.usdcValue,
        introMinPrice.usdcValue - introCrewmatesValue.usdcValue - introEthValue.usdcValue
      ),
      TOKEN.USDC
    );
    const introPrice = priceHelper.from(introCrewmatesValue.usdcValue + introEthValue.usdcValue + introSwayValue.usdcValue, TOKEN.USDC);

    const basicMinPrice = priceHelper.from(basicPackPriceUSD * TOKEN_SCALE[TOKEN.USDC], TOKEN.USDC);
    const basicMinSwayValue = priceHelper.from(basicPackSwayMin * TOKEN_SCALE[TOKEN.SWAY], TOKEN.SWAY);
    const basicCrewmatesValue = priceHelper.from(basicPackCrewmates * adalianPrice.usdcValue, TOKEN.USDC);
    const basicEthValue = priceHelper.from(wallet?.shouldMaintainGasReserve ? GAS_BUFFER_VALUE_USDC : 0, TOKEN.USDC);
    const basicSwayValue = priceHelper.from(
      Math.max(
        basicMinSwayValue.usdcValue,
        basicMinPrice.usdcValue - basicCrewmatesValue.usdcValue - basicEthValue.usdcValue
      ),
      TOKEN.USDC
    );
    const basicPrice = priceHelper.from(basicCrewmatesValue.usdcValue + basicEthValue.usdcValue + basicSwayValue.usdcValue, TOKEN.USDC);

    const advMinPrice = priceHelper.from(advPackPriceUSD * TOKEN_SCALE[TOKEN.USDC], TOKEN.USDC);
    const advMinSwayValue = priceHelper.from(advPackSwayMin * TOKEN_SCALE[TOKEN.SWAY], TOKEN.SWAY);
    const advCrewmatesValue = priceHelper.from(advPackCrewmates * adalianPrice.usdcValue, TOKEN.USDC);
    const advEthValue = basicEthValue;
    const advSwayValue = priceHelper.from(
      Math.max(
        advMinSwayValue.usdcValue,
        advMinPrice.usdcValue - advCrewmatesValue.usdcValue - advEthValue.usdcValue
      ),
      TOKEN.USDC
    );
    const advPrice = priceHelper.from(advCrewmatesValue.usdcValue + advEthValue.usdcValue + advSwayValue.usdcValue, TOKEN.USDC);

    return {
      intro: {
        price: introPrice,
        crewmates: introPackCrewmates,
        crewmatesValue: introCrewmatesValue,
        ethFormatted: introEthValue.to(TOKEN.ETH, TOKEN_FORMAT.VERBOSE),
        ethValue: introEthValue,
        swayFormatted: introSwayValue.to(TOKEN.SWAY, TOKEN_FORMAT.VERBOSE),
        swayValue: introSwayValue
      },
      basic: {
        price: basicPrice,
        crewmates: basicPackCrewmates,
        crewmatesValue: basicCrewmatesValue,
        ethFormatted: basicEthValue.to(TOKEN.ETH, TOKEN_FORMAT.VERBOSE),
        ethValue: basicEthValue,
        swayFormatted: basicSwayValue.to(TOKEN.SWAY, TOKEN_FORMAT.VERBOSE),
        swayValue: basicSwayValue
      },
      advanced: {
        price: advPrice,
        crewmates: advPackCrewmates,
        crewmatesValue: advCrewmatesValue,
        ethFormatted: advEthValue.to(TOKEN.ETH, TOKEN_FORMAT.VERBOSE),
        ethValue: advEthValue,
        swayFormatted: advSwayValue.to(TOKEN.SWAY, TOKEN_FORMAT.VERBOSE),
        swayValue: advSwayValue
      }
    };
  }, [adalianPrice, advPackSwayMin, basicPackSwayMin, introPackSwayMin, priceConstants, priceHelper]);
};

export const StarterPack = ({
  packLabel,
  shouldMaintainGasReserve = false,
  ...props
}) => {
  const { execute } = useContext(ChainTransactionContext);
  const { data: ethBalanceSource } = useEthBalance();
  const priceHelper = usePriceHelper();
  const { buildMultiswapFromSellAmount } = useSwapHelper();
  const packs = useStarterPackPricing();
  const { accountAddress } = useSession();

  // have to do it this way because purchase function is memoized before funding event
  const ethBalanceRef = useRef();
  ethBalanceRef.current = ethBalanceSource;

  const { pendingTransactions } = useCrewContext();
  const { fundingPrompt, onVerifyFunds } = useFundingFlow();

  const [isPurchasing, setIsPurchasing] = useState();

  const createAlert = useStore(s => s.dispatchAlertLogged);

  const { pack, color, colorLabel, checkMarks, crewmateAppearance, flairIcon, flavorText, name } = useMemo(() => ({
    pack: packs[packLabel],
    ...packUI[packLabel]
  }), [packLabel]);

  const isPurchasingStarterPack = useMemo(() => {
    return isPurchasing || (pendingTransactions || []).find(tx => tx.key === 'PurchaseStarterPack');
  }, [isPurchasing, pendingTransactions]);
  
  const onPurchase = useCallback(async (setIsPurchasing) => {
    const totalPrice = pack.price;
    const crewmateTally = pack.crewmates;
    const purchaseEth_usd = pack.ethValue.to(TOKEN.USDC);
    const purchaseSway_usd = pack.swayValue.to(TOKEN.USDC);

    if (setIsPurchasing) setIsPurchasing(true);

    let ethSwapCalls = await buildMultiswapFromSellAmount(purchaseEth_usd, TOKEN.ETH);
    // this means has no usdc (likely) OR illiquid swap (unlikely)... we'll assume the former.
    // can still allow the transaction to go through as long as has enough ETH to cover the
    // cost (and subsequent swaps will not leave without any gas buffer)
    if (ethSwapCalls === false) {
      if (priceHelper.from(ethBalanceRef.current, TOKEN.ETH).to(TOKEN.USDC) >= totalPrice.usdcValue) {
        ethSwapCalls = [];
      } else {
        createAlert({
          type: 'GenericAlert',
          data: { content: 'Insufficient ETH or USDC/ETH swap liquidity!' },
          level: 'warning',
          duration: 5000
        });
        if (setIsPurchasing) setIsPurchasing(false);
        return;
      }
    }
    const swaySwapCalls = await buildMultiswapFromSellAmount(purchaseSway_usd, TOKEN.SWAY);
    if (swaySwapCalls === false) {
      createAlert({
        type: 'GenericAlert',
        data: { content: 'Insufficient SWAY swap liquidity!' },
        level: 'warning',
        duration: 5000
      });
      if (setIsPurchasing) setIsPurchasing(false);
      return;
    }

    fireTrackingEvent('purchase', {
      category: 'purchase',
      currency: 'USD',
      externalId: accountAddress,
      value: Number(crewmateTally) * 5,
      items: [{
        item_name: `starter_pack_${packLabel}`
      }]
    });

    await execute('PurchaseStarterPack', {
      collection: Crewmate.COLLECTION_IDS.ADALIAN,
      crewmateTally,
      swapCalls: [ ...ethSwapCalls, ...swaySwapCalls ]
    });

    if (setIsPurchasing) setIsPurchasing(false);
  }, [accountAddress, buildMultiswapFromSellAmount, execute, pack, priceHelper]);

  const onClick = useCallback(() => {
    onVerifyFunds(
      pack.price,
      () => onPurchase((which) => {
        setIsPurchasing(which);
        if (props.setIsPurchasing) {
          props.setIsPurchasing(which);
        }
      })
    )
  }, [onVerifyFunds, onPurchase, packLabel, pack.price, props.setIsPurchasing]);

  // NOTE: for tinkering...
  // const overwriteAppearance = useMemo(() => Crewmate.packAppearance({
  //   ...Crewmate.unpackAppearance(crewmates[pack].appearance),
  //   clothes: 18,
  // }), [pack]);
  // if (pack === 'intro') {
  //   console.log('overwriting', overwriteAppearance);
  //   crewmateProps.appearance = overwriteAppearance;
  // }

  return (
    <>
      <StarterPackPurchaseForm
        color={colorLabel}
        onClick={props.asButton ? onClick : undefined}
        pack={pack}
        {...props}>
        <h2>
          <Flair color={color} style={packLabel === 'intro' ? { fontSize: '19px' } : {}}>{flairIcon}</Flair>
          <FlairCard>
            <CrewmateCardFramed
              isCaptain
              CrewmateCardProps={{
                gradientRGB: hexToRGB(color),
                useExplicitAppearance: true
              }}
              crewmate={{
                Crewmate: {
                  appearance: crewmateAppearance,
                  class: 0,
                  coll: Crewmate.COLLECTION_IDS.ADALIAN,
                }
              }}
              width={85} />
          </FlairCard>
          {name}
        </h2>
        <PackWrapper>
          <PackFlavor color={color} smaller={props.asButton}>{flavorText}</PackFlavor>
          <PackContents color={color}>
            <SKUHighlight color={color}>
              <SwayIcon />
              <span>{pack.swayFormatted}</span>
            </SKUHighlight>
            <SKUHighlight color={color}>
              <CrewmateCreditIcon />
              <span style={{ marginLeft: 8 }}>{pack.crewmates} Crewmate{pack.crewmates === 1 ? '' : 's'}</span>
            </SKUHighlight>
            {shouldMaintainGasReserve && (
              <SKUHighlight color={color}>
                <UserPrice
                  price={pack.ethValue.usdcValue}
                  priceToken={TOKEN.USDC}
                  format={TOKEN_FORMAT.SHORT} />
              </SKUHighlight>
            )}
          </PackContents>
          <PackChecks color={color}>
            {checkMarks.map((checkText, i) => (
              <div key={i}>
                <span><CheckIcon /></span>
                <label>{checkText}</label>
              </div>
            ))}
          </PackChecks>
        </PackWrapper>

        {!props.asButton && (
          <SKUButton
            isPurchasing={isPurchasingStarterPack}
            onClick={onClick}
            usdcPrice={pack.price.usdcValue}
          />
        )}
      </StarterPackPurchaseForm>
      {fundingPrompt}
    </>
  );
};

// TODO: wrap in launch feature flag
const StarterPackSKU = () => {
  return (
    <div>
      <SKUTitle>Buy Starter Packs</SKUTitle>
      <StarterPacksOuter>
        <StarterPack packLabel="intro" />
        <span style={{ width: 15 }} />
        <StarterPack packLabel="basic" />
        <span style={{ width: 15 }} />
        <StarterPack packLabel="advanced" />
      </StarterPacksOuter>
    </div>
  );
};

export default StarterPackSKU;
