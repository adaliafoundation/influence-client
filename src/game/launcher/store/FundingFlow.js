import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import { createPortal } from 'react-dom';
import { PropagateLoader as Loader, PuffLoader as AltLoader } from 'react-spinners';

import { appConfig } from '~/appConfig';
import Button from '~/components/ButtonAlt';
import { ChevronRightIcon, CloseIcon, WalletIcon } from '~/components/Icons';
import Details from '~/components/DetailsV2';
import useSession from '~/hooks/useSession';
import BrightButton from '~/components/BrightButton';
import useWalletPurchasableBalances from '~/hooks/useWalletPurchasableBalances';
import UserPrice from '~/components/UserPrice';
import { TOKEN, TOKEN_FORMAT, TOKEN_FORMATTER, TOKEN_SCALE } from '~/lib/priceUtils';
import usePriceHelper from '~/hooks/usePriceHelper';
import useStore from '~/hooks/useStore';
import EthFaucetButton from './components/EthFaucetButton';
import { areChainsEqual, fireTrackingEvent, resolveChainId, safeBigInt } from '~/lib/utils';
import api from '~/lib/api';
import PageLoader from '~/components/PageLoader';

const layerSwapChains = {
  SN_MAIN: { ethereum: 'ETHEREUM_MAINNET', starknet: 'STARKNET_MAINNET' },
  SN_SEPOLIA: { ethereum: 'ETHEREUM_SEPOLIA', starknet: 'STARKNET_SEPOLIA' }
};

const FundingBody = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  margin: 0 30px;
  padding: 5px 0;
  width: 450px;
  h3 {
    align-items: center;
    color: ${p => p.theme.colors.warning};
    display: flex;
    font-size: 16px;
    font-weight: normal;
    & > svg {
      font-size: 30px;
      margin-right: 16px;
    }
  }
`;

const FundingButtons = styled.div`
  padding: 0px 0 20px;
  width: 100%;
  & button {
    margin-bottom: 10px;
    padding: 15px 10px;
    text-transform: none;
    width: 100%;
    & > div {
      align-items: center;
      display: flex;
      justify-content: center;
      & > span {
        flex: 1;
        text-align: left;
      }
    }
  }
  & h4 {
    align-items: flex-end;
    font-weight: normal;
    margin: 0 0 10px;
    text-transform: uppercase;

    display: flex;
    flex-direction: row;
    & > span {
      flex: 1;
    }
    & > label {
      opacity: 0.5;
      font-size: 13px;
      text-transform: none;
      &:hover {
        opacity: 0.8;
      }
    }
  }
`;

const Disclaimer = styled.div`
  color: ${p => p.theme.colors.main};
  font-size: 12px;
  padding: 10px 10px 20px;
  pointer-events: ${p => p.visible ? 'all' : 'none'};
  & a {
    color: white;
    text-decoration: none;
    &:hover {
      text-decoration: underline;
    }
  }
`;

const Receipt = styled.div`
  margin-bottom: 30px;
  width: 100%;
  & > div {
    align-items: center;
    display: flex;
    flex-direction: row;
    height: 30px;
    & > label {
      opacity: 0.5;
      flex: 1;
    }
    &:last-child {
      border-top: 1px solid #333;
      color: ${p => p.theme.colors.warning};
      margin-top: 4px;
      height: 38px;
      & > span {
        // color: ${p => p.theme.colors.warning};
        font-weight: bold;
      }
    }
  }
`;

const ButtonRow = styled.div`
  display: flex;
  flex-direction: row;
  & > button {
    margin-right: 10px;
    &:last-child {
      margin-right: 0;
    }
  }
`;

const Collapsible = styled.div`
  height: 26px;
  overflow: visible hidden;
  transition: height 150ms ease;

  & > h4 {
    border-bottom: 1px solid #333;
    padding-bottom: 6px;

    cursor: ${p => p.theme.cursors.active};
    opacity: 0.5;
    transition: opacity 150ms ease;
    & > svg {
      transition: transform 150ms ease;
    }
  }
  & > ${ButtonRow} {
    padding: 0 3px;
  }

  &:hover {
    height: 92px;
    & > h4 {
      border-bottom-color: transparent;
      opacity: 1;
      & > svg {
        transform: rotate(90deg);
      }
    }
  }
`;

const GiantIcon = styled.div`
  align-items: center;
  background: rgba(${p => p.theme.colors.mainRGB}, 0.2);
  border-radius: 60px;
  color: ${p => p.theme.colors.main};
  display: flex;
  font-size: 65px;
  height: 115px;
  justify-content: center;
  margin: 40px 0 10px;
  width: 115px;
