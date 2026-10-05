import { Authorization, Building, Entity, Permission } from '@influenceth/sdk';

import { prepaidPermissionEnd } from './lotUsageAuthorization';
import { TOKEN, TOKEN_SCALE } from '~/lib/priceUtils';
import { safeBigInt } from '~/lib/utils';
import { normalizeAuthorizationEntity } from './authorization';

// A lot occupied by the asteroid controller's building cannot be leased.
// SDK control checks include different crews delegated to the same account.
export const getLotLeaseEligibility = ({ asteroid, lot, crew, policyType, authorize }) => {
  if (!lot) return { status: 'unresolved' };
  const tenant = normalizeAuthorizationEntity(lot).UseLot;
  if (tenant === undefined) return { status: 'unresolved' };
  const canReplaceOwnLease = policyType === Permission.POLICY_IDS.PREPAID && Authorization.sameEntity(tenant, crew);
  if (tenant && !canReplaceOwnLease) {
    const access = authorize('can', [tenant, lot, Permission.IDS.USE_LOT], [tenant, lot]);
    if (access.status === 'unresolved') return access;
    if (access.status === 'allowed') return { status: 'denied', reason: 'Lot already leased' };
  }
  if (!lot.building) return { status: 'allowed' };
  const controller = asteroid?.Control?.controller;
  if (!controller?.id) return { status: 'unresolved' };
  const control = authorize('controls', [controller, lot.building], [controller, lot.building]);
  if (control.status === 'unresolved') return control;
  return { status: control.status === 'allowed' ? 'denied' : 'allowed' };
};

export const isUseLotLease = (agreement) => Number(agreement?.permission) === Permission.IDS.USE_LOT;

export const getLatestUseLotAgreement = (agreements = []) => {
  return (agreements || [])
    .filter(isUseLotLease)
    .sort((a, b) => (b.endTime || 0) - (a.endTime || 0))[0] || null;
};

export const getActiveUseLotAgreement = (agreements = [], blockTime) => {
  return (agreements || [])
    .filter((agreement) => isUseLotLease(agreement) && prepaidPermissionEnd(agreement) >= blockTime)
    .sort((a, b) => (b.endTime || 0) - (a.endTime || 0))[0] || null;
};

export const getExpiredUseLotAgreement = (agreements = [], blockTime) => {
  return (agreements || [])
    .filter((agreement) => isUseLotLease(agreement) && prepaidPermissionEnd(agreement) < blockTime)
    .sort((a, b) => (b.endTime || 0) - (a.endTime || 0))[0] || null;
};

export const getAsteroidAuctionSettings = (asteroid) => {
  return Permission.getAuctionSettings(asteroid?.PrepaidAgreementAuctionSet);
};

export const getLotLeaseAuctionStatus = ({ asteroid, lot, blockTime }) => {
  const expiredAgreement = lot?._expiredUseLotAgreement || getExpiredUseLotAgreement(lot?.PrepaidAgreements, blockTime);
  const settings = getAsteroidAuctionSettings(asteroid || lot?.meta?.asteroid);
  const status = Permission.getPrepaidAgreementStatus({
    agreement: expiredAgreement,
    auction: lot?.PrepaidAgreementAuction,
    settings,
    now: blockTime
  });
  const hasAuctionableBuilding = !!lot?.building && lot.building?.Building?.status > Building.CONSTRUCTION_STATUSES.UNPLANNED;
  const isAuctionRequired = !!expiredAgreement && hasAuctionableBuilding;
  const isManual = settings.mode === Permission.AUCTION_MODES.MANUAL;
  const isAuto = settings.mode === Permission.AUCTION_MODES.AUTO;

  return {
    ...status,
    expiredAgreement,
    settings,
    hasAuctionableBuilding,
    isAuctionRequired,
    isAuctionAvailable: isAuctionRequired && (isAuto || status.isAuctionActive),
    isManualAuctionBlocked: isAuctionRequired && isManual && !status.isAuctionActive,
  };
};

export const isLeaseHolderOrBuildingController = ({ accountCrewIds = [], lot, previousAgreement }) => {
  const previousTenantId = previousAgreement?.permitted?.id;
  const buildingControllerId = lot?.building?.Control?.controller?.id;
  return !!(
    (previousTenantId && accountCrewIds.includes(previousTenantId)) ||
    (buildingControllerId && accountCrewIds.includes(buildingControllerId))
  );
};

export const canRestoreExpiredLotLease = ({ crewId, lot, expiredAgreement }) => (
  !!expiredAgreement &&
  expiredAgreement.noticeTime === 0 &&
  Authorization.sameEntity(lot?.UseLot?.tenant, expiredAgreement.permitted) &&
  !lot?._activeUseLotAgreement &&
  lot?.building?.Building?.status > Building.CONSTRUCTION_STATUSES.UNPLANNED &&
  isLeaseHolderOrBuildingController({ accountCrewIds: [crewId], lot, previousAgreement: expiredAgreement })
);

export const canExtendAgreement = ({ agreement, blockTime, isExpiredLeaseRenewal }) => (
  agreement?.noticeTime === 0 && (!!isExpiredLeaseRenewal || !!(agreement?.endTime > blockTime))
);

export const getLotLeasePayment = ({ agreement, isExtension, rate, term, now }) => {
  if (!term) return 0n;
  if (isExtension && !agreement) return 0n;
  if (!isExtension && !(Number(rate) >= 0)) return 0n;

  return isExtension
    ? Permission.getPrepaidAgreementExtensionPaymentAmount(agreement, term, now)
    : Permission.getPrepaidAgreementPaymentAmount(rate, term);
};

export const toSway = (amount) => {
  return Number(safeBigInt(amount || 0)) / TOKEN_SCALE[TOKEN.SWAY];
};

export const getEntityCrew = (id) => (
  id ? { id, label: Entity.IDS.CREW } : null
);
