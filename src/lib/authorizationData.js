import { entityKey } from './authorization';

// A render may request access to hundreds of inventory candidates. Batch component
// reads by projection and entity type, and share controller reads within the authorization cache.
export const createAuthorizationLoader = (api) => {
  const reads = new Map();
  const batches = new Map();
  let scheduled = false;
  const flush = async () => {
    scheduled = false;
    const groups = [...batches.values()];
    batches.clear();
    await Promise.all(groups.map(async (group) => {
      for (let offset = 0; offset < group.length; offset += 100) {
        const batch = group.slice(offset, offset + 100);
        try {
          const records = await api.getEntities({ label: batch[0].request.label, components: batch[0].request.components, ids: batch.map(({ request }) => request.id) });
          const byId = new Map(records.map((entity) => [entityKey(entity), entity]));
          batch.forEach(({ request, resolve }) => resolve(byId.get(entityKey(request)) || null));
        } catch (error) {
          batch.forEach(({ reject }) => reject(error));
        }
      }
    }));
  };
  return {
    updateEntities: (entities) => {
      const updates = new Map(entities.map(entity => [entityKey(entity), entity]));
      for (const [key, read] of reads) {
        const update = updates.get(entityKey(JSON.parse(key)));
        if (update) reads.set(key, read.then(record => ({ ...record, ...update })));
      }
    },
    getEntityById: (request) => {
      const key = JSON.stringify(request);
      if (!reads.has(key)) reads.set(key, new Promise((resolve, reject) => {
        const groupKey = JSON.stringify([request.label, request.components]);
        if (!batches.has(groupKey)) batches.set(groupKey, []);
        batches.get(groupKey).push({ request, resolve, reject });
        if (!scheduled) {
          scheduled = true;
          queueMicrotask(flush);
        }
      }));
      return reads.get(key);
    }
  };
};

export const collectInventoryCandidates = async (search, body) => {
  const entities = [];
  let cursor;
  while (true) {
    const response = await search({ ...body, from: 0, size: 1000, sort: [{ id: 'asc' }], ...(cursor ? { search_after: cursor } : {}) });
    const hits = response.hits.hits;
    entities.push(...hits.map((hit) => hit._source));
    if (hits.length < 1000) return entities;
    const next = hits[hits.length - 1].sort;
    if (!next || JSON.stringify(next) === JSON.stringify(cursor)) throw new Error('Unable to load all inventory candidates');
    cursor = next;
  }
};
