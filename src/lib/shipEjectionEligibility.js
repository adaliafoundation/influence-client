import { loadAuthorization } from './authorization';
import { Authorization, Entity, Lot } from '@influenceth/sdk';
import { PERMISSION_COMPONENTS, sameAccount, checkContractPolicy } from './lotUsageAuthorization';

export const checkingShipEjection = { status: 'checking', reason: 'Checking ship protection' };
const blocked = (reason) => ({ status: 'blocked', reason });
export const isForceLaunch = (crew, ship) => !!crew?.id && !!ship?.Control?.controller?.id
  && Authorization.create({ entities: [{ ...ship, label: Entity.IDS.SHIP, Control: { controller: { ...ship.Control.controller, label: Entity.IDS.CREW } } }] }).forceLaunch({ ...crew, label: Entity.IDS.CREW }, { ...ship, label: Entity.IDS.SHIP }).status === 'allowed';
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

  if (location.label === Entity.IDS.BUILDING && !building?.Dock) return checkingShipEjection;
  const entities = [ship, crew, controller, lot, asteroid, building].filter(Boolean);
  const result = await loadAuthorization({
    entities, blockTime, method: 'shipEviction', args: [crew, ship],
    api: { getEntityById: (entity) => entity.label === Entity.IDS.CREW ? loadCrew(entity.id) : Promise.resolve(entities.find((e) => Authorization.sameEntity(e, entity))) },
    checkPolicy: async (request) => {
      const allowed = await checkPolicy({ address: request.address }, request.target, request.permitted, request.permission);
      return typeof allowed === 'boolean' ? { status: 'resolved', allowed } : { status: 'failed' };
    }
  });
  if (result.status === 'unresolved') return checkingShipEjection;
  return result.status === 'allowed' ? { status: 'allowed', reason: null } : blocked('Ship has permission to remain');
};

// Fresh reads are also used by the submission handler; no cached protection result authorizes eviction.
export const loadShipEjectionEligibility = async ({ api, provider, shipId, crewId, blockTime, blockNumber, accountAddress }) => {
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
    checkPolicy: (agreement, entity, permitted, permission) => checkContractPolicy(provider, agreement, entity, permitted, permission, blockNumber)
  });
  return { ...eligibility, ship };
};
