import { Entity } from '@influenceth/sdk';

const searchTypes = {
  [Entity.IDS.ASTEROID]: ['asteroids'],
  [Entity.IDS.BUILDING]: ['buildings'],
  [Entity.IDS.CREW]: ['crews'],
  [Entity.IDS.CREWMATE]: ['crewmates'],
  [Entity.IDS.DEPOSIT]: ['deposits'],
  [Entity.IDS.LOT]: ['lots', 'leases'],
  [Entity.IDS.SHIP]: ['ships']
};

// Use the same filter names as entity collections and activity newGroupEval.
export const searchInvalidationFilters = (type, filters) => {
  switch (type) {
    case 'buildings': return { asteroidId: filters.asteroid, controllerId: filters.controller, status: filters.construction };
    case 'ships': return { asteroidId: filters.asteroid };
    case 'deposits': return { asteroidId: filters.asteroid, resourceId: filters.resource };
    case 'leases': return { asteroidId: filters.asteroid };
    case 'crews': return { owner: filters.owner };
    default: return {};
  }
};

const overlaps = (a, b) => [a].flat().some(value => [b].flat().some(other => String(value) === String(other)));

export const searchAffectedByEntity = (query, { id, label, newGroupEval }) => {
  if (query.queryKey[0] !== 'search' || !searchTypes[label]?.includes(query.queryKey[1])) return false;
  if (query.state.data?.hits?.some(entity => Number(entity.id) === Number(id) && Number(entity.label) === Number(label))) return true;

  const { updatedValues = {}, filters = {} } = newGroupEval || {};
  const unchanged = { ...filters };
  // Changed fields cannot exclude old search pages: the entity may have left them.
  Object.keys(updatedValues).forEach(key => { delete unchanged[key]; });
  // Buildings and deposits cannot move between asteroids, including when created.
  if ([Entity.IDS.BUILDING, Entity.IDS.DEPOSIT].includes(label) && updatedValues.asteroidId != null) {
    unchanged.asteroidId = updatedValues.asteroidId;
  }
  return !Object.entries(query.meta?.searchFilters || {}).some(([key, value]) => (
    value != null && value !== '' && unchanged[key] != null && !overlaps(value, unchanged[key])
  ));
};
