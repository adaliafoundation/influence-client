import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { FaCaretRight } from 'react-icons/fa';

import {
  CopyIcon,
  CrewmateCreditIcon,
  MenuIcon,
  SwayIcon,
  UpdateIcon,
  WarningIcon
} from '~/components/Icons';
import useSession from '~/hooks/useSession';
import useCrewContext from '~/hooks/useCrewContext';
import useStore from '~/hooks/useStore';
import { useSwayBalance } from '~/hooks/useWalletTokenBalance';
import useAccountFormatted from '~/hooks/useAccountFormatted';
import IconButton from '~/components/IconButton';
import { TOKEN, TOKEN_SCALE } from '~/lib/priceUtils';
import useWalletInbox from '~/hooks/useWalletInbox';

const StyledSystemControls = styled.div`
  align-items: center;
  display: flex;
  flex-direction: row;
  padding: 12px 6px 0 0;
  pointer-events: all;
  position: absolute;
  right: 0;
  top: 0;
  transition: opacity 250ms ease;
  z-index: 2;
`;

const MobileWarning = styled.div`
  align-items: center;
  color: orangered;
  display: flex;
  font-size: 13px;
  @media (min-width: ${p => p.theme.breakpoints.mobile + 1}px) {
    display: none;
  }
`;

const SwayBalance = styled.div`
  align-items: center;
  border-right: 1px solid rgba(255, 255, 255, 0.15);
  color: white;
  cursor: ${p => p.theme.cursors.active};
  display: flex;
  filter: drop-shadow(0px 0px 2px rgba(0, 0, 0, 0.5));
  font-size: 24px;
  margin-right: 16px;
  padding-right: 16px;

  & > svg {
    font-size: 24px;
    margin-right: 2px;
  }
`;

const SwayBalanceIcon = styled.span`
  align-items: center;
  display: inline-flex;
  height: 24px;
  justify-content: center;
  margin-right: 2px;
  position: relative;
  width: 24px;

  & > span {
    align-items: center;
    display: inline-flex;
    height: 24px;
    justify-content: center;
    left: 0;
    position: absolute;
    top: 0;
    width: 24px;
  }

  & svg {
    height: 24px;
    width: 24px;
  }

  & .refresh-icon {
    display: none;
  }

  & .refresh-icon svg {
    height: 18px;
    width: 18px;
    margin: 2px;
    position: absolute;
    top: 0;
    left: 0;
  }

  ${SwayBalance}:hover & .sway-icon {
    display: none;
  }

  ${SwayBalance}:hover & .refresh-icon {
    display: block;
  }
`;

const CrewmateCreditBalance = styled(SwayBalance)`
  & > svg {
    color: ${p => p.theme.colors.main};
  }
  & label {
    font-size: 70%;
    margin-left: 6px;
    & b {
      color: ${p => p.theme.colors.main};
      font-weight: normal;
    }
  }
`;

const InboxTally = styled(CrewmateCreditBalance)`
  & > svg {
    color: ${p => p.theme.colors.main};
  }
  & label {
    font-size: 70%;
    margin-left: 6px;
    & b {
      color: ${p => p.theme.colors.main};
      font-weight: normal;
    }
  }
`;

const HoverContent = styled.label`
  display: none;
`;
const NoHoverContent = styled.label`
  display: block;
`;

const LoggedInButton = styled.div`
  align-items: center;
  background: rgba(${p => p.theme.colors.darkMainRGB}, 0.2);
  border: 1px solid;
  border-color: rgba(${p => p.theme.colors.mainRGB}, 0.4);
  border-radius: 20px;
  cursor: ${p => p.theme.cursors.active};
  display: flex;
  height: 34px;
  justify-content: center;
  margin-right: 16px;
  overflow: hidden;
  position: relative;
  transition: margin-right 150ms ease, width 150ms ease;
  ${p => p.isVisible
    ? `
      border-width: 1px;
      margin-right: 16px;
      width: 220px;
    `
    : `
      border-width: 0px;
      margin: 0;
      width: 0;
    `
  }

  &:hover {
    background: rgba(${p => p.theme.colors.mainRGB}, 0.3);
    border-color: rgba(${p => p.theme.colors.mainRGB}, 0.8);
    color: white;
    & ${HoverContent} {
      display: block;
    }
    & ${NoHoverContent} {
      display: none;
    }
  }
`;

const GreenDot = styled.div`
  align-items: center;
  background: rgba(${p => p.theme.colors.successRGB}, 0.15);
  border-radius: 100%;
  display: flex;
  justify-content: center;
  height: 18px;
  left: 8px;
  position: absolute;
  top: 8px;
  width: 18px;
  &:before {
    content: "";
    background: rgba(${p => p.theme.colors.successRGB},1);
    border-radius: 100%;
    display: block;
    height: 10px;
    width: 10px;
  }
`;

