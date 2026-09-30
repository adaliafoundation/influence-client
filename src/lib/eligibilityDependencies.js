// Track the entities actually consulted by a display check, including policy
// controllers loaded by the SDK. Action/submission checks still bypass this cache.
export const createEligibilityDependencies = (entities = [], { lotId } = {}) => {
  const keys = new Set();
  const add = entity => {
    if (!entity) return;
    if (entity.id != null && entity.label != null) keys.add(`${entity.label}:${Number(entity.id)}`);
    add(entity.Control?.controller);
    add(entity.UseLot?.tenant);
    (entity.Location?.locations || []).forEach(add);
  };
  entities.forEach(add);
  return {
    add,
    affects: entity => keys.has(`${entity.label}:${Number(entity.id)}`)
      || (!!lotId && Number(entity.newGroupEval?.updatedValues?.lotId) === Number(lotId))
  };
};