`;
const WaitingWrapper = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  padding-top: 10px;
  width: 360px;

  & > div {
    align-items: center;
    display: flex;
    flex-direction: column;
    text-align: center;
    & > h4 {
      margin: 20px 0 0;
    }
    & > small {
      opacity: 0.5;
    }
    & > button {
      margin-top: 20px;
    }
  }

  & > footer {
    align-items: center;
    border-top: 1px solid #333;
    display: flex;
    flex-direction: row;
    flex: 0 0 60px;
    justify-content: center;
    margin-top: 40px;
    width: 100%;
    & > div {
      align-items: center;
      background: #333;
      border-radius: 6px;
      display: flex;
      height: 36px;
      justify-content: center;
      width: 225px;
      & > * {
        margin-top: -10px;
        margin-left: -10px;
        opacity: 0.25;
      }
    }
  }
`;

const LoaderWrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 400px;
  width: 400px;
`;

export const FundingFlow = ({ totalPrice, onClose, onFunded }) => {
  const createAlert = useStore(s => s.dispatchAlertLogged);

  const { accountAddress, chainId, walletId } = useSession();
  const priceHelper = usePriceHelper();
  const { data: wallet, refetch: refetchBalances } = useWalletPurchasableBalances();
  const preferredUiCurrency = useStore(s => s.getPreferredUiCurrency());

  const [banxaing, setBanxaing] = useState();
  const [waiting, setWaiting] = useState();

  const startingBalance = useRef();

  const [debug, setDebug] = useState(0);

  // TODO: technically could wait to start polling until page is focused again
  useEffect(() => {
    // if (waiting && !debug) {
    //   setTimeout(() => {
    //     console.log('hack', startingBalance.current, wallet.tokenBalances); // tokenBalances
    //     startingBalance.current[TOKEN.ETH] -= safeBigInt(1e14);
    //     setDebug(1);
    //   }, 5000);
    // }
    if (waiting && !!wallet) {
      if (!startingBalance.current) startingBalance.current = { ...wallet.tokenBalances };
      const i = setInterval(() => {
        refetchBalances();
        // if (debug === 1) setDebug(2); // TODO: deprecate
      }, 10e3);
      return () => {
        if (i) clearInterval(i);
      };
    }
  }, [waiting, !!wallet, debug]);

  useEffect(() => {
    // if there is an actual increase in currency of a token (i.e. not just an
    // increase in value b/c we don't want a trigger on exchange rate changes)
    if (waiting && startingBalance.current) {
      const increaseToken = Object.keys(startingBalance.current).find((token) => {
        return (wallet.tokenBalances[token] > startingBalance.current[token])
      });
      if (increaseToken) {
        const increaseAmount = wallet.tokenBalances[increaseToken] - startingBalance.current[increaseToken];

        // alert
        createAlert({
          type: 'GenericAlert',
          data: { content: <>{TOKEN_FORMATTER[increaseToken](safeBigInt(increaseAmount), TOKEN_FORMAT.VERBOSE)} of funds received.</> },
          duration: 5e3
        });

        // reset state
        setWaiting(false);
        startingBalance.current = null;

        // callbacks
        // if there are now sufficient funds (or there was no target price), call onFunded && onClose
        // else (there is an unmet totalPrice), keep flow open (but will be back at beginning)
        if (!totalPrice || wallet.combinedBalance.usdcValue > totalPrice.usdcValue) {
          // console.log('FUNDING FLOW', { wallet, combinedBalance: wallet?.combinedBalance })
          if (onFunded) onFunded();
          if (onClose) onClose();
        }
      }
    }
  }, [debug, waiting, wallet?.tokenBalances])

  const [walletBalance, fundsNeeded] = useMemo(
    () => {
      if (!wallet) return [];
      const balance = wallet.combinedBalance;
      let needed;
      if (totalPrice) {
        needed = totalPrice.clone();
        needed.usdcValue -= balance.usdcValue;
      }
      return [balance, needed];
    },
    [priceHelper, totalPrice, wallet]
  );

  const suggestedAmounts = useMemo(() => {
    if (!fundsNeeded) return [10e6, 25e6, 50e6];

    const needed = Math.ceil(fundsNeeded.to(TOKEN.USDC));
    if (needed < 20e6) return [needed, 25e6, 50e6];
    if (needed < 40e6) return [needed, 50e6, 100e6];
    if (needed < 80e6) return [needed, 100e6, 250e6];
    if (needed < 200e6) return [needed, 250e6, 500e6];
    return [needed]
  }, [fundsNeeded]);

  const [banxaOrder, setBanxaOrder] = useState({});

  const checkBanxaOrder = useCallback(async (purchase) => {
    console.log('Checking Banxa order', purchase);
    if (!purchase?.id) return;

    const order = await api.getBanxaOrder(purchase.id);
    if (order?.id) {
      setBanxaOrder((o) => ({ ...o, order }));
    }
  }, []);

  useEffect(() => {
    if (banxaOrder) {
      const i = setInterval(() => { checkBanxaOrder(banxaOrder); }, 5000);
      return () => clearInterval(i);
    }
  }, [checkBanxaOrder, banxaOrder]);

  const onClickCC = useCallback((amount) => async () => {
    fireTrackingEvent('funding_start', { externalId: accountAddress });

    try {
      setBanxaing(true);

      const order = await api.createBanxaOrder({ 
        // TODO: should this be the USDC amount instead?
        // TODO: can alternatively support an amount in crypto here too
        usd: Math.ceil(amount / TOKEN_SCALE[TOKEN.USDC]), // <-- this is the fiat amount (fees deducted mean will result in less USDC than this)
        crypto: 'USDC'
      });
      if (!order?.checkoutUrl) throw new Error('Banxa order creation returned empty');

      setBanxaOrder(order);
    } catch (error) {
      console.error('Error fetching Banxa checkout URL:', error);
      fireTrackingEvent('funding_error', { externalId: accountAddress });
    }
  }, [accountAddress]);

  const [layerswapUrl, setLayerswapUrl] = useState();
  const onClickLayerswap = useCallback(() => {
    let amount;
    if (fundsNeeded) {
      const swapAmount = fundsNeeded.clone();
      swapAmount.usdcValue *= 1.1;
      amount = Math.ceil(swapAmount.to(TOKEN.USDC));
    }

    setLayerswapUrl(
      `https://layerswap.io/app/?${
        new URLSearchParams({
          clientId: appConfig.get('Api.ClientId.layerswap'),
          amount,
          to: layerSwapChains[resolveChainId(chainId)]?.starknet,
          toAsset: 'USDC',
          destAddress: accountAddress,
          lockTo: true,
          lockToAsset: true,
          lockAddress: true,
          actionButtonText: 'Fund Account'
        }).toString()
      }`
    );
  }, [accountAddress, fundsNeeded]);

  const onClickStarkgate = useCallback(() => {
    const url = `https://${areChainsEqual('SN_SEPOLIA', chainId) ? 'sepolia.' : ''}starkgate.starknet.io/`;

    window.open(url, '_blank');
    setWaiting(true);
  }, []);

  const onFaucetError = useCallback(() => {
    createAlert({
      type: 'GenericAlert',
      data: { content: 'Faucet request failed, please try again later.' },
      level: 'warning',
      duration: 5000
    });
    onClose();
  }, [onClose]);

  const banxaOrderStatusMessage = useMemo(() => {
    switch (banxaOrder?.status) {
      case 'pendingPayment': return 'Awaiting payment...';
      case 'waitingPayment': return 'Processing payment...';
      case 'paymentReceived': return 'Payment received, processing...';
      case 'inProgress': return 'Final verification, processing...';
      case 'cryptoTransferred': return 'Crypto transfer initiated...';

      case 'cancelled': return 'Order has been cancelled by Banxa due to internal risk and compliance alerts.';
      case 'declined': return 'Payment method declined.';
      case 'expired': return 'Checkout has expired. Please start over.';
    };
  }, [banxaOrder?.status]);

  const hasTrackedExecution = useRef(false);

  useEffect(() => {
    // as it's not pending, after pendingPayment, we know user has (attempted to) submit payment
    // (just fire once per flow though)
    if (banxaOrder?.status && banxaOrder?.status !== 'pendingPayment') {
      if (!hasTrackedExecution.current) {
        fireTrackingEvent('funding_payment_executed', { externalId: accountAddress });
        hasTrackedExecution.current = true;
      }
    }

    // error: track but let Banxa explain (and user can close dialog)
    if (['cancelled', 'declined', 'expired', 'extraVerification'].includes(banxaOrder?.status)) {
      fireTrackingEvent('funding_error', { externalId: accountAddress, status: banxaOrder?.status });
    }

    // complete: we close for them and switch to waiting state
    else if (['complete'].includes(banxaOrder?.status)) {
      // fire success
      fireTrackingEvent('funding_success', { externalId: accountAddress });

      // clear purchase
      setBanxaOrder();
      setBanxaing(); // (this should be redundant)
      setWaiting(true);
    }

  }, [banxaOrder?.status]);

  return createPortal(
    (
      <Details
        title={fundsNeeded ? 'Insufficient Funds' : 'Add Funds'}
        onClose={onClose}
        modalMode
        style={{ zIndex: 9000 }}>
        {!waiting && !banxaing && !layerswapUrl && (
          <FundingBody>
            {fundsNeeded && (
              <Receipt>
                <div>
                  <label>Available Balance {/* TODO: based on settings + gas buffer (hide for Web2 / or use tooltip for both) */}(USDC + ETH)</label>
                  <span>{walletBalance.to(preferredUiCurrency, true)}</span>
                </div>
                <div>
                  <label>Purchase Total</label>
                  <span>{totalPrice.to(preferredUiCurrency, true)}</span>
                </div>
                <div>
                  <label>
                    Funding Required
                  </label>
                  <span>{fundsNeeded.to(preferredUiCurrency, true)}</span>
                </div>
              </Receipt>
            )}

            {walletId === 'argentWebWallet' && (
              <FundingButtons>

                {appConfig.get('Starknet.chainId') === '0x534e5f5345504f4c4941' && (
                  <>
                    <h4>
                      <span>Request Free ETH</span>
                    </h4>
                    <ButtonRow style={{ marginBottom: 10 }}>
                      <EthFaucetButton
                        onError={onFaucetError}
                        onProcessing={(started) => setWaiting(!!started)} />
                    </ButtonRow>
                  </>
                )}

                <h4>
                  <span>Recharge Wallet</span>
                </h4>
                <ButtonRow>
                  {suggestedAmounts.map((usdc, i) => (
                    <BrightButton key={usdc} onClick={onClickCC(usdc)}>
                      + <UserPrice price={usdc} priceToken={TOKEN.USDC} format={(fundsNeeded && i === 0) ? true : TOKEN_FORMAT.SHORT} />
                    </BrightButton>
                  ))}
                </ButtonRow>

                {/* TODO: start off collapsed */}
                <Collapsible style={{ marginTop: 10 }}>
                  <h4><span>Advanced Options</span><ChevronRightIcon /></h4>
                  <ButtonRow>
                    <BrightButton subtle onClick={onClickStarkgate}>
                      <span>Bridge from L1</span>
                      <ChevronRightIcon />
                    </BrightButton>
                    <BrightButton subtle onClick={onClickLayerswap}>
                      <span>Swap on L2</span>
                      <ChevronRightIcon />
                    </BrightButton>
                  </ButtonRow>
                </Collapsible>
              </FundingButtons>
            )}

            {walletId !== 'argentWebWallet' && (
              <FundingButtons>
                {appConfig.get('Starknet.chainId') === '0x534e5f5345504f4c4941' && (
                  <EthFaucetButton
                    onError={onFaucetError}
                    onProcessing={(started) => setWaiting(!!started)} />
                )}

                <BrightButton onClick={onClickStarkgate}>
                  <span>Bridge Funds from L1</span>
                  <ChevronRightIcon />
                </BrightButton>

                <ButtonRow>
                  <BrightButton subtle onClick={onClickLayerswap}>
                    <span>Swap L2 Funds</span> <ChevronRightIcon />
                  </BrightButton>
                  <BrightButton subtle onClick={onClickCC(suggestedAmounts[0])}>
                    <span>Purchase L2 Funds</span> <ChevronRightIcon />
                  </BrightButton>
                </ButtonRow>
              </FundingButtons>
            )}
          </FundingBody>
        )}
        {banxaing && (
          <>
            {banxaOrder?.checkoutUrl
              ? <iframe src={banxaOrder.checkoutUrl} style={{ border: 0, maxWidth: 'calc(100vw - 40px)', minHeight: '80vh', width: 425 }} />
              : <LoaderWrapper><PageLoader message="Generating Checkout..." /></LoaderWrapper>
            }
          </>
        )}
        {layerswapUrl && (
          <>
            <iframe src={layerswapUrl} style={{ border: 0, width: '450px', height: '600px' }} />
            <div style={{ display: 'flex', flexDirection: 'row', padding: '10px 0' }}>
              <Button onClick={() => setLayerswapUrl()}>Cancel</Button>
              <div style={{ flex: 1 }} />
              <Button onClick={() => { setLayerswapUrl(); setWaiting(true); }}>Finished</Button>
            </div>
          </>
        )}
        {waiting && (
          <WaitingWrapper>
            <div>
              <GiantIcon>
                <WalletIcon />
              </GiantIcon>
              <h4>
                {banxaOrder && banxaOrder?.status !== 'complete'
                  ? banxaOrderStatusMessage
                  : `Waiting for funds to be received...`
                }
              </h4>
              <small>(this may take several moments)</small>
              <Button size="small" onClick={() => setWaiting(false)}>
                <CloseIcon /> <span>Cancel</span>
              </Button>
            </div>
            <footer>
              <div>
                <Loader color="white" size="12px" />
              </div>
            </footer>
          </WaitingWrapper>
        )}
      </Details>
    ),
    document.body
  );
};

export default FundingFlow;