import { useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import styled from 'styled-components';

import WarningAlert from '~/components/WarningAlert';
import { useUSDCBalance } from '~/hooks/useWalletTokenBalance';
import { assertSwapCurrent, formatSwapAmount, parseSlippageBps, parseUsdcAmount } from '~/lib/swaySwap';
import { SwayIcon } from '~/components/Icons';
import UncontrolledTextInput, { TextInputWrapper } from '~/components/TextInputUncontrolled';
import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import useFundingFlow from '~/hooks/useFundingFlow';
import usePriceHelper from '~/hooks/usePriceHelper';
import useSession from '~/hooks/useSession';
import useStore from '~/hooks/useStore';
import useSwapHelper from '~/hooks/useSwapHelper';
import { TOKEN, TOKEN_FORMAT, TOKEN_SCALE } from '~/lib/priceUtils';
import { cleanseTxHash, fireTrackingEvent, reactBool } from '~/lib/utils';
import { PurchaseForm } from './components/PurchaseForm';
import SKUTitle from './components/SKUTitle';
import Button from '~/components/ButtonPill';
import { UsdPrice } from '~/components/UserPrice';
import SKUButton from './components/SKUButton';
import SKUHighlight from './components/SKUHighlight';
import SKUInputRow from './components/SKUInputRow';
import SwaySwapReview from './components/SwaySwapReview';

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
  const { accountAddress, chainId, provider } = useSession();
  const { executeCalls, prepareTransactionFee } = useContext(ChainTransactionContext);
  const { fundingPrompt, onVerifyFunds } = useFundingFlow();
  const priceHelper = usePriceHelper();
  const prepareSwap = useSwapHelper();
  const queryClient = useQueryClient();
  const { data: usdcBalance = 0n, refetch: refreshUsdc } = useUSDCBalance();
  const createAlert = useStore(s => s.dispatchAlertLogged);
  const [usdc, setUSDC] = useState('5');
  const [slippage, setSlippage] = useState('1');
  const [review, setReview] = useState();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState();
  const [now, setNow] = useState(Date.now());
  const requestId = useRef(0);
  const busy = useRef(false);
  const identity = useRef();
  identity.current = { accountAddress, chainId };
  const amount = parseUsdcAmount(usdc);
  const slippageBps = parseSlippageBps(slippage);
  const validSlippage = slippageBps !== null;
  const sway = amount ? priceHelper.from(amount, TOKEN.USDC).to(TOKEN.SWAY) / TOKEN_SCALE[TOKEN.SWAY] : 0;

  useEffect(() => {
    requestId.current += 1;
    setReview(undefined);
    setError(undefined);
  }, [accountAddress, chainId]);

  useEffect(() => () => { requestId.current += 1; }, []);
  useEffect(() => {
    if (!review) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [review]);

  const onReview = async () => {
    if (busy.current || !amount || !validSlippage) return;
    busy.current = true;
    setIsProcessing(true);
    setError(undefined);
    setReview(undefined);
    const id = ++requestId.current;
    try {
      const swap = await prepareSwap(amount, slippageBps);
      if (id !== requestId.current) return;
      const balance = await refreshUsdc();
      if (id !== requestId.current) return;
      if (balance.error) throw balance.error;
      if (balance.data < amount) throw new Error('Insufficient USDC. Add funds before reviewing this swap.');
      const fee = await prepareTransactionFee(swap.calls, {
        requireExplicitSignature: true,
        allowSponsorship: false,
        reservedAmounts: { [TOKEN.USDC]: amount }
      });
      if (id !== requestId.current) return;
      assertSwapCurrent(swap, identity.current);
      setNow(Date.now());
      setReview({ ...swap, fee });
    } catch (e) {
      if (id === requestId.current) setError(e.message);
    } finally {
      busy.current = false;
      setIsProcessing(false);
    }
  };

  const onConfirm = async () => {
    if (busy.current || !review) return;
    busy.current = true;
    setIsProcessing(true);
    setError(undefined);
    const swap = review;
    const id = requestId.current;
    try {
      assertSwapCurrent(swap, identity.current);
      const tx = await executeCalls(swap.calls, {
        requireExplicitSignature: true,
        allowSponsorship: false,
        reviewedFee: swap.fee,
        reservedAmounts: { [TOKEN.USDC]: swap.amount },
        assertCurrent: () => {
          if (id !== requestId.current) throw new Error('Swap review is no longer active.');
          assertSwapCurrent(swap, identity.current);
        },
        authorization: {
          action: 'Swap USDC for SWAY',
          details: `Spend ${formatSwapAmount(swap.amount)} USDC for at least ${formatSwapAmount(swap.minimumReceived)} SWAY through AVNU.`
        }
      });
      if (!tx) throw new Error('Swap was not submitted. Please review a new quote.');
      setReview(undefined);
      fireTrackingEvent('purchase_sway', { externalId: swap.accountAddress, category: 'purchase', amount: Number(swap.amount) });
      const receipt = await provider.waitForTransaction(cleanseTxHash(tx), { retryInterval: 5e3 });
      if (receipt.isReverted?.() || receipt.execution_status === 'REVERTED') throw new Error('Swap reverted. Your tokens were not exchanged.');
      await queryClient.invalidateQueries({ queryKey: ['walletBalance'], refetchType: 'active' });
      createAlert({ type: 'WalletAlert', data: { content: 'SWAY swapped successfully.' }, duration: 5000 });
    } catch (e) {
      setReview(undefined);
      setError(e.message);
    } finally {
      busy.current = false;
      setIsProcessing(false);
    }
  };

  const onClick = () => {
    if (!amount || !validSlippage || busy.current) return;
    return onVerifyFunds(priceHelper.from(amount, TOKEN.USDC), onReview);
  };

  return (
    <Wrapper>
      <div style={{ paddingRight: 20 }}>
        <SKUTitle>Get Sway</SKUTitle>
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
        <h3>Swap USDC for SWAY</h3>
        <div style={{ padding: '0 10px' }}>
          <PreselectRow>
            {preselectableUSDC.map((amount) => (
              <Button
                key={amount}
                active={String(amount) === usdc}
                lessTransparent
                disabled={reactBool(isProcessing)}
                onClick={() => { setReview(undefined); setUSDC(String(amount)); }}>
                <UsdPrice
                  price={amount * TOKEN_SCALE[TOKEN.USDC]}
                  priceToken={TOKEN.USDC}
                  format={TOKEN_FORMAT.SHORT} />
              </Button>
            ))}
          </PreselectRow>

          <SwayExchangeRows>
            <h4>or Specify Amount</h4>

            <SKUInputRow>
              <TextInputWrapper rightLabel="USDC">
                <UncontrolledTextInput
                  min={0.01}
                  disabled={reactBool(isProcessing)}
                  onChange={(e) => { setReview(undefined); setUSDC(e.currentTarget.value); }}
                  step={0.01}
                  type="number"
                  value={usdc || ''} />
              </TextInputWrapper>
            </SKUInputRow>

            <SKUInputRow>
              <TextInputWrapper rightLabel="Slippage %">
                <UncontrolledTextInput
                  aria-label="Slippage percent"
                  min={0.01} max={5} step={0.01} type="number"
                  disabled={reactBool(isProcessing)}
                  value={slippage}
                  onChange={e => { setReview(undefined); setSlippage(e.currentTarget.value); }} />
              </TextInputWrapper>
            </SKUInputRow>
            <p>USDC balance: {formatSwapAmount(usdcBalance)} USDC</p>
            <footer>Swap USDC for SWAY with <b>AVNU</b></footer>
          </SwayExchangeRows>

          <div style={{ paddingBottom: 10 }}>
            <h4>Estimated SWAY (final quote shown before signing)</h4>
            <SKUHighlight>
              <SwayIcon /> {(sway || 0).toLocaleString()}
            </SKUHighlight>
          </div>

          {error && <WarningAlert severity="warning" role="alert"><div>{error}</div></WarningAlert>}
          <SKUButton
            label="Review swap"
            disabled={isProcessing || !amount || !validSlippage}
            isPurchasing={isProcessing}
            onClick={onClick}
            usdcPrice={usdc * TOKEN_SCALE[TOKEN.USDC]}
            style={{ width: '100%' }}
          />
        </div>
      </PurchaseForm>
      {review && <SwaySwapReview
        review={review} expired={now >= review.expiresAt} loading={isProcessing}
        onConfirm={onConfirm} onReject={() => setReview(undefined)} />}
      {fundingPrompt}
    </Wrapper>
  );
};

export default SwaySKU;
