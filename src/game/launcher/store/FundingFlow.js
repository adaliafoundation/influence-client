import { features } from '~/appConfig/features';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { createPortal } from 'react-dom';
import { PropagateLoader as Loader } from 'react-spinners';
import { Tooltip } from 'react-tooltip';

import { appConfig } from '~/appConfig';
import AvnuLogo from '~/assets/images/sales/logo_avnu.svg';
import LayerswapIcon from '~/assets/images/sales/logo_layerswap_icon.svg';
import StarknetIcon from '~/assets/images/starknet-icon.png';
import Button from '~/components/ButtonAlt';
import { ChevronRightIcon, CloseIcon, EthIcon, UpdateIcon, WalletIcon } from '~/components/Icons';
import Details from '~/components/DetailsV2';
import IconButton from '~/components/IconButton';
import useSession from '~/hooks/useSession';
import useWalletPurchasableBalances from '~/hooks/useWalletPurchasableBalances';
import { useUSDCBalance } from '~/hooks/useWalletTokenBalance';
import { TOKEN, TOKEN_FORMAT, TOKEN_FORMATTER, TOKEN_SCALE } from '~/lib/priceUtils';
import useStore from '~/hooks/useStore';
import EthFaucetButton from './components/EthFaucetButton';
import { areChainsEqual, fireTrackingEvent, nativeBool, resolveChainId } from '~/lib/utils';
import api from '~/lib/api';
import { BANXA_DEFAULTS, createClientFundingIntent, normalizeBanxaOrder, parseBanxaReturnUrl } from '~/lib/funding';

const layerSwapChains = {
  SN_MAIN: { ethereum: 'ETHEREUM_MAINNET', starknet: 'STARKNET_MAINNET' },
  SN_SEPOLIA: { ethereum: 'ETHEREUM_SEPOLIA', starknet: 'STARKNET_SEPOLIA' }
};

const AVNU_APP_URL = 'https://app.avnu.fi/';

const FundingBody = styled.div`
  align-items: center;
  display: flex;
  flex-direction: column;
  margin: 0 30px;
  padding: 5px 0;
  width: 450px;
`;

const FundingButtons = styled.div`
  padding: 0 0 20px;
  width: 100%;

  & > button {
    margin-bottom: 10px;
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
`;

const FundingOptionButton = styled(Button)`
  & > div {
    min-height: 50px;
  }
`;

const SecondaryOptionsToggle = styled.button`
  align-items: center;
  background: transparent;
  border: 0;
  color: ${p => p.theme.colors.main};
  cursor: ${p => p.theme.cursors.active};
  display: inline-flex;
  font-family: 'Jura', sans-serif;
  font-size: 15px;
  gap: 6px;
  margin: 2px 0 8px;
  opacity: 0.8;
  padding: 0;
  text-transform: none;

  &:hover {
    color: ${p => p.theme.colors.brightMain};
    opacity: 1;
  }

  & > svg {
    font-size: 14px;
    transform: rotate(${p => p.$open ? '-90deg' : '90deg'});
    transition: transform 100ms ease;
  }
`;

const SecondaryOptions = styled.div`
  border-top: ${p => p.$primary ? 'none' : '1px solid #333'};
  margin-top: ${p => p.$primary ? 0 : 10}px;
  padding-top: ${p => p.$primary ? 0 : 10}px;
`;

const AdvancedOptionButton = styled.button`
  align-items: center;
  background: transparent;
  border: 0;
  border-bottom: 1px solid #222;
  color: ${p => p.theme.colors.main};
  cursor: ${p => p.theme.cursors.active};
  display: flex;
  font-family: 'Jura', sans-serif;
  font-size: 16px;
  gap: 12px;
  height: 48px;
  padding: 0 4px;
  text-align: left;
  text-transform: none;
  transition: color 100ms ease, background 100ms ease;
  width: 100%;

  &:hover:not(:disabled) {
    background: rgba(${p => p.theme.colors.mainRGB}, 0.08);
    color: white;
  }

  &:disabled {
    color: ${p => p.theme.colors.disabledText};
    cursor: ${p => p.theme.cursors.default};
  }

  & label {
    flex: 1;
  }

  & > span:last-child {
    align-items: center;
    display: inline-flex;
    justify-content: flex-end;
  }
`;

const AdvancedOptionIcon = styled.span`
  align-items: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid #333;
  border-radius: 4px;
  color: white;
  display: inline-flex;
  flex: 0 0 30px;
  font-size: 16px;
  font-weight: bold;
  height: 30px;
  justify-content: center;
  overflow: hidden;
  width: 30px;

  & img {
    display: block;
    height: 22px;
    object-fit: contain;
    width: 22px;
  }

  & svg {
    display: block;
    height: 22px;
    width: 22px;
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

    & > span {
      font-weight: bold;
    }
  }
`;

