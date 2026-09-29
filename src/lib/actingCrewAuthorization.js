import { Address, Authorization, Entity } from '@influenceth/sdk';
import { checkingAuthorization } from './authorization';

// Readiness is separate from SDK access rules. Crew eviction and repossession
// also prohibit emergency mode on the crew's current ship (or escape module).
export const recheckActingCrew = async ({ crew, recheck, accountAddress, blockTime, isLaunched, requireReady = true, asteroidId }) => {
  let result = await recheck('controls', [crew, crew], [crew]);
  if (result.status !== 'allowed') return result;
  let current = result.entities?.find((entity) => Authorization.sameEntity(entity, crew));
  const location = current?.Location?.location;
  if (!location) return checkingAuthorization;
  if (location.label === Entity.IDS.SHIP) {
    result = await recheck('controls', [crew, crew], [crew, location]);
    if (result.status !== 'allowed') return result;
    current = result.entities?.find((entity) => Authorization.sameEntity(entity, crew));
    if (!Authorization.sameEntity(current?.Location?.location, location)) return checkingAuthorization;
  }
  const ship = location.label === Entity.IDS.SHIP
    ? result.entities?.find((entity) => Authorization.sameEntity(entity, location))?.Ship : current?.Ship;
  if (!current?.Crew || current.Crew.delegatedTo == null || !Array.isArray(current.Crew.roster)
    || current.Crew.readyAt == null || blockTime == null || ship?.emergencyAt == null) return checkingAuthorization;
  if (!Address.areEqual(current.Crew.delegatedTo, accountAddress)) return { status: 'denied', reason: 'Crew delegation changed' };
  if (!current.Crew.roster.length) return { status: 'denied', reason: 'Crew required' };
  if (!isLaunched) return { status: 'denied', reason: 'Crew not launched' };
  if (ship.emergencyAt > 0) return { status: 'denied', reason: 'Crew is in emergency mode' };
  if (requireReady && current.Crew.readyAt > blockTime) return { status: 'denied', reason: 'Crew busy' };
  if (asteroidId != null) {
    if (!current.Location?.locations) return checkingAuthorization;
    if (!current.Location.locations.some((item) => item.label === Entity.IDS.ASTEROID && Number(item.id) === Number(asteroidId))) return { status: 'denied', reason: 'Crew is away' };
  }
  return { status: 'allowed', crew: current };
};
