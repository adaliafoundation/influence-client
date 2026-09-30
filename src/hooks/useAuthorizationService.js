import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { checkingAuthorization, entityKey, loadAuthorization, normalizeAuthorizationEntity } from '~/lib/authorization';
import { createAuthorizationLoader } from '~/lib/authorizationData';
import api from '~/lib/api';

// UI metadata (including countdowns) must not create new permission requests.
const serialize = (value, identityOnly = false) => JSON.stringify(value, (name, item) => {
  if (name.startsWith('_') || name === 'Inventories') return undefined;
  if (item?.label != null && item?.id != null) {
    return Object.fromEntries(Object.entries(normalizeAuthorizationEntity(item)).filter(([key]) =>
      key === 'label' || key === 'id' || (!identityOnly && /^[A-Z]/.test(key))));
  }
  return typeof item === 'bigint' ? item.toString() : item;
});

const useAuthorizationService = ({ provider, blockNumber, blockTime, accountAddress, selectedCrewId, queryClient, simulation }) => {
  const [revision, changed] = useReducer(n => n + 1, 0);
  const notificationQueued = useRef(false);
  const scheduleChange = useCallback(() => {
    if (notificationQueued.current) return;
    notificationQueued.current = true;
    queueMicrotask(() => {
      notificationQueued.current = false;
      changed();
    });
  }, []);
  const hasBlockTime = blockTime != null;
  const scope = useMemo(() => new Map(), [provider, accountAddress, selectedCrewId, simulation, hasBlockTime]);
  const displayed = useMemo(() => new Map(), [scope]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const currentBlock = useRef();
  currentBlock.current = { blockTime, blockNumber };
  const source = useMemo(() => simulation ? {
    getEntityById: ({ label, id }) => Promise.resolve(queryClient.getQueryData(['entity', label, Number(id)]))
  } : createAuthorizationLoader(api), [scope, simulation, queryClient]);

  const updateEntities = useCallback((entities) => {
    const updates = new Map(entities.filter(entity => entity?.label != null && entity?.id != null)
      .map(entity => [entityKey(entity), entity]));
    if (!updates.size) return;
    source.updateEntities?.([...updates.values()]);
    let updated = false;
    for (const request of scope.values()) {
      const records = request.entities;
      if (!records.some(entity => updates.has(entityKey(entity)))) continue;
      const next = records.map(entity => updates.has(entityKey(entity)) ? { ...entity, ...updates.get(entityKey(entity)) } : entity);
      if (serialize(next) === serialize(records)) continue;
      request.entities = next;
      request.started = false;
      request.version += 1;
      updated = true;
    }
    if (updated) scheduleChange();
  }, [scope, source, scheduleChange]);

  useEffect(() => queryClient.getQueryCache().subscribe(event => {
    // React to actual component changes, never to invalidations or unrelated query traffic.
    if (event.type !== 'updated' || event.action?.type !== 'success') return;
    const type = event.query.queryKey[0];
    if (type === 'entity') updateEntities([event.query.state.data]);
    if (type === 'entities' && Array.isArray(event.query.state.data)) updateEntities(event.query.state.data);
  }), [queryClient, updateEntities]);

  const authorize = useCallback((method, args, entities = []) => {
    if (args.some(arg => arg == null)) return checkingAuthorization;
    const displayKey = serialize([method, args], true);
    const key = serialize([method, args, entities]);
    // Concurrent consumers may have different component projections of the same entity.
    // Keep both evaluations instead of replacing each other on every render.
    if (!scope.has(key)) {
      scope.set(key, { method, args, entities, displayKey, version: 0, result: displayed.get(displayKey) || checkingAuthorization });
      scheduleChange();
    }
    const request = scope.get(key);
    request.usedRevision = revision;
    return request.result;
  }, [scope, displayed, revision, scheduleChange]);

  useEffect(() => {
    for (const [key, request] of scope) {
      // Drop projections no longer used after consumers have seen the latest revision.
      if (request.usedRevision < revision - 1) {
        scope.delete(key);
        continue;
      }
      if (request.started) continue;
      request.started = true;
      const version = request.version;
      // Display checks use supplied components and load only missing dependencies.
      // Full network refreshes belong to explicit action checks below.
      loadAuthorization({ ...request, api: source, provider, ...currentBlock.current }).then(result => {
        if (currentScope.current !== scope || scope.get(key) !== request || request.version !== version) return;
        displayed.set(request.displayKey, result);
        request.result = result;
        request.entities = result.entities || request.entities;
        scheduleChange();
      });
    }
  });

  const recheckAuthorization = useCallback(async (method, args, entities = []) => {
    if (currentScope.current !== scope) return checkingAuthorization;
    const result = await loadAuthorization({ api: simulation ? source : api, provider, ...currentBlock.current, method, args, entities, fresh: !simulation });
    if (currentScope.current !== scope) return checkingAuthorization;
    updateEntities(result.entities || []);
    const displayKey = serialize([method, args], true);
    displayed.set(displayKey, result);
    for (const request of scope.values()) {
      if (request.displayKey !== displayKey) continue;
      request.version += 1;
      request.started = true;
      request.result = result;
      request.entities = result.entities || request.entities;
    }
    changed();
    return result;
  }, [scope, displayed, source, provider, simulation, updateEntities]);

  const refreshAuthorization = useCallback(async (targets) => {
    const keys = new Set(targets.filter(Boolean).map(entityKey));
    const requests = [...scope.entries()].filter(([, request]) => request.entities.some(entity => keys.has(entityKey(entity))));
    const freshSource = simulation ? source : createAuthorizationLoader(api);
    const results = await Promise.all(requests.map(async ([key, request]) => [key, request,
      await loadAuthorization({ ...request, api: freshSource, provider, ...currentBlock.current, fresh: !simulation })]));
    if (currentScope.current !== scope) return checkingAuthorization;
    for (const [key, request, result] of results) {
      if (scope.get(key) !== request) continue;
      displayed.set(request.displayKey, result);
      request.version += 1;
      request.started = true;
      request.result = result;
      request.entities = result.entities || request.entities;
    }
    changed();
    // Each button decides from its own refreshed checks (including lease alternatives).
    return { status: 'allowed' };
  }, [scope, displayed, source, provider, simulation]);

  const retryAuthorization = useCallback(() => {
    for (const request of scope.values()) {
      request.started = false;
      request.version += 1;
    }
    changed();
  }, [scope]);
  return { authorize, recheckAuthorization, refreshAuthorization, retryAuthorization };
};
export default useAuthorizationService;
