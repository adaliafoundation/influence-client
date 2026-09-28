import { Building, Entity, Lot } from '@influenceth/sdk';
import { PERMISSION_COMPONENTS, checkingLotUsage, resolveLotUsage, sameAccount, checkContractPolicy } from './lotUsageAuthorization';

export const PLANNING_COMPONENTS = PERMISSION_COMPONENTS;
export const checkingPlanning = checkingLotUsage;
const isOccupied = (lot) => lot?.building?.Building?.status > 0 || !!lot?.surfaceShip;
const blocked = (reason) => ({ status: 'blocked', reason });

export const getPlanningEligibility = (params) => isOccupied(params.lot)
  ? Promise.resolve(blocked('Lot occupied'))
  : resolveLotUsage(params);

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
    checkPolicy: (agreement, target, permitted, permission) => checkContractPolicy(provider, agreement, target, permitted, permission)
  });
};
