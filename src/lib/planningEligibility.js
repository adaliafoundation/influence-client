import { Address, Building, Entity, Lot, Permission } from '@influenceth/sdk';

export const PLANNING_COMPONENTS = [
  'Control', 'UseLot', 'PublicPolicy', 'WhitelistAgreement',
  'WhitelistAccountAgreement', 'PrepaidAgreement', 'ContractAgreement', 'ContractPolicy'
];

export const checkingPlanning = { status: 'checking', reason: 'Checking USE_LOT permission' };
const allowed = { status: 'allowed', reason: null };
const isOccupied = (lot) => lot?.building?.Building?.status > 0 || !!lot?.surfaceShip;
const blocked = (reason) => ({ status: 'blocked', reason });
const sameCrew = (a, b) => a?.label === Entity.IDS.CREW && b?.label === Entity.IDS.CREW && Number(a.id) === Number(b.id);
const sameAccount = (a, b) => !!a && !!b && Address.areEqual(a, b);
const isUseLotPermission = (record) => Number(record.permission) === Permission.IDS.USE_LOT;

export const prepaidPermissionEnd = (agreement) => Math.max(
  Number(agreement.endTime || 0), Number(agreement.noticeTime || 0) + Number(agreement.noticePeriod || 0)
);

// null means a required component or policy result is still unknown.
export const hasUseLotPermission = async ({ target, crew, blockTime, loadCrew, checkPolicy }) => {
  if (!target || !crew?.Crew || blockTime == null) return null;
  const arrays = ['PublicPolicies', 'WhitelistAgreements', 'WhitelistAccountAgreements', 'PrepaidAgreements', 'ContractAgreements'];
  if (arrays.some((key) => !Array.isArray(target[key]))) return null;
  if (target.PublicPolicies.some(isUseLotPermission)) return true;
  const matches = (record) => isUseLotPermission(record) && sameCrew(record.permitted, crew);
  if (target.WhitelistAgreements.some(matches)) return true;
  if (target.WhitelistAccountAgreements.some((record) => isUseLotPermission(record) && sameAccount(record.permitted, crew.Crew.delegatedTo))) return true;
  if (target.PrepaidAgreements.some((record) => matches(record) && blockTime <= prepaidPermissionEnd(record))) return true;

  let unresolved = !crew.Crew.delegatedTo;
  const controller = target.Control?.controller;
  if (controller) {
    if (sameCrew(controller, crew)) return true;
    const controllerCrew = await loadCrew(controller.id);
    if (!controllerCrew?.Crew?.delegatedTo) unresolved = true;
    else if (sameAccount(controllerCrew.Crew.delegatedTo, crew.Crew.delegatedTo)) return true;
  }
  const agreement = target.ContractAgreements.find(matches);
  if (agreement) {
    const approved = await checkPolicy(agreement, target, crew);
    if (approved === true) return true;
    if (approved == null) unresolved = true;
  }
  return unresolved ? null : false;
};

export const getPlanningEligibility = async ({ lot, asteroid, crew, blockTime, loadCrew, checkPolicy }) => {
  if (isOccupied(lot)) return blocked('Lot occupied');
  if (!lot || !asteroid || !crew || !lot.UseLot || !Object.prototype.hasOwnProperty.call(lot.UseLot, 'tenant')) return checkingPlanning;
  const permission = async (target, permitted) => {
    try {
      return await hasUseLotPermission({ target, crew: permitted, blockTime, loadCrew, checkPolicy });
    } catch (error) {
      // A failed read is unresolved, not a rejection or approval.
      return null;
    }
  };
  const tenant = lot.UseLot.tenant;
  if (tenant !== null && (!tenant?.id || tenant.label !== Entity.IDS.CREW)) return checkingPlanning;
  if (tenant) {
    let tenantCrew;
    try {
      tenantCrew = sameCrew(tenant, crew) ? crew : await loadCrew(tenant.id);
    } catch (error) {
      return checkingPlanning;
    }
    const active = await permission(lot, tenantCrew);
    if (active == null) return checkingPlanning;
    if (active) return sameCrew(tenant, crew) ? allowed : blocked('Another crew holds active tenancy');
  }
  const grants = await Promise.all([permission(lot, crew), permission(asteroid, crew)]);
  if (grants.includes(true)) return allowed;
  return grants.includes(null) ? checkingPlanning : blocked('USE_LOT permission required');
};

