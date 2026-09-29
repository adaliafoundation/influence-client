import { Authorization, Entity, Lot, Permission } from '@influenceth/sdk';

const { IDS: P } = Permission;
const permissionChecks = {
  SendDelivery: [['origin', P.REMOVE_PRODUCTS], ['dest', P.ADD_PRODUCTS]],
  PackageDelivery: [['origin', P.REMOVE_PRODUCTS]],
  DumpDelivery: [['origin', P.REMOVE_PRODUCTS]],
  StationCrew: [['destination', P.STATION_CREW]],
  ResupplyFood: [['origin', P.REMOVE_PRODUCTS]],
  ResupplyFoodFromExchange: [['exchange', P.BUY]],
  CreateBuyOrder: [['exchange', P.LIMIT_BUY], ['storage', P.ADD_PRODUCTS]],
  CreateSellOrder: [['exchange', P.LIMIT_SELL], ['storage', P.REMOVE_PRODUCTS]],
  FillSellOrder: [['exchange', P.BUY], ['destination', P.ADD_PRODUCTS]],
  SampleDepositStart: [['origin', P.REMOVE_PRODUCTS]],
  RecruitAdalian: [['station', P.RECRUIT_CREWMATE]],
  InitializeArvadian: [['station', P.RECRUIT_CREWMATE]]
};
const controlChecks = {
  ConstructionStart: 'building', ConstructionAbandon: 'building', ConstructionDeconstruct: 'building',
  ScanResourcesStart: 'asteroid', ScanResourcesFinish: 'asteroid', ScanSurfaceStart: 'asteroid', ScanSurfaceFinish: 'asteroid',
  TransitBetweenStart: 'ship', TransitBetweenFinish: 'ship', ConfigureExchange: 'exchange',
  ListDepositForSale: 'deposit', UnlistDepositForSale: 'deposit', ChangeName: 'entity'
};

// This maps transaction arguments to SDK primitives. Authorization rules remain in the SDK.
export const recheckTransactionAuthorization = async (key, vars, recheck) => {
  const system = { BulkFillSellOrder: 'FillSellOrder', EscrowDepositAndCreateBuyOrder: 'CreateBuyOrder' }[key] || key;
  if (Array.isArray(vars)) {
    for (const entry of vars) {
      const result = await recheckTransactionAuthorization(system, entry, recheck);
      if (result.status !== 'allowed') return result;
    }
    return { status: 'allowed' };
  }
  key = system;
  const crew = vars.caller_crew;
  // The new crew ID exists only during execution. Do not substitute the selected
  // crew's grants; new-crew creation remains subject to transaction validation.
  if (['RecruitAdalian', 'InitializeArvadian'].includes(key) && Number(crew?.id) === 0) return { status: 'allowed' };

  for (const [field, permission] of permissionChecks[key] || []) {
    const target = vars[field];
    // Starter allowance actions use an explicit empty origin.
    if (field === 'origin' && ['SampleDepositStart', 'ResupplyFood'].includes(key) && Number(target?.id) === 0) continue;
    const result = await recheck('can', [crew, target, permission], [crew, target].filter(Boolean));
    if (result.status !== 'allowed') return result;
  }
  if (['StartPrepaidAgreementAuction', 'CancelPrepaidAgreementAuction'].includes(key)) {
    const asteroid = vars.lot?.id ? { label: Entity.IDS.ASTEROID, id: Lot.toPosition(vars.lot.id).asteroidId } : null;
    const control = await recheck('controls', [crew, asteroid], [crew, asteroid, vars.lot].filter(Boolean));
    if (control.status !== 'allowed' || key === 'CancelPrepaidAgreementAuction') return control;
    const lot = control.entities?.find((entity) => Authorization.sameEntity(entity, vars.lot));
    if (lot?.UseLot === undefined) return { status: 'unresolved' };
    if (!lot.UseLot) return { status: 'denied', reason: 'No recorded tenant' };
    const access = await recheck('can', [lot.UseLot, lot, P.USE_LOT], [lot.UseLot, lot]);
    const currentLot = access.entities?.find((entity) => Authorization.sameEntity(entity, lot));
    if (!Authorization.sameEntity(currentLot?.UseLot, lot.UseLot)) return { status: 'unresolved' };
    return access.status === 'unresolved' ? access : access.status === 'allowed'
      ? { status: 'denied', reason: 'The recorded tenant still has lot access' } : { status: 'allowed' };
  }
  if (controlChecks[key]) {
    const target = vars[controlChecks[key]];
    return recheck('controls', [crew, target], [crew, target].filter(Boolean));
  }
  return { status: 'allowed' };
};
