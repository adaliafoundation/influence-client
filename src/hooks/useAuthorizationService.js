import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { checkingAuthorization, loadAuthorization } from '~/lib/authorization';
import { createAuthorizationLoader } from '~/lib/authorizationData';
import api from '~/lib/api';

// Requests are collected during render, then resolved after commit. All consumers
// share the dependency loader without performing network work during rendering.
const useAuthorizationService = ({ provider, blockNumber, blockTime, accountAddress, selectedCrewId, queryClient, simulation }) => {
  const [dataVersion, invalidate] = useReducer((n) => n + 1, 0);
  const [revision, changed] = useReducer((n) => n + 1, 0);
  const scope = useMemo(() => new Map(), [provider, blockNumber, blockTime, accountAddress, selectedCrewId, simulation, dataVersion]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  useEffect(() => queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'updated' && ['entity', 'entities', 'agreements', 'constants'].includes(event.query.queryKey[0])
      && ['success', 'invalidate'].includes(event.action?.type)) invalidate();
  }), [queryClient]);
  const source = useMemo(() => simulation ? {
    getEntityById: ({ label, id }) => Promise.resolve(queryClient.getQueryData(['entity', label, Number(id)]))
  } : createAuthorizationLoader(api), [scope, simulation, queryClient]);
  const authorize = useCallback((method, args, entities = []) => {
    if (args.some((arg) => arg == null)) return checkingAuthorization;
    // Only component data belongs in the key, not client methods or derived UI metadata.
    const key = JSON.stringify([method, args, entities], (name, value) => name.startsWith('_') ? undefined : typeof value === 'bigint' ? value.toString() : value);
    if (!scope.has(key)) {
      scope.set(key, { method, args, entities, result: checkingAuthorization });
      queueMicrotask(changed);
    }
    return scope.get(key).result;
  }, [scope, revision]);
  useEffect(() => {
    for (const request of scope.values()) {
      if (request.started) continue;
      request.started = true;
      loadAuthorization({ ...request, api: source, provider, blockTime, blockNumber, fresh: !simulation }).then((result) => {
        request.result = result;
        if (currentScope.current === scope) changed();
      });
    }
  });
  const recheckAuthorization = useCallback(async (method, args, entities = []) => {
    const started = scope;
    if (currentScope.current !== started) return checkingAuthorization;
    const result = await loadAuthorization({ api: simulation ? source : api, provider, blockTime, blockNumber, method, args, entities, fresh: !simulation });
    return currentScope.current === started ? result : checkingAuthorization;
  }, [scope, source, provider, blockTime, blockNumber, simulation]);
  return { authorize, recheckAuthorization, retryAuthorization: invalidate };
};
export default useAuthorizationService;
