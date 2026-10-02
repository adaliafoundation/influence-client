import { Entity, Inventory } from '@influenceth/sdk';
import esb from 'elastic-builder';

export const inventoryTypesForSelection = ({ excludeSites, itemIds, itemIdsRequireAllAllowed }) => Object.entries(Inventory.TYPES)
  .filter(([, type]) => {
    if (excludeSites && type.category === Inventory.CATEGORIES.SITE) return false;
    if (!itemIds?.length || !type.productConstraints) return true;
    const accepts = id => Object.prototype.hasOwnProperty.call(type.productConstraints, id);
    return itemIdsRequireAllAllowed ? itemIds.every(accepts) : itemIds.some(accepts);
  }).map(([id]) => Number(id)).filter(Boolean).sort((a, b) => a - b);

export const inventoryCandidateQuery = ({ inventoryTypes, productIds, isSourcing } = {}) => {
  const query = esb.boolQuery().filter(esb.termQuery('Inventories.status', Inventory.STATUSES.AVAILABLE));
  if (inventoryTypes) query.filter(esb.termsQuery('Inventories.inventoryType', inventoryTypes));
  if (isSourcing) query.filter(esb.rangeQuery('Inventories.mass').gt(0));
  if (productIds?.length) query.filter(esb.termsQuery('Inventories.contents.product', productIds));
  return esb.nestedQuery().path('Inventories').query(query);
};

// Apply slot and positive-amount checks before requesting any permission dependencies.
export const selectInventoryCandidates = (entities, { inventoryTypes, productIds, isSourcing, otherEntity, otherInvSlot }) => entities
  .map(entity => ({ ...entity, Inventories: (entity.Inventories || []).filter(inv => {
    if (inv.status !== Inventory.STATUSES.AVAILABLE || !inventoryTypes.includes(Number(inv.inventoryType))) return false;
    if (entity.label === otherEntity?.label && Number(entity.id) === Number(otherEntity.id)
      && (!otherInvSlot || inv.slot === otherInvSlot)) return false;
    if (isSourcing && !inv.mass) return false;
    return !productIds?.length || inv.contents?.some(item => item.amount > 0 && productIds.includes(Number(item.product)));
  }) }))
  .filter(entity => entity.Inventories.length > 0);

// A newly stocked inventory may not be in this filtered collection yet. Use the
// existing event invalidation mechanism, including when its location is unknown.
export const inventoryCandidateAffected = (change, label, asteroidId, entity) => {
  if (change.label !== label) return false;
  const location = change.newGroupEval?.filters?.asteroidId
    ?? entity?.Location?.locations?.find(location => location.label === Entity.IDS.ASTEROID)?.id;
  return location == null || Number(location) === Number(asteroidId);
};
