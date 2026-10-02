import { marketQueryTypes, marketSubscriptionsByClient } from '../lib/marketSubscriptions';
import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isEqual, uniqBy } from 'lodash';
import { Address, Entity } from '@influenceth/sdk';

import useSession from '~/hooks/useSession';
import useBlockSync from '~/hooks/useBlockSync';
import useMissedBlockRecovery from '../hooks/useMissedBlockRecovery';
import { recoverGameplayQueries } from '../lib/queryRecovery';
import { searchAffectedByEntity } from '../lib/searchInvalidation';
import useCrewContext from '~/hooks/useCrewContext';
import useGetActivityConfig from '~/hooks/useGetActivityConfig';
import useStore from '~/hooks/useStore';
import useWebsocket from '~/hooks/useWebsocket';
import { hydrateActivities } from '~/lib/activities';
import { safeBigInt } from '~/lib/utils';
import api from '~/lib/api';
import useSimulationState from '~/hooks/useSimulationState';
import { appConfig } from '~/appConfig';
import { areWebsocketLogsEnabled } from '~/lib/debugFlags';
import { TOKEN } from '~/lib/priceUtils';

// TODO (enhancement): rather than invalidating, make optimistic updates to cache value directly
// (i.e. update asteroid name wherever asteroid referenced rather than invalidating large query results)

const ActivitiesContext = createContext();
const ignoreEventTypes = ['CURRENT_ETH_BLOCK_NUMBER'];

const isMismatch = (updateValue, queryCacheValue) => {
  // entity mismatch
  if (updateValue?.uuid) {
    return updateValue.uuid !== queryCacheValue.uuid;
  }
  if (updateValue?.id && updateValue?.label) {
    return !((updateValue.id == queryCacheValue.id) && (updateValue.label == queryCacheValue.label));
  }

  // array of possible updates (NOTE: `==` is deliberate for looseness)
  if (Array.isArray(updateValue)) {
    return !updateValue.find((v) => v == queryCacheValue);
  }

  // array of included values (i.e. multiple statuses in filter, this changed to one of them)
  if (Array.isArray(queryCacheValue)) {
    return !queryCacheValue.find((v) => v == updateValue);
  }

  // straightforward (NOTE: `!=` is deliberate for looseness)
  return updateValue != queryCacheValue;
}

