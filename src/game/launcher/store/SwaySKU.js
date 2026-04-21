import { Fragment, useCallback, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import styled from 'styled-components';

import { SwayIcon } from '~/components/Icons';
import UncontrolledTextInput, { TextInputWrapper } from '~/components/TextInputUncontrolled';
import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useFundingFlow from '~/hooks/useFundingFlow';
import usePriceHelper from '~/hooks/usePriceHelper';
import useSession from '~/hooks/useSession';
import useStore from '~/hooks/useStore';
import useSwapHelper from '~/hooks/useSwapHelper';
import { TOKEN, TOKEN_FORMAT, TOKEN_SCALE } from '~/lib/priceUtils';
import { cleanseTxHash, fireTrackingEvent, nativeBool, reactBool, roundToPlaces } from '~/lib/utils';
import { PurchaseForm, PurchaseFormRows } from './components/PurchaseForm';
import SKUTitle from './components/SKUTitle';
import Button from '~/components/ButtonPill';
import UserPrice from '~/components/UserPrice';
import SKUButton from './components/SKUButton';
import SKUHighlight from './components/SKUHighlight';
import SKUInputRow from './components/SKUInputRow';

const Wrapper = styled.div`
  align-items: flex-end;
  display: flex;
  flex-direction: row;
  width: 100%;

  & h4 {
    color: #ccc;
    font-size: 90%;
    font-weight: normal;
    margin: 0 0 6px;
    opacity: 0.6;
  }
`;

const Description = styled.div`
  align-items: center;
  color: ${p => p.theme.colors.main};
  display: flex;
  flex-direction: row;
  font-size: 17px;
  line-height: 1.4em;
  padding-right: 20px;
  padding-bottom: 20px;
  & > div {
    color: white;
    font-size: 90px;
    text-align: center;
    width: 145px;
  }
  & > p {
    flex: 1;
    margin: 0 0 1em;
  }
`;

const PreselectRow = styled.div`
  display: flex;
  flex-direction: row;
  padding: 16px 0 25px;
  & > button {
    flex: 1;
    font-size: 105%;
    margin-left: 8px;
    &:first-child {
      margin-left: 0;
    }
  }
`;

const SwayExchangeRows = styled.div`
  padding-bottom: 20px;

  & > footer {
    color: #777;
    text-align: right;
    & > b {
      color: white;
      font-weight: normal;
    }
  }
`;

const preselectableUSDC = [5, 25, 50, 100];

const SwaySKU = () => {
  const { accountAddress, provider } = useSession();
  const { executeCalls } = useContext(ChainTransactionContext);
  const { fundingPrompt, onVerifyFunds } = useFundingFlow();
  const priceHelper = usePriceHelper();
  const { buildMultiswapFromSellAmount } = useSwapHelper();
  const queryClient = useQueryClient();

  const createAlert = useStore(s => s.dispatchAlertLogged);
  const preferredUiCurrency = useStore(s => s.getPreferredUiCurrency());

  const [eth, setETH] = useState();
  const [sway, setSway] = useState();
  const [usdc, setUSDC] = useState();
  const [isProcessing, setIsProcessing] = useState();

  const handleEthChange = useCallback((newValue) => {
    setETH(newValue);

    const value = priceHelper.from(newValue * TOKEN_SCALE[TOKEN.ETH], TOKEN.ETH);
    setUSDC(roundToPlaces(value.to(TOKEN.USDC) / TOKEN_SCALE[TOKEN.USDC], 2));
    setSway(roundToPlaces(value.to(TOKEN.SWAY) / TOKEN_SCALE[TOKEN.SWAY], 0));
  }, [priceHelper]);

  const handleSwayChange = useCallback((newValue) => {
    setSway(newValue);

    const value = priceHelper.from(newValue * TOKEN_SCALE[TOKEN.SWAY], TOKEN.SWAY);
    setETH(roundToPlaces(value.to(TOKEN.ETH) / TOKEN_SCALE[TOKEN.ETH], 6));
    setUSDC(roundToPlaces(value.to(TOKEN.USDC) / TOKEN_SCALE[TOKEN.USDC], 2));
  }, [priceHelper]);

  const handleUsdcChange = useCallback((newValue) => {
    setUSDC(newValue);

    const value = priceHelper.from(newValue * TOKEN_SCALE[TOKEN.USDC], TOKEN.USDC);
    setETH(roundToPlaces(value.to(TOKEN.ETH) / TOKEN_SCALE[TOKEN.ETH], 6));
    setSway(roundToPlaces(value.to(TOKEN.SWAY) / TOKEN_SCALE[TOKEN.SWAY], 0));
  }, [priceHelper]);

  const handlePreselect = useCallback((usdc) => {
    handleUsdcChange(usdc);
  }, []);

  useEffect(() => {
    if (preferredUiCurrency === TOKEN.ETH) {
      handleEthChange(0.01);
    } else {
      handleUsdcChange(preselectableUSDC[0]);
    }
  }, []);

  const onPurchase = useCallback(async () => {
    setIsProcessing(true);

    const unscaledUSDC = (usdc || 0) * TOKEN_SCALE[TOKEN.USDC];
    const multiswapCalls = await buildMultiswapFromSellAmount(unscaledUSDC, TOKEN.SWAY);
    if (!(multiswapCalls?.length > 0)) {
      setIsProcessing(false);
      createAlert({
        type: 'GenericAlert',
        data: { content: 'Insufficient swap liquidity! Try again later.' },
        level: 'warning',
        duration: 5000
      });

    // else, run the transactions(s)
    } else {
      try {
        fireTrackingEvent('purchase_sway', {
          externalId: accountAddress, category: 'purchase', amount: Number(unscaledUSDC)
        });

        const tx = await executeCalls(multiswapCalls);

        await provider.waitForTransaction(cleanseTxHash(tx), { retryInterval: 5e3 });

        // refetch all wallet balances
        queryClient.invalidateQueries({ queryKey: ['walletBalance'], refetchType: 'active' });

        // alert user
        createAlert({
          type: 'WalletAlert',
          data: { content: 'Sway swapped successfully.' },
          duration: 5000
        });

      } catch (e) {
        console.error(e);
      }
      setIsProcessing(false);
    }
  }, [
    accountAddress,
    buildMultiswapFromSellAmount,
    executeCalls,
    preferredUiCurrency,
    priceHelper,
    queryClient,
    usdc
  ]);

  const onClick = useCallback(() => {
    onVerifyFunds(
      priceHelper.from(usdc * TOKEN_SCALE[TOKEN.USDC], TOKEN.USDC),
      onPurchase
    )
  }, [onPurchase, onVerifyFunds, usdc]);

  return (
    <Wrapper>
      <div style={{ paddingRight: 20 }}>
        <SKUTitle>Buy Sway</SKUTitle>
        <Description>
          <div>
            <SwayIcon />
          </div>
          <p>
            The Standard Weighted Adalia Yield (SWAY) is the single currency used 
            for transacting in Adalia. It is purchased on a decentralized exchange 
            from the pool of community sellers.
          </p>
        </Description>
      </div>
      <PurchaseForm>
        <h3>Sway Packages</h3>
        <div style={{ padding: '0 10px' }}>
          <PreselectRow>
            {preselectableUSDC.map((amount, i) => (
              <Fragment key={amount}>
                {/* for width, smallest package for ETH users is skipped */}
                {!(preferredUiCurrency === TOKEN.ETH && i === 0) && (
                  <Button
                    active={amount === usdc}
                    lessTransparent
                    onClick={() => handlePreselect(amount)}>
                    <UserPrice
                      price={amount * TOKEN_SCALE[TOKEN.USDC]}
                      priceToken={TOKEN.USDC}
                      format={TOKEN_FORMAT.SHORT} />
                  </Button>
                )}
              </Fragment>
            ))}
          </PreselectRow>

          <SwayExchangeRows>
            <h4>or Specify Amount</h4>

            {preferredUiCurrency === TOKEN.USDC && (
              <SKUInputRow>
                <TextInputWrapper rightLabel="USD">
                  <UncontrolledTextInput
                    min={0.01}
                    disabled={reactBool(isProcessing)}
                    onChange={(e) => handleUsdcChange(e.currentTarget.value)}
                    step={0.01}
                    type="number"
                    value={usdc || ''} />
                </TextInputWrapper>
              </SKUInputRow>
            )}

            {preferredUiCurrency === TOKEN.ETH && (
              <SKUInputRow>
                <TextInputWrapper rightLabel="ETH">
                  <UncontrolledTextInput
                    min={0.00001}
                    disabled={reactBool(isProcessing)}
                    onChange={(e) => handleEthChange(e.currentTarget.value)}
                    step={0.00001}
                    type="number"
                    value={eth || ''} />
                </TextInputWrapper>
              </SKUInputRow>
            )}

            <SKUInputRow>
              <TextInputWrapper rightLabel="SWAY">
                <UncontrolledTextInput
                  min={1}
                  disabled={reactBool(isProcessing)}
                  onChange={(e) => handleSwayChange(e.currentTarget.value)}
                  step={1}
                  type="number"
                  value={sway || ''} />
              </TextInputWrapper>
            </SKUInputRow>

            <footer>Powered by <b>AVNU</b></footer>
          </SwayExchangeRows>

          <div style={{ paddingBottom: 10 }}>
            <h4>Receive</h4>
            <SKUHighlight>
              <SwayIcon /> {(sway || 0).toLocaleString()}
            </SKUHighlight>
          </div>

          <SKUButton
            isPurchasing={isProcessing}
            onClick={onClick}
            usdcPrice={usdc * TOKEN_SCALE[TOKEN.USDC]}
            style={{ width: '100%' }}
          />
        </div>
      </PurchaseForm>
      {fundingPrompt}
    </Wrapper>
  );
};

export default SwaySKU;
