import { useCallback, useMemo } from 'react';
import { Permission } from '@influenceth/sdk';

import { AgreementIcon } from '~/components/Icons';
import useLotLeaseAuctionManager from '~/hooks/actionManagers/useLotLeaseAuctionManager';
import { getLotLeaseAuctionStatus } from '~/lib/leaseUtils';
import ActionButton, { getCrewDisabledReason } from './ActionButton';
import theme from '~/theme';

const isVisible = ({ asteroid, crew, lot, blockTime }) => {
  if (!asteroid || !crew || !lot?.building) return false;
  if (asteroid.Control?.controller?.id !== crew.id) return false;

  const auctionStatus = getLotLeaseAuctionStatus({ asteroid, lot, blockTime });
  return !!(
    auctionStatus.hasAuctionableBuilding &&
    !!auctionStatus.expiredAgreement &&
    auctionStatus.settings.mode === Permission.AUCTION_MODES.MANUAL &&
    !auctionStatus.isAuctionActive &&
    !lot._activeUseLotAgreement
  );
};

const ManageLotLeaseAuction = ({ asteroid, crew, lot, blockTime, onSetAction, _disabled }) => {
  const { cancelAuction, currentAuctionChange } = useLotLeaseAuctionManager(lot?.id);
  const auctionStatus = useMemo(
    () => getLotLeaseAuctionStatus({ asteroid, lot, blockTime }),
    [asteroid, blockTime, lot]
  );

  const handleClick = useCallback(() => {
    if (auctionStatus.isAuctionActive) {
      cancelAuction();
    } else {
      onSetAction('START_LOT_LEASE_AUCTION');
    }
  }, [auctionStatus.isAuctionActive, cancelAuction, onSetAction]);

  const disabledReason = useMemo(() => {
    if (_disabled || !!currentAuctionChange) return 'loading...';
    return getCrewDisabledReason({ asteroid, crew });
  }, [_disabled, asteroid, crew, currentAuctionChange]);

  return (
    <ActionButton
      label={auctionStatus.isAuctionActive ? 'Cancel Lease Auction' : 'Start Lease Auction'}
      labelAddendum={disabledReason}
      flags={{
        disabled: disabledReason,
        loading: !!currentAuctionChange
      }}
      icon={<AgreementIcon />}
      overrideColor={theme.colors.orange}
      overrideBgColor={theme.colors.backgroundOrange}
      onClick={handleClick} />
  );
};

export default { Component: ManageLotLeaseAuction, isVisible };
