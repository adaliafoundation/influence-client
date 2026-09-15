import { useEffect, useMemo, useState } from 'react';
import styled, { css, keyframes } from 'styled-components';

import Button from '~/components/ButtonAlt';
import { ChevronRightIcon, UpdateIcon, WalletIcon } from '~/components/Icons';
import FundingFlow from '~/game/launcher/store/FundingFlow';
import useSession from '~/hooks/useSession';
import useStore from '~/hooks/useStore';
import { useUSDCBalance } from '~/hooks/useWalletTokenBalance';
import { TOKEN, TOKEN_FORMAT, TOKEN_FORMATTER } from '~/lib/priceUtils';
import { formatTimer } from '~/lib/utils';

const sweep = keyframes`
  0% { transform: translateX(-120%); }
  100% { transform: translateX(120%); }
`;

const Wrapper = styled.div`
  align-items: center;
  background: rgba(${p => p.theme.colors.mainRGB}, 0.16);
  border: 1px solid rgba(${p => p.theme.colors.mainRGB}, 0.35);
  color: white;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0 16px 10px;
  padding: 12px 10px;
  position: relative;
  overflow: hidden;
  z-index: 1;

  ${p => p.active && css`
    &::before {
      animation: ${sweep} 2600ms ease-in-out infinite;
      background: linear-gradient(
        90deg,
        transparent,
        rgba(255, 255, 255, 0.08),
        transparent
      );
      content: '';
      inset: 0;
      position: absolute;
      z-index: -1;
    }
  `}

  & > svg {
    color: ${p => p.theme.colors.main};
    flex: 0 0 auto;
    font-size: 22px;
  }

  & > div {
    flex: 1;
    min-width: 0;
  }

  & h4 {
    align-items: center;
    display: flex;
    font-size: 16px;
    gap: 6px;
    margin: 0 0 10px;
  }

  & small {
    color: #aaa;
    display: block;
    font-size: 12px;
    line-height: 1.3em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: normal;
  }

  & label {
    color: ${p => p.theme.colors.main};
    display: block;
    font-size: 12px;
    margin-top: 5px;
  }

  & label button {
    background: transparent;
    border: 0;
    color: #888;
    cursor: ${p => p.theme.cursors.active};
    display: inline;
    font-family: inherit;
    font-size: 11px;
    height: auto;
    margin-left: 8px;
    padding: 0;
    text-transform: uppercase;

    &:hover {
      color: ${p => p.theme.colors.main};
    }
  }

  & footer {
    display: flex;
    flex: 0 0 100%;
    flex-wrap: wrap;
    gap: 8px;

    & > button {
      flex: 1 0 140px;
      min-width: 0;
      white-space: nowrap;
    }
  }
`;

const CollapsedWalletButton = styled.button`
  align-items: center;
  background: transparent;
  border: 0;
  color: ${p => p.theme.colors.main};
  cursor: ${p => p.theme.cursors.active};
  display: flex;
  font-size: 22px;
  height: 38px;
  justify-content: center;
  margin: 0 5px 10px;
  padding: 0;
  width: 38px;

  &:hover {
    color: ${p => p.theme.colors.brightMain};
  }
`;

const Balance = styled.div`
  display: flex;
  gap: 8px;
  justify-content: space-between;
  margin: 0 0 10px;
  width: 100%;

  & label {
    font-size: 15px;
    margin: 0;
  }

  & strong {
    color: white;
    flex: 1;
    font-size: 15px;
    font-weight: normal;
    text-align: right;
  }

  && button {
    background: transparent;
    border: 0;
    color: ${p => p.theme.colors.main};
    flex: 0 0 auto;
    font-size: 15px;
    height: auto;
    min-width: 0;
    padding: 0;

    &:hover {
      color: ${p => p.theme.colors.brightMain};
    }
  }
`;

