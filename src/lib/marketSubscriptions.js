import { Entity, Lot } from '@influenceth/sdk';
import { recoverQueries } from './queryRecovery';

export const marketSubscriptionsByClient = new WeakMap();

export const marketQueryTypes = new Set(['orderList', 'inventoryOrders', 'exchangeOrderSummary', 'productOrderSummary', 'shoppingOrderList']);
export const isMarketEvent = type => /^(Buy|Sell)Order(Created|Filled|Cancelled)$/.test(type);
export const asteroidOf = entity => Number(entity?.label === Entity.IDS.ASTEROID ? entity.id
  : entity?.label === Entity.IDS.LOT ? Lot.toPosition(entity.id)?.asteroidId
    : entity?.Location?.locations?.find(location => location.label === Entity.IDS.ASTEROID)?.id);

export const marketEventMatches = (scope, values) => {
  if (scope.storage) return Number(scope.storage.id) === Number(values.storage?.id) && scope.storage.label === values.storage?.label;
  if (scope.lotId && values.lotId && Number(scope.lotId) !== Number(values.lotId)) return false;
  if (scope.exchangeId && Number(scope.exchangeId) !== Number(values.exchange?.id)) return false;
  if (scope.products?.length && !scope.products.some(id => Number(id) === Number(values.product))) return false;
  return true;
};

// One listener and activation timer per asteroid, shared by all mounted market queries.
export const createMarketSubscriptions = ({ client, socket, api }) => {
  const rooms = new Map();
  const inFlight = new Set();
  const refresh = (records, settleCurrent = true) => {
    const pending = Promise.all([...new Map(records.map(r => [JSON.stringify(r.key), r])).values()]
      .map(async r => {
        const query = client.getQueryCache().find({ queryKey: r.key, exact: true });
        // A response requested before an event may omit that event. Let it finish
        // before refreshing, rather than treating that older request as recovery.
        if (settleCurrent && query?.state.fetchStatus === 'fetching') await query.promise?.catch(() => {});
        return client.invalidateQueries({ queryKey: r.key, exact: true }, { cancelRefetch: false });
      }));
    inFlight.add(pending);
    pending.finally(() => inFlight.delete(pending));
    return pending;
  };
  const flushRoom = room => {
    clearTimeout(room.batchTimer);
    room.batchTimer = null;
    const records = [...room.pending];
    room.pending.clear();
    return refresh(records);
  };
  const join = asteroidId => {
    const room = { records: new Set(), pending: new Set(), activation: null, disposed: false, generation: 0 };
    const schedule = timestamp => {
      if (!timestamp || room.disposed || (room.activation && room.activation <= timestamp)) return;
      clearTimeout(room.activationTimer);
      room.activation = timestamp;
      room.activationTimer = setTimeout(async () => {
        room.activation = null;
        if (timestamp * 1000 > Date.now()) { schedule(timestamp); return; }
        await refresh([...room.records]);
        if (!room.disposed) discover();
      }, Math.min(2147483647, Math.max(0, timestamp * 1000 - Date.now() + 250)));
    };
    const discover = async () => {
      const generation = ++room.generation;
      try {
        const timestamp = await client.fetchQuery({
          queryKey: ['marketOrderActivation', asteroidId],
          queryFn: () => api.getNextMarketOrderActivation(asteroidId),
          staleTime: 0,
          retry: 2
        });
        if (!room.disposed && generation === room.generation) schedule(timestamp);
      } catch (error) {
        // Recovery retries on reconnect; ordinary query errors remain in their views.
        console.warn('Unable to schedule market order activation', error);
      }
    };
    room.message = socket.registerMessageHandler(({ type, body }) => {
      if (!isMarketEvent(type)) return;
      const rawValues = body?.event?.returnValues;
      if (!rawValues) return;
      const exchange = client.getQueryData(['entity', Entity.IDS.BUILDING, Number(rawValues.exchange?.id)]);
      const values = { ...rawValues, lotId: exchange?.Location?.locations?.find(location => location.label === Entity.IDS.LOT)?.id };
      room.records.forEach(record => { if (marketEventMatches(record.scope, values)) room.pending.add(record); });
      if (!room.batchTimer) room.batchTimer = setTimeout(() => flushRoom(room), 2500);
      if (Number(values.validTime) > Date.now() / 1000) schedule(Number(values.validTime));
    }, `Asteroid::${asteroidId}`);
    room.connection = socket.registerConnectionHandler(connected => {
      if (connected) {
        room.records.forEach(record => recoverQueries(client, { queryKey: record.key, exact: true }));
        discover();
      }
    });
    rooms.set(asteroidId, room);
    discover();
    return room;
  };
  return {
    async flush() {
      rooms.forEach(room => { if (room.pending.size) flushRoom(room); });
      await Promise.all([...inFlight]);
    },
    acquire(key, scope) {
      const asteroidId = Number(scope.asteroidId);
      const room = rooms.get(asteroidId) || join(asteroidId);
      const record = { key, scope };
      const alreadyObserved = [...room.records].some(r => JSON.stringify(r.key) === JSON.stringify(key));
      room.records.add(record);
      // A closed view has not been receiving events. Refresh its cached result on
      // reopening, but share the existing request when another consumer is mounted.
      if (!alreadyObserved && client.getQueryData(key) !== undefined) refresh([record], false);
      return () => {
        room.records.delete(record);
        room.pending.delete(record);
        if (!room.records.size) {
          room.disposed = true;
          clearTimeout(room.batchTimer);
          clearTimeout(room.activationTimer);
          socket.unregisterMessageHandler(room.message);
          socket.unregisterConnectionHandler(room.connection);
          rooms.delete(asteroidId);
        }
      };
    }
  };
};
