import { QueryClient as TanstackQueryClient, QueryClientProvider as TanstackQueryClientProvider, useInfiniteQuery as useTanstackInfiniteQuery, useIsFetching as useTanstackIsFetching, useMutation as useTanstackMutation, useQuery as useTanstackQuery, useQueryClient as useTanstackQueryClient } from '@tanstack/react-query';

const QUERY_FILTER_KEYS = new Set([
  'type',
  'exact',
  'predicate',
  'queryKey',
  'stale',
  'fetchStatus',
  'refetchType'
]);

const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const isPrimitive = (value) => value === null || ['string', 'number', 'boolean'].includes(typeof value);

const normalizeQueryKey = (queryKey) => {
  if (queryKey === undefined || queryKey === null) return queryKey;
  return Array.isArray(queryKey) ? queryKey : [queryKey];
};

const normalizeFilter = (filters = {}) => {
  if (!isPlainObject(filters)) return filters;

  const normalized = { ...filters };
  if (normalized.queryKey !== undefined) {
    normalized.queryKey = normalizeQueryKey(normalized.queryKey);
  }
  return normalized;
};

const isQueryFilterObject = (value) => {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 0 || keys.some((key) => QUERY_FILTER_KEYS.has(key));
};

const normalizeQueryOptions = (options = {}) => {
  const normalized = { ...options };

  if (Object.prototype.hasOwnProperty.call(normalized, 'cacheTime') && !Object.prototype.hasOwnProperty.call(normalized, 'gcTime')) {
    normalized.gcTime = normalized.cacheTime;
  }

  if (normalized.queryKey !== undefined) {
    normalized.queryKey = normalizeQueryKey(normalized.queryKey);
  }

  delete normalized.cacheTime;
  return normalized;
};

const normalizeQueryFilterArgs = (args) => {
  if (!args.length) return args;

  const [arg1, arg2, arg3] = args;

  if (isQueryFilterObject(arg1)) {
    return [normalizeFilter(arg1), arg2];
  }

  if (arg1 !== undefined) {
    const queryKey = normalizeQueryKey(arg1);

    // v3 style: invalidateQueries('book', 123)
    if (arg2 !== undefined && !isPlainObject(arg2) && !Array.isArray(arg2)) {
      return [{ queryKey: [...queryKey, arg2] }, arg3];
    }

    const filters = isPlainObject(arg2) ? arg2 : {};
    return [normalizeFilter({ ...filters, queryKey }), arg3];
  }

  return args;
};

export class QueryClient extends TanstackQueryClient {
  getQueryData(queryKey) {
    return super.getQueryData(normalizeQueryKey(queryKey));
  }

  setQueryData(queryKey, updater, options) {
    return super.setQueryData(normalizeQueryKey(queryKey), updater, options);
  }

  setQueriesData(filters, updater, options) {
    return super.setQueriesData(normalizeFilter(filters), updater, options);
  }

  invalidateQueries(...args) {
    return super.invalidateQueries(...normalizeQueryFilterArgs(args));
  }

  refetchQueries(...args) {
    return super.refetchQueries(...normalizeQueryFilterArgs(args));
  }

  removeQueries(...args) {
    return super.removeQueries(...normalizeQueryFilterArgs(args));
  }

  resetQueries(...args) {
    return super.resetQueries(...normalizeQueryFilterArgs(args));
  }

  cancelQueries(...args) {
    return super.cancelQueries(...normalizeQueryFilterArgs(args));
  }

  getQueryDefaults(queryKey) {
    return super.getQueryDefaults(normalizeQueryKey(queryKey));
  }

  setQueryDefaults(queryKey, options) {
    return super.setQueryDefaults(normalizeQueryKey(queryKey), options);
  }
}

export const QueryClientProvider = ({ contextSharing, ...props }) => (
  <TanstackQueryClientProvider {...props} />
);

export const useQuery = (arg1, arg2, arg3) => {
  const options = isPlainObject(arg1)
    ? normalizeQueryOptions(arg1)
    : normalizeQueryOptions({
      ...(arg3 || {}),
      queryKey: arg1,
      queryFn: arg2
    });

  return useTanstackQuery(options);
};

export const useInfiniteQuery = (arg1, arg2, arg3) => {
  const options = isPlainObject(arg1)
    ? normalizeQueryOptions(arg1)
    : normalizeQueryOptions({
      ...(arg3 || {}),
      queryKey: arg1,
      queryFn: arg2
    });

  return useTanstackInfiniteQuery(options);
};

export const useMutation = (arg1, arg2, arg3) => {
  const options = isPlainObject(arg1)
    ? arg1
    : (Array.isArray(arg1) || isPrimitive(arg1))
      ? {
        ...(arg3 || {}),
        mutationKey: normalizeQueryKey(arg1),
        mutationFn: arg2
      }
      : {
        ...(arg2 || {}),
        mutationFn: arg1
      };

  return useTanstackMutation(options);
};

export const useIsFetching = (arg1, arg2) => {
  const filters = arg1 === undefined
    ? undefined
    : isPlainObject(arg1)
      ? normalizeFilter(arg1)
      : normalizeFilter({
        ...(isPlainObject(arg2) ? arg2 : {}),
        queryKey: normalizeQueryKey(arg1)
      });

  return useTanstackIsFetching(filters);
};

export const useQueryClient = () => useTanstackQueryClient();