const FundingStatusIndicator = ({ collapsed = false }) => {
  const { accountAddress } = useSession();
  const dispatchFundingIntentCleared = useStore(s => s.dispatchFundingIntentCleared);
  const { data: usdcBalance = 0n, refetch: refetchUsdcBalance } = useUSDCBalance();
  const [now, setNow] = useState(Date.now());
  const [isFunding, setIsFunding] = useState(false);
  const activeFundingIntent = useStore(s => {
    const intent = s.activeFundingIntentId ? s.fundingIntents?.[s.activeFundingIntentId] : null;
    return intent?.accountAddress === accountAddress ? intent : null;
  });

  useEffect(() => {
    if (!activeFundingIntent) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [activeFundingIntent]);

  const actionUrl = useMemo(() => (
    activeFundingIntent?.statusUrl || activeFundingIntent?.checkoutUrl
  ), [activeFundingIntent]);

  if (!accountAddress) return null;

  if (collapsed) {
    return (
      <>
        <CollapsedWalletButton
          dataFor="launcherTooltip"
          dataPlace="right"
          dataTip="Add funds"
          onClick={() => setIsFunding(true)}
          type="button">
          <WalletIcon />
        </CollapsedWalletButton>
        {isFunding && <FundingFlow onClose={() => setIsFunding(false)} />}
      </>
    );
  }

  if (!activeFundingIntent) {
    return (
      <>
        <Wrapper>
          <div>
            <Balance>
              <label>Wallet Balance</label>
              <strong>{TOKEN_FORMATTER[TOKEN.USDC](usdcBalance, TOKEN_FORMAT.VERBOSE)}</strong>
              <button
                data-tooltip-content="Refresh USDC Balance"
                data-tooltip-id="launcherTooltip"
                data-tooltip-place="top"
                onClick={refetchUsdcBalance}
                type="button">
                <UpdateIcon />
              </button>
            </Balance>
          </div>
          <footer>
            <Button isTransaction size="small" onClick={() => setIsFunding(true)}>
              Add Funds <ChevronRightIcon />
            </Button>
          </footer>
        </Wrapper>
        {isFunding && <FundingFlow onClose={() => setIsFunding(false)} />}
      </>
    );
  }

  const isFailed = activeFundingIntent.status === 'failed';
  const isCancelled = activeFundingIntent.status === 'cancelled';
  const isTerminalError = isFailed || isCancelled;
  const elapsed = activeFundingIntent.createdAt
    ? formatTimer(Math.max(0, Math.floor((now - activeFundingIntent.createdAt) / 1000)), 2)
    : null;

  return (
    <>
      <Wrapper active={!isTerminalError}>
        <div>
          <h4><WalletIcon />Wallet Balance</h4>
          <Balance>
            <label>USDC</label>
            <strong>{TOKEN_FORMATTER[TOKEN.USDC](usdcBalance, TOKEN_FORMAT.VERBOSE)}</strong>
            <button
              data-tooltip-content="Refresh USDC Balance"
              data-tooltip-id="launcherTooltip"
              data-tooltip-place="top"
              onClick={refetchUsdcBalance}
              type="button">
              <UpdateIcon />
            </button>
          </Balance>
          <small>
            {isFailed && 'USDC transfer failed. Start a new funding checkout when you are ready.'}
            {isCancelled && 'USDC transfer cancelled. Start a new funding checkout when you are ready.'}
            {!isTerminalError && 'USDC transfer in progress. Banxa payments usually arrive in 2-10 minutes.'}
          </small>
          {elapsed && activeFundingIntent && (
            <label>
              Started {elapsed} ago
              <button onClick={() => dispatchFundingIntentCleared(activeFundingIntent.id)}>
                Dismiss
              </button>
            </label>
          )}
        </div>
        <footer>
          {actionUrl && !isTerminalError && (
            <Button size="small" onClick={() => window.open(actionUrl, '_blank', 'noopener')}>
              Check Status <ChevronRightIcon />
            </Button>
          )}
          <Button isTransaction size="small" onClick={() => setIsFunding(true)}>
            Add Funds <ChevronRightIcon />
          </Button>
        </footer>
      </Wrapper>
      {isFunding && <FundingFlow onClose={() => setIsFunding(false)} />}
    </>
  );
};

export default FundingStatusIndicator;