const BalanceActions = styled.div`
  align-items: center;
  display: flex;
  gap: 8px;

  & button {
    align-items: center;
    background: transparent;
    border: 0;
    color: ${p => p.theme.colors.main};
    cursor: ${p => p.theme.cursors.active};
    display: inline-flex;
    font-size: 18px;
    padding: 0;

    &:hover {
      color: ${p => p.theme.colors.brightMain};
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

const EmbeddedCheckoutOverlay = styled.div`
  align-items: center;
  background: rgba(0, 0, 0, 0.82);
  display: flex;
  inset: 0;
  justify-content: center;
  position: fixed;
  z-index: 10000;
`;

const EmbeddedCheckoutContainer = styled.div`
  border-radius: 8px;
  max-height: calc(100vh - 40px);
  overflow: hidden;
  width: min(520px, calc(100vw - 40px));

  & > iframe {
    border: 0;
    display: block;
    height: min(760px, calc(100vh - 40px));
    width: 100%;
  }
`;

const EmbeddedCheckoutCloseButton = styled(IconButton)`
  background: rgba(0, 0, 0, 0.75);
  position: fixed !important;
  right: 24px;
  top: 24px;
  z-index: 10001;
`;

const SwapConfirmation = styled.div`
  padding: 10px 30px 25px;
  width: 450px;

  & > p {
    color: #ccc;
    font-size: 16px;
    line-height: 1.4em;
    margin: 0 0 22px;
  }

  & b {
    color: white;
    font-weight: normal;
  }
