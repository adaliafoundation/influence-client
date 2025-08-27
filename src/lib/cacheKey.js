import { Entity } from '@influenceth/sdk';
import { appConfig } from '~/appConfig';

/*              CACHE KEY DICTIONARY
non-entity based
- [ 'actionItems', crewId ],
- [ 'activities', entityLabel, entityId, 'earliest' ],
- [ 'activities', entityLabel, entityId, 'unresolved' ],
- [ 'activities', entityLabel, entityId ],
- [ 'agreements', accountAddress ],
- [ 'asteroidPackedLotData', asteroidId ]
- [ 'constants', constantOrConstants ],
- [ 'lotEntitiesPrepopulation', lotId ],
- [ 'exchangeOrderSummary', asteroidId, product ],
- [ 'faucetInfo', account ],
- [ 'inventoryOrders', inventory, inventorySlot ],
- [ 'productOrderSummary', entityLabel, entityId ],
- [ 'referrals', token ],
- [ 'search', assetType, query ],
- [ 'walletBalance', 'eth', accountAddress ],
- [ 'walletBalance', 'strk', accountAddress ],
- [ 'walletBalance', 'sway', accountAddress ],
- [ 'walletBalance', 'usdc', accountAddress ],
- [ 'user', token ],
- [ 'watchlist', token ],

entity-based
- [ 'entity', label, id ],
- [ 'entities', label, filters ]
*/

/*            README
Entity-based cache keys are written in to enable accurate cache invalidation
with each received chain event. This happens in ActivitiesContext, and the
invalidation configs are defined per event type in lib/activities.js.

Each getInvalidation returns an array of one or more raw queryKeys (an array)
that will be passed directly to queryClient.invalidateQueries and one or more
entity invalidation configs (an object).

Each entity-based invalidation config contains id and label (required) and
newGroupEval (optional). The id and label will invalidate the individual cached
entity (i.e. ['entity', label, id]), then it will search all 'entities' cache
entries of that label for the presences of that specific label-id combo. If found,
it will also invalidate that specific 'entities' (group) cache key.

That leaves handling 'entities' group cache keys where whatever just changed
about the entity *might* mean the updated entity should now show up in the
'entities' group. That is where `newGroupEval` comes in.

newGroupEval contains two keys:
- updatedValues: the most optimistic changes possible from the event
    (i.e. for extraction, a deposit may or may not become depleted, so we
    optimistically assume for the updatedValues that { isDepleted: true })
- filters (optional): anything else we know to be true about the filterable
    values for that entity label

For newly created entities, all values should be in updatedValues since
they all are changes that could result in the new entity belonging to an
entities group in the cache.

For this to work properly, we must:
1) Accurately write the filter on each `entities` cache key to cover all
   possible discriminating keys for whether or not an entity would be included
2) Accurately maintain newGroupEval values (whether a new event is introduced
   or a new validFilterKey is introduced)

If a new 'entities' filterKey is added, we need to review all existing
entity newGroupEval's for that entity label and (as needed/possible), add to
the updatedValues or filters for that eval.

NOTE: this file is mostly overkill to try to ensure that new filter keys
are only introduced in the context of these guidelines :)
*/

const validFilterKeys = {
  // ['entities', Entity.IDS.ASTEROID, { controllerId, owner }]
  [Entity.IDS.ASTEROID]: ['controllerId', 'owner'],

  // ['entities', Entity.IDS.BUILDING, { asteroidId, hasComponent, hasPermission, permissionCrewId, permissionAccount }]
  // ['entities', Entity.IDS.BUILDING, { asteroidId, hasComponent, status }]
  // ['entities', Entity.IDS.BUILDING, { lotId }]
  // ['entities', Entity.IDS.BUILDING, { controllerId }]
  [Entity.IDS.BUILDING]: ['asteroidId', 'controllerId', 'hasComponent', 'hasPermission', 'lotId', 'permissionCrewId', 'permissionAccount', 'status'],

  // ['entities', Entity.IDS.CREW, { owner }]
  // ['entities', Entity.IDS.CREW, { stationUuid }]
  [Entity.IDS.CREW]: ['owner', 'stationUuid'],

  // ['entities', Entity.IDS.CREWMATE, { owner }]
  [Entity.IDS.CREWMATE]: ['owner'],

  // ['entities', Entity.IDS.DELIVERY, { destination, status }]
  // ['entities', Entity.IDS.DELIVERY, { origin, status }]
  [Entity.IDS.DELIVERY]: ['destination', 'origin', 'status'],

  // ['entities', Entity.IDS.DEPOSIT, { asteroidId, resourceId, controllerId, isDepleted }]
  // ['entities', Entity.IDS.DEPOSIT, { lotId }]
  [Entity.IDS.DEPOSIT]: ['asteroidId', 'controllerId', 'isDepleted', 'lotId', 'resourceId'],

  // ['entities', Entity.IDS.SHIP, { asteroidId, hasComponent, hasPermission, permissionCrewId, permissionAccount, isOnSurface, status }]
  // ['entities', Entity.IDS.SHIP, { asteroidId, status }]
  // ['entities', Entity.IDS.SHIP, { controllerId, owner }]
  // ['entities', Entity.IDS.SHIP, { lotId }]
  [Entity.IDS.SHIP]: ['asteroidId', 'controllerId', 'hasComponent', 'hasPermission', 'isOnSurface', 'lotId', 'owner', 'permissionCrewId', 'permissionAccount', 'status']
}

export const entitiesCacheKey = (label, filters) => {
  if (appConfig.get('App.verboseLogs')) {
    if (typeof filters === 'object') {
      (Object.keys(filters).find((k) => {
        if (!validFilterKeys[label].includes(k)) {
          console.error(`Unsupported "entities" cache key filter: "${k}". Read the comments in lib/cacheKey.js to find out how to add support.`);
          return true;
        }
        return false;
      }))
    }
  }

  return ['entities', label, filters];
};




