import { Building, Entity, Permission } from '@influenceth/sdk';

import { TOKEN, TOKEN_SCALE } from '~/lib/priceUtils';
import { safeBigInt } from '~/lib/utils';

export const isUseLotLease = (agreement) => Number(agreement?.permission) === Permission.IDS.USE_LOT;

export const getLatestUseLotAgreement = (agreements = []) => {
  return (agreements || [])
    .filter(isUseLotLease)
    .sort((a, b) => (b.endTime || 0) - (a.endTime || 0))[0] || null;
};

export const getActiveUseLotAgreement = (agreements = [], blockTime) => {
  return (agreements || [])
    .filter((agreement) => isUseLotLease(agreement) && agreement?.endTime > blockTime)
    .sort((a, b) => (b.endTime || 0) - (a.endTime || 0))[0] || null;
};

export const getExpiredUseLotAgreement = (agreements = [], blockTime) => {
  return (agreements || [])
    .filter((agreement) => isUseLotLease(agreement) && agreement?.endTime <= blockTime)
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
  const isManual = settings.mode === Permission.AUCTION_MODES.MANUAL;
  const isAuto = settings.mode === Permission.AUCTION_MODES.AUTO;

  return {
    ...status,
    expiredAgreement,
    settings,
    hasAuctionableBuilding,
    isAuctionAvailable: !!expiredAgreement && hasAuctionableBuilding && (isAuto || status.isAuctionActive),
    isManualAuctionBlocked: !!expiredAgreement && hasAuctionableBuilding && isManual && !status.isAuctionActive,
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