export function ActivitiesProvider({ children }) {
  const {
    accountAddress,
    blockNumber,
    gasTokens,
    setBlockNumber,
    setBlockTime,
    isBlockMissing,
    setIsBlockMissing,
    token,
  } = useSession();
  const { crew, refreshReadyAt } = useCrewContext();
  const simulation = useSimulationState();
  useBlockSync(token && !simulation, blockNumber, setBlockNumber, setBlockTime);
  const getActivityConfig = useGetActivityConfig();
  const queryClient = useQueryClient();
  useMissedBlockRecovery(!!token && !simulation, isBlockMissing, setIsBlockMissing);
  const {
    registerConnectionHandler,
    registerMessageHandler,
    unregisterConnectionHandler,
    unregisterMessageHandler,
    wsReady
  } = useWebsocket();

  const createAlert = useStore(s => s.dispatchAlertLogged);
  const pendingTransactions = useStore(s => s.pendingTransactions);

  const [ activities, setActivities ] = useState([]);

  const pendingBatchActivities = useRef([]);
  const pendingTimeout = useRef();
  const receivedActivityIds = useRef(new Set());
  const activityGeneration = useRef(0);

  useEffect(() => {
    if (simulation) {
      setActivities(simulation?.activities || []);
    }
  }, [simulation?.activities])

  // useEffect(() => {
  //   const onKeydown = (e) => {
  //     if (e.shiftKey && e.which === 32) {
  //       const events = [
  //         {
  //           event: {
  //             "name": "DeliverySent",
  //             "version": 0,
  //             "event": "DeliverySent",
  //             "returnValues": {
  //               origin: { label: 5, id: 9299 },
  //               originSlot: 2,
  //               dest: { label: 6, id: 755 },
  //               destSlot: 2,
  //               // crewmate: { label: 2, id: 123456 },
  //               // asteroid: { label: 3, id: 26267 },
  //               // building: { label: 5, id: 83 },
  //               // finishTime: Math.floor(Date.now() / 1000) + 3600,
  //               // dock: { label: 5, id: 41 },
  //               // ship: { label: 6, id: 1 },
  //               callerCrew: { label: 1, id: 5257 },
  //               caller: '0x04b4e621185c5a62dd145edAAAA6f42BE775b5E34571bBDb0F05d91b1cA03A06'
  //             }
  //           },
  //         }
  //       ];

  //       console.log('fake event', events[0]?.event?.name);
  //       hydrateActivities(events, queryClient).then(() => {
  //         console.log('hydrated');
  //         handleActivities(events);
  //       })
  //     }
  //   };
  //   document.addEventListener('keydown', onKeydown);
  //   return () => {
  //     document.removeEventListener('keydown', onKeydown);
  //   }
  // }, []);

  const debugInvalidation = false;
  const handleActivities = useCallback((newActivities) => {
    // return;

    // prep activities, then handle
    const generation = activityGeneration.current;
    const transformedActivities = newActivities.flatMap((activity) => {
      // Websocket and API activity records can have different document IDs.
      const key = activity.event?.id || activity.id || activity._id;
      if (key && receivedActivityIds.current.has(key)) return [];
      if (key) receivedActivityIds.current.add(key);
      return [{ ...activity, id: activity.id || activity._id, key }];
    });

    // if nothing to do, can return
    if (transformedActivities.length === 0) return;

    // this timeout is to hopefully give enough time for all relevant assets to be updated
    // in mongo and/or elasticsearch before invaliding/re-requesting them
    const processActivities = async () => {
      if (generation !== activityGeneration.current) return;
      let shouldRefreshReadyAt = false;

      const allInvalidations = [];

      for (let activity of transformedActivities) {
        const activityConfig = getActivityConfig(activity);
        if (!activityConfig) continue;

        const pendingTransaction = (pendingTransactions || []).find((p) => p.txHash === activity.event?.transactionHash);
        const extraInvalidations = (await activityConfig.onBeforeReceived(pendingTransaction)) || [];
        if (generation !== activityGeneration.current) return;

        if (debugInvalidation) console.log('extraInvalidations', extraInvalidations);
        shouldRefreshReadyAt = shouldRefreshReadyAt || !!activityConfig.requiresCrewTime;

        // console.log('invalidations', activityConfig?.invalidations);

        const activityInvalidations = [];

        // any activityConfig that requiresCrewTime should invalidate the current crew's busyItems
        if (activityConfig.requiresCrewTime) {
          activityInvalidations.push([ 'activities', crew?.label, crew?.id, 'busy' ]);
        }
        if (activityConfig.visitedLot) {
          activityInvalidations.push([ 'activities', 'ongoing' ]);
        }

        // gas token invalidation
        // (if no caller or if caller matches my account)
        if (gasTokens?.length && accountAddress) {
          if (!activity.event?.returnValues?.caller || Address.areEqual(accountAddress, activity.event.returnValues.caller)) {
            gasTokens.forEach((t) => {
              const tokenName = Object.keys(TOKEN).find((k) => Address.areEqual(TOKEN[k], t))?.toLowerCase();
              console.log('INVALIDATE GAS TOKEN', tokenName);
              extraInvalidations.push(['walletBalance', tokenName, accountAddress]);
            });
          }
        }

        // walk through all invalidation configs to build out specific queries to invalidate
        [
          ...(activityConfig?.invalidations || []),
          ...(extraInvalidations || [])
        ].forEach((invalidationConfig) => {

          // this is a raw queryKey
          // (i.e. `[ 'ethBalance', walletAddress ]`)
          if (Array.isArray(invalidationConfig)) {
            // Mounted market queries are refreshed by their asteroid subscription.
            // Mark inactive entries stale for their next mount without a duplicate fetch.
            if (marketQueryTypes.has(invalidationConfig[0])) {
              queryClient.invalidateQueries({ queryKey: invalidationConfig, refetchType: 'none' });
            } else activityInvalidations.push(invalidationConfig)

          // else, this is an entity object
          // NOTE: read more about newGroupEval and invalidation configs in lib/cacheKey.js
          } else if (invalidationConfig) {
            // NOTE: if key is not present in updated values, value was not updated
            const { id, label, newGroupEval } = invalidationConfig;
            if (debugInvalidation && newGroupEval?.updatedValues) console.log(`${label}.${id} updates include`, newGroupEval);

            // invalidate `entity` entry
            activityInvalidations.push(['entity', label, Number(id)]);
            if ([Entity.IDS.LOT, Entity.IDS.ASTEROID, Entity.IDS.CREW, Entity.IDS.BUILDING, Entity.IDS.SHIP].includes(label)) {
              queryClient.getQueryCache().findAll({ predicate: query => query.meta?.affectsEntity?.(invalidationConfig) })
                .forEach(query => activityInvalidations.push(query.queryKey));
            }
            activityInvalidations.push(['activities', label, Number(id)]);

            // walk through `entities` entries of label type
            // refetch group keys no longer part of, and refetch group keys it just became part of
            // TODO: just fetch active?
            queryClient.getQueriesData({ queryKey: ['entities', label] }).forEach(([ queryKey, data ]) => {
              if (data === undefined) {
                if (debugInvalidation) console.log('bad query cache value', queryKey, data);
                return;
              }

              // if updated entity is already in entity group, invalidate (to update/delete)
              // TODO (enhancement): update-in-place
              if (!!(data || []).find((d) => ((d.id === Number(id)) && (d.label === label)))) {
                if (debugInvalidation) console.log(`${label}.${id} is already in collection`, queryKey);
                activityInvalidations.push(queryKey);

              // else, check if it is technically possible (to the best of our knowledge)
              // that the updated entity now *could be* part of a new entity group based
              // on what changed about it... we will rely on newGroupEval to guide us
              } else if (newGroupEval?.updatedValues) {
                const { updatedValues, filters } = newGroupEval;
                const collectionFilter = typeof queryKey[2] === 'object' ? queryKey[2] : {};
                let skip = false;

                // if none of the updatedValue keys appear in the group filter, it's impossible that
                // the updatedValue would cause this entity to now belong to this group... skip
                // (this assumes we have written our useQuery keys to be comprehensive!)
                // i.e. if ship controller changed, may not need to invalidate a group specifying all ships on a lot
                if (!Object.keys(updatedValues).find((k) => collectionFilter.hasOwnProperty(k))) {
                  if (debugInvalidation) console.log('not in filter', updatedValues, collectionFilter);
                  skip = true;
                }

                // if at least one of the updatedValues would exclude the updated entity from the
                // group, then impossible it would be added to this group... skip
                else if (Object.keys(updatedValues).find((k) => collectionFilter.hasOwnProperty(k) && isMismatch(updatedValues[k], collectionFilter[k]))) {
                  if (debugInvalidation) console.log('change excluded');
                  skip = true;
                }

                // if at least one of the filters exclude this queryKey from including updated entity... skip
                // i.e. if ship status changed, may only need to invalidate groups scoped to one asteroid
                else if (filters && Object.keys(filters).find((k) => collectionFilter.hasOwnProperty(k) && filters[k] !== undefined && isMismatch(filters[k], collectionFilter[k]))) {
                  if (debugInvalidation) console.log('filter excluded');
                  skip = true;
                }

                // if didn't skip... invalidate as a precaution
                if (!skip) {
                  if (debugInvalidation) console.log(`${label}.${id} might be joining collection`, JSON.stringify(queryKey));
                  activityInvalidations.push(queryKey);
                }
                // else if (debugInvalidation) console.log(`${label}.${id} will NOT be joining collection`, JSON.stringify(queryKey));
              }
            });

            queryClient.getQueryCache().findAll({
              predicate: query => searchAffectedByEntity(query, invalidationConfig)
            }).forEach(query => activityInvalidations.push(query.queryKey));
          }

          if (debugInvalidation) console.log('activity invalidate', invalidationConfig, activityInvalidations);
          allInvalidations.push(...activityInvalidations);
        });

        if (activityConfig?.triggerAlert) {
          createAlert({
            type: 'ActivityLog',
            data: {
              ...activityConfig?.logContent,
              stackId: activity.event?.name,
            },
            duration: 10000,
          })
        };
      }

      const finalInvalidations = [];
      allInvalidations
        .sort((a, b) => a.length < b.length ? -1 : 1)
        .forEach((specific) => {
          // skip if finalInvalidations already contains a broader item where all the
          // keys of the broad item match the initial keys of this specific item (i.e.
          // if can find an item in broad where none of the elements do not match specific)
          const isRedundant = finalInvalidations.find((broad) => {
            return !broad.find((broadEl, i) => !isEqual(broadEl, specific[i]));
          });
          if (!isRedundant) finalInvalidations.push(specific);
        });
      if (debugInvalidation) console.log('deduped final invalidate', finalInvalidations);

      // The indexed activity confirms completion. Start refreshing its views,
      // but do not let slow or failed requests hold the transaction pending.
      Promise.all([
        ...finalInvalidations.map((queryKey) => {
          if (appConfig.get('App.verboseLogs')) console.log('invalidate', queryKey);
          return queryClient.invalidateQueries({ queryKey, refetchType: 'active' });
        }),
        marketSubscriptionsByClient.get(queryClient)?.flush(),
        ...(shouldRefreshReadyAt ? [refreshReadyAt()] : []),
      ]).catch((error) => {
        if (generation !== activityGeneration.current) return;
        console.warn('Unable to refresh activity data', error);
      });

      if (generation !== activityGeneration.current) return;
      setActivities((prevActivities) => uniqBy([
        ...transformedActivities,
        ...prevActivities
      ], 'key'));
    };
    setTimeout(() => {
      processActivities().catch((error) => {
        if (generation !== activityGeneration.current) return;
        // Failed activity preparation must remain eligible for recovery on the next poll.
        transformedActivities.forEach(({ key }) => receivedActivityIds.current.delete(key));
        console.warn('Unable to process transaction activities', error);
      });
    }, 2500);
  }, [accountAddress, crew, getActivityConfig, gasTokens, pendingTransactions, refreshReadyAt, queryClient, createAlert, debugInvalidation]);

  // try to process WS activities grouped by block
  const processPendingWSBatch = useCallback(async () => {
    if (pendingTimeout.current) {
      clearTimeout(pendingTimeout.current);
      pendingTimeout.current = null;
    }

    const generation = activityGeneration.current;
    const activitiesToProcess = (pendingBatchActivities.current || []).slice(0);
    pendingBatchActivities.current = [];

    if (activitiesToProcess.length > 0) {
      await hydrateActivities(activitiesToProcess, queryClient);
      if (generation === activityGeneration.current) handleActivities(activitiesToProcess);
    }
  }, [handleActivities, queryClient]);

  const disconnectedAt = useRef(null);
  const onWSConnection = useCallback((isOpen) => {
    if (!isOpen) {
      if (disconnectedAt.current === null) disconnectedAt.current = Date.now();
      return;
    }
    if (disconnectedAt.current !== null && Date.now() - disconnectedAt.current >= 5000) {
      recoverGameplayQueries(queryClient);
    }
    disconnectedAt.current = null;
  }, [queryClient]);

  useEffect(() => { disconnectedAt.current = null; }, [token]);

  const onWSMessage = useCallback((message) => {
    if (areWebsocketLogsEnabled()) console.log('onWSMessage (activities)', message);
    const { type, body } = message;
    if (ignoreEventTypes.includes(type)) return;
    if (type === 'CURRENT_STARKNET_BLOCK_NUMBER') {
      // our pre-update block number should be at least as high as the newly reported
      // previously-processed-block from the server (otherwise, we missed one)
      if (blockNumber > 0 && body.previous > 0 && body.previous > blockNumber) {
        console.log(`Missed a block! (new: ${body.blockNumber}, server prev: ${body.previous}, local prev: ${blockNumber})`);

        setIsBlockMissing(true);
      }

      // update the local finalized block state
      if (body.blockNumber > 0) setBlockNumber(body.blockNumber);
      if (body.blockTimestamp > 0) setBlockTime(body.blockTimestamp);
    } else {

      // queue the current activity for processing
      pendingBatchActivities.current.push(body);

      // schedule processing for now + 1s (in case more activities are coming from this block)
      // NOTE: if we ever limit the number of activities emitted per action, we can remove this batching
      if (pendingTimeout.current) clearTimeout(pendingTimeout.current);
      pendingTimeout.current = setTimeout(processPendingWSBatch, 1000);
    }
  }, [blockNumber, processPendingWSBatch, setBlockTime, setBlockNumber, setIsBlockMissing]);

  // Listener callbacks must see current state without tearing down subscriptions
  // whenever an activity refresh changes the crew or pending transactions.
  const latest = useRef();
  latest.current = { onWSConnection, onWSMessage, handleActivities, pendingTransactions, activities, blockNumber };

  useEffect(() => {
    if (!wsReady || !token) return undefined;
    const receivedIds = receivedActivityIds.current;
    const crewRoom = crew?.id ? `Crew::${crew.id}` : null;

    // setup ws listeners
    const connListenerRegId = registerConnectionHandler((...args) => latest.current.onWSConnection(...args));
    const onMessage = (...args) => latest.current.onWSMessage(...args);
    const messageListenerRegIds = [];
    messageListenerRegIds.push(registerMessageHandler(onMessage));
    if (crewRoom) {
      messageListenerRegIds.push(registerMessageHandler(onMessage, crewRoom));
    }

    // reset on logout / disconnect
    return () => {
      activityGeneration.current += 1;
      receivedIds.clear();
      clearTimeout(pendingTimeout.current);
      pendingBatchActivities.current = [];
      setActivities([]);
      unregisterConnectionHandler(connListenerRegId);
      messageListenerRegIds.forEach((regId) => unregisterMessageHandler(regId));
    }
  }, [crew?.id, token, wsReady, queryClient, registerConnectionHandler, registerMessageHandler,
    unregisterConnectionHandler, unregisterMessageHandler, setBlockNumber, setBlockTime]);

  const hasPendingTransactions = pendingTransactions.some((tx) => tx.txHash);
  useEffect(() => {
    if (!token || simulation || !hasPendingTransactions) return undefined;
    let cancelled = false;
    let timeout;
    const recover = async () => {
      const confirmedHashes = new Set(latest.current.activities
        .filter((activity) => activity.event?.transactionHash)
        .map((activity) => safeBigInt(activity.event.transactionHash)));
      const hashes = [...new Set(latest.current.pendingTransactions
        .filter((tx) => tx.txHash && !confirmedHashes.has(safeBigInt(tx.txHash))
          && (!tx.timestamp || Date.now() - tx.timestamp >= 30000))
        .map((tx) => tx.txHash))];
      try {
        if (hashes.length > 0) {
          const data = await api.getTransactionActivities(hashes);
          if (cancelled) return;
          await hydrateActivities(data.activities, queryClient);
          if (cancelled) return;
          latest.current.handleActivities(data.activities);
          if (data.blockNumber > (latest.current.blockNumber || 0)) {
            setBlockNumber(data.blockNumber);
            if (data.blockTimestamp > 0) setBlockTime(data.blockTimestamp);
          }
        }
      } catch (error) {
        console.warn('Unable to recover pending transaction activities', error);
      } finally {
        if (!cancelled) timeout = setTimeout(recover, 30000);
      }
    };
    recover();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [crew?.id, token, simulation, hasPendingTransactions, queryClient, setBlockNumber, setBlockTime]);

  return (
    <ActivitiesContext.Provider value={activities}>
      {children}
    </ActivitiesContext.Provider>
  );
};

export default ActivitiesContext;