const CopyLink = styled.div`
  color: ${p => p.theme.colors.main};
  cursor: ${p => p.theme.cursors.active};
  opacity: 0.5;
  padding: 10px 28px 10px 0;
  position: absolute;
  right: 0;
  top: 0;
  transition: opacity 100ms ease;
  &:hover {
    opacity: 1;
    filter: drop-shadow(0 0 4px ${p => p.theme.colors.brightMain});
  }
`;

const SystemControls = () => {
  const { accountAddress, authenticated, logout } = useSession(false);
  const { adalianRecruits, arvadianRecruits } = useCrewContext();

  const { data: swayBalance, refetch: refetchSwayBalance } = useSwayBalance();

  const launcherPage = useStore(s => s.launcherPage);
  const createAlert = useStore(s => s.dispatchAlertLogged);
  const dispatchLauncherPage = useStore(s => s.dispatchLauncherPage);

  const [showAuthedButton, setShowAuthedButton] = useState(!(authenticated && launcherPage));

  const totalRecruitCredits = useMemo(() => (adalianRecruits?.length + arvadianRecruits?.length), [adalianRecruits, arvadianRecruits])
  const formattedAccount = useAccountFormatted({ address: accountAddress, truncate: true, doNotReplaceYou: true });

  const onToggleLauncher = useCallback(() => {
    if (launcherPage) dispatchLauncherPage();
    else dispatchLauncherPage('play');
  }, [launcherPage]);

  // (just used for animation in/out of auth button)
  useEffect(() => {
    setTimeout(() => { setShowAuthedButton(authenticated && launcherPage); }, 0);
  }, [authenticated, !launcherPage]);

  const onCopyWalletAddress = useCallback(() => {
    try {
      navigator.clipboard.writeText(`${accountAddress}`);
      createAlert({
        type: 'ClipboardAlert',
        data: { content: 'Wallet address copied to clipboard.' },
        duration: 3000
      });
    } catch (e) {
      console.warn(e);
    }
  }, [accountAddress]);

  const onRefreshSwayBalance = useCallback(() => {
    refetchSwayBalance();
  }, [refetchSwayBalance]);

  const { hasNoPublicKey, unreadTally } = useWalletInbox();

  return (
    <StyledSystemControls id="topMenu">
      <MobileWarning style={{ marginRight: 10 }}>
        <WarningIcon />
        <span style={{ marginLeft: 5 }}>Device size is not well supported.</span>
      </MobileWarning>

      {totalRecruitCredits
        ? (
          <CrewmateCreditBalance>
            <CrewmateCreditIcon />
            <label>{(totalRecruitCredits || 0).toLocaleString()} <b>Crewmate Credit{totalRecruitCredits === 1 ? '' : 's'}</b></label>
          </CrewmateCreditBalance>
        )
        : null
      }

      {swayBalance !== undefined && (
        <SwayBalance
          data-tooltip-content="Refresh SWAY Balance"
          data-tooltip-id="launcherTooltip"
          data-tooltip-place="bottom"
          onClick={onRefreshSwayBalance}>
          <SwayBalanceIcon>
            <span className="sway-icon"><SwayIcon /></span>
            <span className="refresh-icon"><UpdateIcon /></span>
          </SwayBalanceIcon>
          {(parseInt(swayBalance) / TOKEN_SCALE[TOKEN.SWAY]).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </SwayBalance>
      )}

      {authenticated && (
        <div style={{ position: 'relative' }}>
          <LoggedInButton onClick={logout} isVisible={!!showAuthedButton}>
            <GreenDot />
            <NoHoverContent>{formattedAccount}</NoHoverContent>
            <HoverContent>Log Out</HoverContent>
          </LoggedInButton>
          {!!showAuthedButton && (
            <CopyLink
              data-tooltip-content="Copy Address"
              data-tooltip-id="launcherTooltip"
              data-tooltip-place="bottom"
              onClick={onCopyWalletAddress}>
              <CopyIcon />
            </CopyLink>
          )}
        </div>
      )}

      <IconButton
        badge={launcherPage ? 0 : unreadTally}
        badgeProps={accountAddress && hasNoPublicKey ? { color: 'errorRGB', isDot: true, showOnZero: !launcherPage } : {}}
        onClick={onToggleLauncher}
        style={{ fontSize: 17 }}>
        {launcherPage ? <FaCaretRight /> : <MenuIcon />}
      </IconButton>

    </StyledSystemControls>
  );
};

export default SystemControls;
