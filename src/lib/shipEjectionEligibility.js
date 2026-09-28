import { Entity, Lot, Permission } from '@influenceth/sdk';
import { PERMISSION_COMPONENTS, resolveLotUsage, resolvePermission, sameAccount, checkContractPolicy } from './lotUsageAuthorization';

export const checkingShipEjection = { status: 'checking', reason: 'Checking ship protection' };
const blocked = (reason) => ({ status: 'blocked', reason });
export const isForceLaunch = (crew, ship) => !!crew?.id && !!ship?.Control?.controller?.id
  && Number(crew.id) !== Number(ship.Control.controller.id);
export const isLandedShip = (ship) => [Entity.IDS.LOT, Entity.IDS.BUILDING].includes(ship?.Location?.location?.label);

const asteroidIdOf = (entity) => entity?.Location?.locations?.find((e) => e.label === Entity.IDS.ASTEROID)?.id;

export const getShipEjectionEligibility = async ({ ship, crew, controller, lot, asteroid, building, blockTime, accountAddress, loadCrew, checkPolicy }) => {
  if (!ship?.Control?.controller?.id || !ship?.Location?.location || !crew?.id || !crew?.Crew || blockTime == null) return checkingShipEjection;
  if (!isForceLaunch(crew, ship)) return blocked('Selected crew controls this ship');
  if (!isLandedShip(ship)) return blocked('Ship is not landed or docked');
  if (crew.Crew.delegatedTo == null || !Array.isArray(crew.Crew.roster) || crew.Crew.readyAt == null || !crew.Location?.locations) return checkingShipEjection;
  if (!sameAccount(crew.Crew.delegatedTo, accountAddress)) return blocked('Incorrect crew wallet');
  if (!crew.Crew.roster.length) return blocked('Crew required');
  if (blockTime < crew.Crew.readyAt) return blocked('Crew busy');

  const location = ship.Location.location;
  const asteroidId = location.label === Entity.IDS.LOT
    ? Lot.toPosition(location.id)?.asteroidId
    : asteroidIdOf(building);
  if (!asteroidId || !controller?.Crew) return checkingShipEjection;
  if (Number(asteroidIdOf(crew)) !== Number(asteroidId)) return blocked('Crew is away');

  let protectedShip;
  if (location.label === Entity.IDS.LOT) {
    const usage = await resolveLotUsage({ lot, asteroid, crew: controller, blockTime, loadCrew, checkPolicy });
    protectedShip = usage.status === 'checking' ? null : usage.status === 'allowed';
  } else {
    if (!building?.Dock) return checkingShipEjection;
    const grants = await Promise.all([controller, ship].map((permitted) => resolvePermission({
      target: building, permitted, permission: Permission.IDS.DOCK_SHIP, blockTime, loadCrew, checkPolicy
    })));
    protectedShip = grants.includes(true) ? true : (grants.includes(null) ? null : false);
  }
  if (protectedShip == null) return checkingShipEjection;
  return protectedShip ? blocked('Ship has permission to remain') : { status: 'allowed', reason: null };
};

// Fresh reads are also used by the submission handler; no cached protection result authorizes eviction.
export const loadShipEjectionEligibility = async ({ api, provider, shipId, crewId, blockTime, accountAddress }) => {
  const crews = new Map();
  const loadCrew = (id) => {
    if (!crews.has(id)) crews.set(id, api.getEntityById({ label: Entity.IDS.CREW, id }));
    return crews.get(id);
  };
  const [ship, crew] = await Promise.all([
    api.getEntityById({ label: Entity.IDS.SHIP, id: shipId }), loadCrew(crewId)
  ]);
  if (!ship?.Control?.controller?.id || !ship?.Location?.location || !crew) return checkingShipEjection;
  if (!isForceLaunch(crew, ship)) return blocked('Selected crew controls this ship');
  if (!isLandedShip(ship)) return blocked('Ship is not landed or docked');
  const location = ship.Location.location;
  const isSurface = location.label === Entity.IDS.LOT;
  const [controller, target, asteroid] = await Promise.all([
    loadCrew(ship.Control.controller.id),
    api.getEntityById({ ...location, components: [...PERMISSION_COMPONENTS, 'Location', 'Dock'] }),
    isSurface ? api.getEntityById({ label: Entity.IDS.ASTEROID, id: Number(Lot.toPosition(location.id)?.asteroidId), components: PERMISSION_COMPONENTS }) : null
  ]);
  const eligibility = await getShipEjectionEligibility({
    ship, crew, controller, lot: isSurface ? target : null, asteroid, building: isSurface ? null : target,
    blockTime, accountAddress, loadCrew,
    checkPolicy: (agreement, entity, permitted, permission) => checkContractPolicy(provider, agreement, entity, permitted, permission)
  });
  return { ...eligibility, ship };
};