export const checkContractPolicy = async (provider, agreement, target, crew) => {
  if (!provider || !agreement.address) return null;
  const result = await provider.callContract({
    contractAddress: agreement.address,
    entrypoint: 'can',
    calldata: [target.label, target.id, Permission.IDS.USE_LOT, crew.label, crew.id].map(String)
  });
  if (result?.length !== 1) return null;
  return BigInt(result[0]) === 1n;
};

// Always bypass the UI cache immediately before submitting.
export const loadPlanningEligibility = async ({ api, provider, lotId, crewId, blockTime, accountAddress, snapshot }) => {
  const asteroidId = Number(Lot.toPosition(lotId)?.asteroidId);
  const lotEntity = Entity.formatEntity({ label: Entity.IDS.LOT, id: lotId });
  const crews = new Map();
  const loadCrew = (id) => {
    if (!crews.has(id)) crews.set(id, api.getEntityById({ label: Entity.IDS.CREW, id }));
    return crews.get(id);
  };
  const [lot, asteroid, crew, occupants, constants] = await Promise.all([
    snapshot ? snapshot.lot : api.getEntityById({ ...lotEntity, components: PLANNING_COMPONENTS }),
    snapshot ? snapshot.asteroid : api.getEntityById({ label: Entity.IDS.ASTEROID, id: asteroidId, components: PLANNING_COMPONENTS }),
    snapshot ? snapshot.crew : loadCrew(crewId),
    snapshot ? snapshot.occupants : api.getEntities({ label: [Entity.IDS.BUILDING, Entity.IDS.SHIP], match: { 'Location.locations.uuid': lotEntity.uuid } }),
    snapshot ? snapshot.constants : api.getConstants(['LAUNCH_TIME'])
  ]);
  if (!lot || !asteroid || !crew || !Array.isArray(occupants)) return checkingPlanning;
  const planningLot = {
    ...lot,
    building: occupants.find((e) => e.Building?.status > 0),
    surfaceShip: occupants.find((e) => e.Ship && e.Location?.location?.label === Entity.IDS.LOT)
  };
  if (isOccupied(planningLot)) return blocked('Lot occupied');
  if (!crew.Crew || crew.Crew.delegatedTo == null || !Array.isArray(crew.Crew.roster)) return checkingPlanning;
  if (!sameAccount(accountAddress, crew.Crew.delegatedTo)) return blocked('Incorrect crew wallet');
  if (!crew.Crew?.roster?.length) return blocked('Crew required');
  if (constants?.LAUNCH_TIME == null) return checkingPlanning;
  if (blockTime < Number(constants.LAUNCH_TIME)) return blocked('Crew not launched');
  const locations = crew.Location?.locations;
  if (!locations) return checkingPlanning;
  if (!locations.some((e) => e.label === Entity.IDS.ASTEROID && Number(e.id) === asteroidId)) return blocked('Crew is away');
  if (!locations.some((e) => e.label === Entity.IDS.LOT && e.id > 0)) return blocked('Crew in orbit');
  for (const location of locations.filter((e) => [Entity.IDS.BUILDING, Entity.IDS.SHIP].includes(e.label))) {
    const station = await api.getEntityById(location);
    if (!station || (location.label === Entity.IDS.BUILDING && !station.Building) || (location.label === Entity.IDS.SHIP && !station.Ship)) return checkingPlanning;
    if (station.Ship?.emergencyAt > 0) return blocked('Crew ship in emergency mode');
    if (station.Building && station.Building.status !== Building.CONSTRUCTION_STATUSES.OPERATIONAL) return blocked('Crew station not operational');
  }
  return getPlanningEligibility({
    lot: planningLot,
    asteroid, crew, blockTime, loadCrew,
    checkPolicy: (agreement, target, permitted) => checkContractPolicy(provider, agreement, target, permitted)
  });
};
