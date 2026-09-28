import { Address, Entity, Permission } from '@influenceth/sdk';

export const PERMISSION_COMPONENTS = [
  'Control', 'UseLot', 'PublicPolicy', 'WhitelistAgreement',
  'WhitelistAccountAgreement', 'PrepaidAgreement', 'ContractAgreement', 'ContractPolicy'
];

export const sameEntity = (a, b) => !!a?.id && !!b?.id && a.label === b.label && Number(a.id) === Number(b.id);
export const sameAccount = (a, b) => !!a && !!b && Address.areEqual(a, b);
export const checkingLotUsage = { status: 'checking', reason: 'Checking USE_LOT permission' };

export const prepaidPermissionEnd = (agreement) => Math.max(
  Number(agreement.endTime || 0), Number(agreement.noticeTime || 0) + Number(agreement.noticePeriod || 0)
);

// A ship uses its controller's delegate for account grants and control, but its own
// identity for entity agreements and external policy calls.
export const resolvePermission = async ({ target, permitted, permission, blockTime, loadCrew, checkPolicy }) => {
  try {
    if (!target || !permitted?.id || blockTime == null) return null;
    const arrays = ['PublicPolicies', 'WhitelistAgreements', 'WhitelistAccountAgreements', 'PrepaidAgreements', 'ContractAgreements'];
    if (arrays.some((key) => !Array.isArray(target[key]))) return null;
    const inScope = (record) => Number(record.permission) === permission;
    const matches = (record) => inScope(record) && sameEntity(record.permitted, permitted);
    if (target.PublicPolicies.some(inScope) || target.WhitelistAgreements.some(matches)) return true;
    if (target.PrepaidAgreements.some((record) => matches(record) && blockTime <= prepaidPermissionEnd(record))) return true;

    const controller = permitted.label === Entity.IDS.CREW ? permitted : permitted.Control?.controller;
    const crew = controller?.Crew ? controller : (controller?.id ? await loadCrew(controller.id).catch(() => null) : null);
    const delegate = crew?.Crew?.delegatedTo;
    let unresolved = !delegate;
    if (target.WhitelistAccountAgreements.some((record) => inScope(record) && sameAccount(record.permitted, delegate))) return true;
    if (target.Control?.controller) {
      if (sameEntity(target.Control.controller, controller)) return true;
      const targetCrew = await loadCrew(target.Control.controller.id).catch(() => null);
      if (!targetCrew?.Crew?.delegatedTo) unresolved = true;
      else if (sameAccount(targetCrew.Crew.delegatedTo, delegate)) return true;
    }
    const agreement = target.ContractAgreements.find(matches);
    if (agreement) {
      const approved = await checkPolicy(agreement, target, permitted, permission);
      if (approved === true) return true;
      if (approved == null) unresolved = true;
    }
    return unresolved ? null : false;
  } catch (error) {
    // Failed reads are unknown, never proof that access was granted or revoked.
    return null;
  }
};

// Occupancy and the acting crew's location are deliberately outside lot authorization.
export const resolveLotUsage = async ({ lot, asteroid, crew, blockTime, loadCrew, checkPolicy }) => {
  if (!lot || !asteroid || !crew || !lot.UseLot || !Object.prototype.hasOwnProperty.call(lot.UseLot, 'tenant')) return checkingLotUsage;
  const tenant = lot.UseLot.tenant;
  if (tenant !== null && (!tenant?.id || tenant.label !== Entity.IDS.CREW)) return checkingLotUsage;
  const permission = (target, permitted) => resolvePermission({ target, permitted, permission: Permission.IDS.USE_LOT, blockTime, loadCrew, checkPolicy });
  if (tenant) {
    const tenantCrew = sameEntity(tenant, crew) ? crew : await loadCrew(tenant.id).catch(() => null);
    if (!tenantCrew) return checkingLotUsage;
    const active = await permission(lot, tenantCrew);
    if (active == null) return checkingLotUsage;
    if (active) return sameEntity(tenant, crew)
      ? { status: 'allowed', reason: null }
      : { status: 'blocked', reason: 'Another crew holds active tenancy' };
  }
  const grants = await Promise.all([permission(lot, crew), permission(asteroid, crew)]);
  if (grants.includes(true)) return { status: 'allowed', reason: null };
  return grants.includes(null) ? checkingLotUsage : { status: 'blocked', reason: 'USE_LOT permission required' };
};

export const checkContractPolicy = async (provider, agreement, target, permitted, permission) => {
  if (!provider || !agreement.address) return null;
  const result = await provider.callContract({
    contractAddress: agreement.address,
    entrypoint: 'can',
    calldata: [target.label, target.id, permission, permitted.label, permitted.id].map(String)
  });
  if (result?.length !== 1) return null;
  const approved = BigInt(result[0]);
  return approved === 1n ? true : (approved === 0n ? false : null);
};
