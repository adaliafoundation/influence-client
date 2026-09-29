const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const { createAuthorizationLoader, collectInventoryCandidates } = require('./authorizationData');

test('batches candidates by type/projection and shares repeated controller reads', async () => {
  const api = { getEntities: jest.fn(async ({ label, ids }) => ids.map((id) => ({ label, id }))) };
  const loader = createAuthorizationLoader(api);
  const requests = Array.from({ length: 205 }, (_, id) => ({ label: 5, id: id + 1, components: ['Control'] }));
  const results = await Promise.all([...requests.map(loader.getEntityById), loader.getEntityById(requests[0])]);
  expect(results).toHaveLength(206);
  expect(api.getEntities).toHaveBeenCalledTimes(3);
  expect(results[0]).toBe(results[205]);
});

test('inventory discovery continues beyond a full page without permission filtering', async () => {
  const page = Array.from({ length: 1000 }, (_, id) => ({ _source: { id }, sort: [id] }));
  const search = jest.fn().mockResolvedValueOnce({ hits: { hits: page } }).mockResolvedValueOnce({ hits: { hits: [{ _source: { id: 1000 }, sort: [1000] }] } });
  expect(await collectInventoryCandidates(search, { query: { match_all: {} } })).toHaveLength(1001);
  expect(search.mock.calls[1][0].search_after).toEqual([999]);
});

test('a missing pagination cursor fails instead of silently hiding candidates', async () => {
  const search = jest.fn(async () => ({ hits: { hits: Array.from({ length: 1000 }, (_, id) => ({ _source: { id } })) } }));
  await expect(collectInventoryCandidates(search, {})).rejects.toThrow('all inventory candidates');
});
