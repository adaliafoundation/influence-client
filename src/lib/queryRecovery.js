// These queries reflect game state that may change while websocket events are missed.
// Quotes, checkout polling and static resources recover independently.
const gameplayQueryTypes = new Set([
  'entity', 'entities', 'activities', 'actionItems', 'agreements', 'search',
  'asteroidPackedLotData', 'lotEntitiesPrepopulation', 'walletBalance',
  'planningEligibility', 'shipEjectionEligibility', 'starterMissions', 'missionBindings',
  'orderList', 'inventoryOrders', 'exchangeOrderSummary', 'productOrderSummary',
  'shoppingOrderList', 'crewOpenOrders', 'constants', 'inbox', 'user', 'watchlist', 'annotations'
]);

const recoveringQueries = new WeakMap();

// Reconnect listeners and block recovery share one request per cached query.
export const recoverQueries = (client, filters) => Promise.all(
  client.getQueryCache().findAll(filters).map(query => {
    const existing = recoveringQueries.get(query);
    if (existing) return existing;
    const recovery = Promise.resolve().then(async () => {
      // A request started before the gap may not contain the missed changes.
      if (query.state.fetchStatus === 'fetching') await query.promise?.catch(() => {});
      // Logout or a cache clear must not resurrect the old query.
      if (client.getQueryCache().get(query.queryHash) !== query) return;
      return client.invalidateQueries({ queryKey: query.queryKey, exact: true }, { cancelRefetch: false });
    }).finally(() => recoveringQueries.delete(query));
    recoveringQueries.set(query, recovery);
    return recovery;
  })
);

export const recoverGameplayQueries = client => recoverQueries(client, {
  predicate: query => gameplayQueryTypes.has(query.queryKey[0])
});
