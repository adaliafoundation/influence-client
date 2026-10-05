import { useCallback, useMemo } from 'react';
import { Permission } from '@influenceth/sdk';

import { AgreementIcon } from '~/components/Icons';
import useLotLeaseAuctionManager from '~/hooks/actionManagers/useLotLeaseAuctionManager';
import { getLotLeaseAuctionStatus } from '~/lib/leaseUtils';
import ActionButton, { getCrewDisabledReason } from './ActionButton';
import theme from '~/theme';

const isVisible = ({ asteroid, crew, crewControls, lot, blockTime }) => {
  if (!asteroid || !crew || !lot?.building) return false;
  if (!crewControls(asteroid)) return false;

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
  const { cancelAuction, currentAuctionChange, tenantAccess } = useLotLeaseAuctionManager(lot?.id);
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
    if (!auctionStatus.isAuctionActive && tenantAccess.status !== 'denied') {
      return tenantAccess.status === 'allowed' ? 'tenant still has lot access' : true;
    }
    return getCrewDisabledReason({ asteroid, crew });
  }, [_disabled, asteroid, crew, currentAuctionChange, auctionStatus.isAuctionActive, tenantAccess]);

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

const actionDefinition = { Component: ManageLotLeaseAuction, isVisible };

export default actionDefinition;
