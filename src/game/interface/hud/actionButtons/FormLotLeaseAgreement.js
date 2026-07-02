import { useCallback, useMemo } from 'react';

import { FormLotAgreementIcon, SwayIcon } from '~/components/Icons';
import useAgreementManager from '~/hooks/actionManagers/useAgreementManager';
import useStore from '~/hooks/useStore';
import { formatFixed } from '~/lib/utils';
import {
  getLotLeaseAuctionStatus,
  isLeaseHolderOrBuildingController,
  toSway
} from '~/lib/leaseUtils';
import ActionButton from './ActionButton';
import { Permission } from '@influenceth/sdk';
import { COACHMARK_IDS } from '~/contexts/CoachmarkContext';
import useCoachmarkRefSetter from '~/hooks/useCoachmarkRefSetter';
import theme from '~/theme';

// TODO: arguably, it would be more consistent to show this button in a disabled state, at least in some conditions
const isVisible = ({ accountCrewIds, asteroid, lot, blockTime, crew }) => {
  let visible = false;

  const auctionStatus = getLotLeaseAuctionStatus({ asteroid, lot, blockTime });
  const isExpiredAuctionLease = !!(lot?.building && auctionStatus.expiredAgreement && !lot?._activeUseLotAgreement);

  // visible when lot selected and lot is available to crew (and uncontrolled or not controlled by occupant)
  if (lot && Permission.getPolicyDetails(lot, crew, blockTime)[Permission.IDS.USE_LOT]?.crewStatus === 'available') {
    if (!lot.Control?.controller?.id) visible ||= true;
    if ((lot.building || lot.surfaceShip)?.Control?.controller?.id !== lot.Control.controller.id) visible ||= true;
  }

  if (!visible && isExpiredAuctionLease && auctionStatus.isAuctionAvailable) {
    visible = true;
  }

  if (visible && isExpiredAuctionLease) {
    visible = (
      !auctionStatus.isManualAuctionBlocked ||
      isLeaseHolderOrBuildingController({
        accountCrewIds,
        lot,
        previousAgreement: auctionStatus.expiredAgreement
      })
    );
  }

  return visible;
};

const FormLotLeaseAgreement = ({ accountCrewIds, asteroid, blockTime, lot, simulation, simulationActions, _disabled }) => {
  const { currentPolicy, pendingChange } = useAgreementManager(lot, Permission.IDS.USE_LOT);
  const setCoachmarkRef = useCoachmarkRefSetter();

  const onSetAction = useStore(s => s.dispatchActionDialog);

  const handleClick = useCallback(() => {
    onSetAction('FORM_AGREEMENT', { entity: lot, permission: Permission.IDS.USE_LOT });
  }, [lot]);

  const disabledReason = useMemo(() => {
    if (_disabled) return 'loading...';
    if (pendingChange) return 'updating...';
    if (simulation) {
      if (lot?.building || lot?.surfaceShip) return 'occupied by another crew';
      if (!simulationActions.includes('FormLotLeaseAgreement')) return 'simulation restricted';
    }
    return '';
  }, [_disabled, lot?.building, lot?.surfaceShip, pendingChange, simulation, simulationActions]);

  const buttonProps = useMemo(() => {
    const leaseRate = formatFixed((currentPolicy?.policyDetails?.rate || 0) * 24);
    const auctionStatus = getLotLeaseAuctionStatus({ asteroid, lot, blockTime });

    if (lot?.building && auctionStatus?.expiredAgreement) {
      if (isLeaseHolderOrBuildingController({
        accountCrewIds,
        lot,
        previousAgreement: auctionStatus.expiredAgreement
      })) {
        return {
          label: (
            <>
              Restore Expired Lease<br/>
              (<SwayIcon />{leaseRate} / day + arrears)
            </>
          ),
          overrideColor: theme.colors.red
        };
      }

      return {
        label: (
          <>
            Lease Auctioned Lot (<SwayIcon />{formatFixed(toSway(auctionStatus.auctionPrice), 2)})<br/>
            plus Lease (<SwayIcon />{leaseRate} / day)
          </>
        )
      };
    }

    return {
      label: <>Lease Lot (<SwayIcon />{leaseRate} / day)</>,
    };
  }, [accountCrewIds, asteroid, blockTime, currentPolicy?.policyDetails?.rate, lot]);

  return (
    <ActionButton
      ref={setCoachmarkRef(COACHMARK_IDS.actionButtonLease)}
      {...buttonProps}
      labelAddendum={disabledReason}
      flags={{
        attention: simulation && !disabledReason,
        disabled: _disabled || disabledReason,
        loading: pendingChange
      }}
      icon={<FormLotAgreementIcon />}
      onClick={handleClick} />
  );
};

export default { Component: FormLotLeaseAgreement, isVisible };