`;

const getSuggestedAmounts = (fundsNeeded) => {
  if (!fundsNeeded) return [10e6, 25e6, 50e6];

  const needed = Math.max(TOKEN_SCALE[TOKEN.USDC], Math.ceil(fundsNeeded.to(TOKEN.USDC)));
  if (needed < 20e6) return [needed, 25e6, 50e6];
  if (needed < 40e6) return [needed, 50e6, 100e6];
  if (needed < 80e6) return [needed, 100e6, 250e6];
  if (needed < 200e6) return [needed, 250e6, 500e6];
  return [needed];
};

export const TokenList = ({ items }) => (
  <>
    {items.map((item, index) => (
      <span key={item.token}>
        {index > 0 && (index === items.length - 1 ? ' and ' : ', ')}
        {item.label}
      </span>
    ))}
  </>
);

const getBanxaCheckoutErrorMessage = (error) => {
  const serverMessage = error?.response?.data?.message || error?.response?.data?.error || error?.message;
  if (/wallet must be deployed/i.test(serverMessage || '')) {
    return 'Your wallet is still being prepared. Please try again in a moment.';
  }
  return 'Banxa funding is temporarily unavailable. Please try another funding option.';
};

const BanxaEmbeddedCheckout = ({ checkoutUrl, onClose, onLoad }) => {
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return createPortal(
    <EmbeddedCheckoutOverlay onClick={onClose} role="presentation">
      <EmbeddedCheckoutCloseButton
        borderless
        dataFor="launcherTooltip"
        dataPlace="left"
        dataTip="Close checkout"
        onClick={onClose}>
        <CloseIcon />
      </EmbeddedCheckoutCloseButton>
      <EmbeddedCheckoutContainer
        aria-label="Banxa Checkout"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        role="dialog">
        <iframe onLoad={onLoad} src={checkoutUrl} title="Banxa hosted checkout" />
      </EmbeddedCheckoutContainer>
    </EmbeddedCheckoutOverlay>,
    document.body
  );
};

export const FundingFlow = ({ mode, primaryAction, swapRequirements = [], totalPrice, onClose, onFunded }) => {
  const createAlert = useStore(s => s.dispatchAlertLogged);

  const { accountAddress, chainId } = useSession();
  const activeFundingIntent = useStore(s => {
    const intent = s.activeFundingIntentId ? s.fundingIntents?.[s.activeFundingIntentId] : null;
    return intent?.provider === 'banxa' && intent.accountAddress === accountAddress ? intent : null;
  });
  const dispatchFundingIntentStarted = useStore(s => s.dispatchFundingIntentStarted);
  const dispatchFundingIntentUpdated = useStore(s => s.dispatchFundingIntentUpdated);
  const { data: wallet, refetch: refetchBalances } = useWalletPurchasableBalances();
  const { data: usdcBalance = 0n, refetch: refetchUsdcBalance } = useUSDCBalance();

  const [banxaUrl, setBanxaUrl] = useState();
  const [creatingBanxaOrder, setCreatingBanxaOrder] = useState(false);
  const [layerswapUrl, setLayerswapUrl] = useState();
  const [showSecondaryOptions, setShowSecondaryOptions] = useState(false);

  const fundsNeeded = useMemo(
    () => {
      if (!totalPrice) return;
      const needed = totalPrice.clone();
      needed.usdcValue = Math.max(0, needed.usdcValue - Number(usdcBalance));
      return needed;
    },
    [totalPrice, usdcBalance]
  );

  const fundingAction = primaryAction || (totalPrice && fundsNeeded?.usdcValue === 0 && onFunded
    ? { label: 'Continue', onClick: onFunded }
    : null);

  const suggestedAmounts = useMemo(() => getSuggestedAmounts(fundsNeeded), [fundsNeeded]);
  const onClickBanxa = useCallback((amount) => async () => {
    fireTrackingEvent('funding_start', { externalId: accountAddress, provider: 'banxa' });

    try {
      setCreatingBanxaOrder(true);

      const amountUsdc = Math.ceil(amount / TOKEN_SCALE[TOKEN.USDC]);
      const order = normalizeBanxaOrder(await api.createBanxaCheckout({
        blockchain: BANXA_DEFAULTS.blockchain,
        crypto: BANXA_DEFAULTS.crypto,
        fiat: BANXA_DEFAULTS.fiat,
        fiatAmount: String(Math.max(Number(appConfig.get('Banxa.minFiat') || 11), amountUsdc)),
        returnUrl: window.location.href,
        walletAddress: accountAddress
      }));

      if (!order.id || !order.checkoutUrl) throw new Error('Banxa order creation returned empty');

      const fundingIntent = createClientFundingIntent({
        accountAddress,
        amountUsdc,
        checkoutUrl: order.checkoutUrl,
        orderId: order.id,
        providerStatus: order,
        startingTokenBalances: wallet?.tokenBalances,
        status: order.status,
        statusUrl: order.statusUrl,
        targetUsdcValue: totalPrice?.usdcValue
      });
      dispatchFundingIntentStarted(fundingIntent);
      setBanxaUrl(order.checkoutUrl);
    } catch (error) {
      createAlert({
        type: 'GenericAlert',
        data: { content: getBanxaCheckoutErrorMessage(error) },
        level: 'warning',
        duration: 5000
      });
      console.error('Error creating Banxa order:', error);
      fireTrackingEvent('funding_error', { externalId: accountAddress, provider: 'banxa' });
    } finally {
      setCreatingBanxaOrder(false);
    }
  }, [accountAddress, createAlert, dispatchFundingIntentStarted, totalPrice?.usdcValue, wallet?.tokenBalances]);

  const onBanxaFrameLoad = useCallback((event) => {
    if (!activeFundingIntent?.id || !event.currentTarget) return;

    try {
      const returnData = parseBanxaReturnUrl({
        baseUrl: appConfig.get('Api.banxa'),
        href: event.currentTarget.contentWindow.location.href
      });
      if (!returnData) return;

      dispatchFundingIntentUpdated(activeFundingIntent.id, returnData);
      setBanxaUrl();
    } catch (e) {
      // Cross-origin iframe locations are expected while the player is in Banxa checkout.
    }
  }, [activeFundingIntent?.id, dispatchFundingIntentUpdated]);

  const closeBanxaCheckout = useCallback(() => {
    setBanxaUrl();
  }, []);

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
  }, [accountAddress, chainId, fundsNeeded]);

  const onClickStarkgate = useCallback(() => {
    const url = `https://${areChainsEqual('SN_SEPOLIA', chainId) ? 'sepolia.' : ''}starkgate.starknet.io/`;

    window.open(url, '_blank');
  }, [chainId]);

  const onClickAvnu = useCallback(() => {
    window.open(AVNU_APP_URL, '_blank', 'noopener');
  }, []);

  const onRefreshBalance = useCallback(() => {
    refetchBalances();
    refetchUsdcBalance();
  }, [refetchBalances, refetchUsdcBalance]);

  const onFaucetError = useCallback(() => {
    createAlert({
      type: 'GenericAlert',
      data: { content: 'Faucet request failed, please try again later.' },
      level: 'warning',
      duration: 5000
    });
    onClose();
  }, [createAlert, onClose]);

  return (
    <>
      {banxaUrl && (
        <BanxaEmbeddedCheckout
          checkoutUrl={banxaUrl}
          onClose={closeBanxaCheckout}
          onLoad={onBanxaFrameLoad} />
      )}
      {!banxaUrl && createPortal(
      <>
        <Details
          title={mode === 'swap' ? 'Confirm Swap' : 'Add Funds'}
          onClose={onClose}
          modalMode
          style={{ zIndex: 9000 }}>
        {mode === 'swap' && (
          <SwapConfirmation>
            <p>
              This purchase is priced in <b>USD</b>. To continue, you are authorizing your wallet to swap up to
              <b><TokenList items={swapRequirements} /></b> through AVNU, then submit the purchase transaction.
            </p>
            <ButtonRow>
              <Button onClick={onClose}>Back</Button>
              <div style={{ flex: 1 }} />
              <Button isTransaction onClick={() => { onFunded(); onClose(); }}>
                <span>Continue</span> <ChevronRightIcon />
              </Button>
            </ButtonRow>
          </SwapConfirmation>
        )}

        {mode !== 'swap' && !banxaUrl && !layerswapUrl && !creatingBanxaOrder && (
          <FundingBody>
            <Receipt>
              <div>
                <label>USDC Balance</label>
                <BalanceActions>
                  <span>{TOKEN_FORMATTER[TOKEN.USDC](usdcBalance, TOKEN_FORMAT.VERBOSE)}</span>
                  <button
                    data-tooltip-content="Refresh USDC Balance"
                    data-tooltip-id="fundingFlowTooltip"
                    data-tooltip-place="top"
                    onClick={onRefreshBalance}
                    type="button">
                    <UpdateIcon />
                  </button>
                </BalanceActions>
              </div>
            </Receipt>

            <FundingButtons>
              {fundingAction
                ? (
                  <FundingOptionButton
                    disabled={nativeBool(fundingAction.disabled)}
                    isTransaction
                    onClick={() => {
                      fundingAction.onClick();
                      onClose();
                    }}>
                    <span>{fundingAction.label}</span>
                    <ChevronRightIcon />
                  </FundingOptionButton>
                )
                : (features.banxa &&
                  <FundingOptionButton isTransaction onClick={onClickBanxa(suggestedAmounts[0])}>
                    <span>Add USDC with Banxa</span>
                    <ChevronRightIcon />
                  </FundingOptionButton>
                )
              }

              {features.banxa && <SecondaryOptionsToggle
                $open={showSecondaryOptions}
                onClick={() => setShowSecondaryOptions(!showSecondaryOptions)}
                type="button">
                <span>Other funding options</span>
                <ChevronRightIcon />
              </SecondaryOptionsToggle>}

              {(!features.banxa || showSecondaryOptions) && (
                <SecondaryOptions $primary={!features.banxa}>
                  {fundingAction && features.banxa && (
                    <FundingOptionButton isTransaction onClick={onClickBanxa(suggestedAmounts[0])}>
                      <span>Add USDC with Banxa</span>
                      <ChevronRightIcon />
                    </FundingOptionButton>
                  )}

                  {appConfig.get('Starknet.chainId') === '0x534e5f5345504f4c4941' && (
                    <EthFaucetButton
                      onError={onFaucetError}
                      buttonComponent={AdvancedOptionButton}
                      icon={<AdvancedOptionIcon><EthIcon /></AdvancedOptionIcon>}
                      onSuccess={onRefreshBalance} />
                  )}

                  <AdvancedOptionButton onClick={onClickAvnu}>
                    <AdvancedOptionIcon>
                      <AvnuLogo />
                    </AdvancedOptionIcon>
                    <label>AVNU Swaps</label>
                    <ChevronRightIcon />
                  </AdvancedOptionButton>

                  {features.layerswap && <AdvancedOptionButton onClick={onClickLayerswap}>
                    <AdvancedOptionIcon>
                      <LayerswapIcon />
                    </AdvancedOptionIcon>
                    <label>Layerswap</label>
                    <ChevronRightIcon />
                  </AdvancedOptionButton>}

                  <AdvancedOptionButton onClick={onClickStarkgate}>
                    <AdvancedOptionIcon>
                      <img alt="" src={StarknetIcon} />
                    </AdvancedOptionIcon>
                    <label>Stargate Bridge</label>
                    <ChevronRightIcon />
                  </AdvancedOptionButton>
                </SecondaryOptions>
              )}
            </FundingButtons>
          </FundingBody>
        )}

        {creatingBanxaOrder && (
          <WaitingWrapper>
            <div>
              <GiantIcon>
                <WalletIcon />
              </GiantIcon>
              <h4>Generating Banxa checkout...</h4>
              <small>Please wait while the checkout is prepared.</small>
            </div>
            <footer>
              <div>
                <Loader color="white" size="12px" />
              </div>
            </footer>
          </WaitingWrapper>
        )}

        {layerswapUrl && (
          <>
            <iframe src={layerswapUrl} title="Layerswap" style={{ border: 0, width: '450px', height: '600px' }} />
            <div style={{ display: 'flex', flexDirection: 'row', padding: '10px 0' }}>
              <Button onClick={() => setLayerswapUrl()}>Cancel</Button>
              <div style={{ flex: 1 }} />
              <Button onClick={() => { setLayerswapUrl(); onRefreshBalance(); }}>
                <UpdateIcon /> <span>Refresh Balance</span>
              </Button>
            </div>
          </>
        )}
        </Details>
        <Tooltip id="fundingFlowTooltip" style={{ zIndex: 9001 }} />
      </>,
      document.body
      )}
    </>
  );
};

export default FundingFlow;
