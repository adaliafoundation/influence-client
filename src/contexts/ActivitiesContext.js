import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from 'react-query';
import { isEqual, uniq } from 'lodash';
import { Address, Entity } from '@influenceth/sdk';

import useSession from '~/hooks/useSession';
import useCrewContext from '~/hooks/useCrewContext';
import useGetActivityConfig from '~/hooks/useGetActivityConfig';
import useStore from '~/hooks/useStore';
import useWebsocket from '~/hooks/useWebsocket';
import { hydrateActivities } from '~/lib/activities';
import api from '~/lib/api';
import useSimulationState from '~/hooks/useSimulationState';
import { appConfig } from '~/appConfig';
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
    blockNumberIsProvisional,
    gasTokens,
    setBlockNumber,
    setIsBlockMissing,
    token,
  } = useSession();
  const { crew, pendingTransactions, refreshReadyAt } = useCrewContext();
  const simulation = useSimulationState();
  const getActivityConfig = useGetActivityConfig();
  const queryClient = useQueryClient();
  const {
    registerConnectionHandler,
    registerMessageHandler,
    unregisterConnectionHandler,
    unregisterMessageHandler,
    wsReady
  } = useWebsocket();

  const createAlert = useStore(s => s.dispatchAlertLogged);

  const [ activities, setActivities ] = useState([]);

  const pendingBatchActivities = useRef([]);
  const pendingTimeout = useRef();

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
  const handleActivities = useCallback((newActivities, skipInvalidations) => {
    // return;

    // prep activities, then handle
    const transformedActivities = newActivities.map((e) => {
      e.id = e.id || e._id;
      e.key = e.id;
      return e;
    });

    // if nothing to do, can return
    if (transformedActivities.length === 0) return;

    // this timeout is to hopefully give enough time for all relevant assets to be updated
    // in mongo and/or elasticsearch before invaliding/re-requesting them
    setTimeout(async () => {
      let shouldRefreshReadyAt = false;

      if (!skipInvalidations) {
        const allInvalidations = [];

        for (let activity of transformedActivities) {
          const activityConfig = getActivityConfig(activity);
          if (!activityConfig) continue;

          const pendingTransaction = (pendingTransactions || []).find((p) => p.txHash === activity.event?.transactionHash);
          const extraInvalidations = (await activityConfig.onBeforeReceived(pendingTransaction)) || [];

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
              activityInvalidations.push(invalidationConfig)

            // else, this is an entity object
            // NOTE: read more about newGroupEval and invalidation configs in lib/cacheKey.js
            } else if (invalidationConfig) {
              // NOTE: if key is not present in updated values, value was not updated
              const { id, label, newGroupEval } = invalidationConfig;
              if (debugInvalidation && newGroupEval?.updatedValues) console.log(`${label}.${id} updates include`, newGroupEval);

              // invalidate `entity` entry
              activityInvalidations.push(['entity', label, Number(id)]);
              activityInvalidations.push(['activities', label, Number(id)]);

              // walk through `entities` entries of label type
              // refetch group keys no longer part of, and refetch group keys it just became part of
              // TODO: just fetch active?
              queryClient.getQueriesData(['entities', label]).forEach(([ queryKey, data ]) => {
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

              // invalidate searches potentially a part of
              // TODO: would be nice to check against criteria similar to 'entities' above
              let searchAssets = [];
              if (label === Entity.IDS.ASTEROID)
                searchAssets = ['asteroids'/*, 'asteroidsMapped'*/]; // asteroidsMapped uses asteroids
              if (label === Entity.IDS.BUILDING)
                searchAssets = ['buildings'];
              if (label === Entity.IDS.CREW)
                searchAssets = ['crews'];
              if (label === Entity.IDS.CREWMATE)
                searchAssets = ['crewmates'];
              if (label === Entity.IDS.DEPOSIT)
                searchAssets = ['coresamples'];
              if (label === Entity.IDS.LOT)
                searchAssets = ['lots'/*, 'lotsMapped'*/]; // lotsMapped uses packed data
              if (label === Entity.IDS.SHIP)
                searchAssets = ['ships'];

              searchAssets.forEach((assetType) => {
                activityInvalidations.push(['search', assetType])
              });
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

        finalInvalidations.forEach((queryKey) => {
          if (appConfig.get('App.verboseLogs')) console.log('invalidate', queryKey);
          queryClient.invalidateQueries({ queryKey, refetchType: 'active' });
        });
      }

      setActivities((prevActivities) => uniq([
        ...transformedActivities,
        ...prevActivities
      ], 'key'));

      if (shouldRefreshReadyAt) {
        refreshReadyAt();
      }

    }, 2500);
  }, [accountAddress, crew, getActivityConfig, gasTokens, pendingTransactions, refreshReadyAt]);

  // try to process WS activities grouped by block
  const processPendingWSBatch = useCallback(async () => {
    if (pendingTimeout.current) {
      clearTimeout(pendingTimeout.current);
      pendingTimeout.current = null;
    }

    const activitiesToProcess = (pendingBatchActivities.current || []).slice(0);
    pendingBatchActivities.current = [];

    if (activitiesToProcess.length > 0) {
      await hydrateActivities(activitiesToProcess, queryClient);
      handleActivities(activitiesToProcess);
    }
  }, [handleActivities]);

  const [disconnected, setDisconnected] = useState();
  const [stale, setStale] = useState();
  const onWSConnection = useCallback((isOpen) => {
    if (isOpen && stale) {
      queryClient.resetQueries();
      setStale(false);
    }
    setDisconnected(!isOpen);
  }, [stale]);

  useEffect(() => {
    // if disconnected for more than X seconds, set state to `stale`. this will refetch
    // everything once the connection is restored. any value of X is technically imperfect
    // here, but it also seems excessive to reset state on any microsecond disconnection
    if (disconnected) {
      const to = setTimeout(() => setStale(true), 5e3);
      // (if reconnects before timeout, do not set to stale)
      return () => clearTimeout(to);
    }
  }, [disconnected]);

  const onWSMessage = useCallback((message) => {
    if (appConfig.get('App.verboseLogs')) console.log('onWSMessage (activities)', message);
    const { type, body } = message;
    if (ignoreEventTypes.includes(type)) return;
    if (type === 'CURRENT_STARKNET_BLOCK_NUMBER') {
      // our pre-update block number should be at least as high as the newly reported
      // previously-processed-block from the server (otherwise, we missed one)
      if (blockNumberIsProvisional) {
        console.log(`Setting first non-provisional block number to ${body.blockNumber} (provisional was ${blockNumber})`);
      }
      else if (blockNumber > 0 && body.previous > 0 && body.previous > blockNumber) {
        console.log(`Missed a block! (new: ${body.blockNumber}, server prev: ${body.previous}, local prev: ${blockNumber})`);

        setIsBlockMissing(true);
      }

      // update the local block
      if (body.blockNumber > 0) setBlockNumber(body.blockNumber);
    } else {

      // queue the current activity for processing
      pendingBatchActivities.current.push(body);

      // schedule processing for now + 1s (in case more activities are coming from this block)
      // NOTE: if we ever limit the number of activities emitted per action, we can remove this batching
      if (pendingTimeout.current) clearTimeout(pendingTimeout.current);
      pendingTimeout.current = setTimeout(processPendingWSBatch, 1000);
    }
  }, [blockNumber, blockNumberIsProvisional, processPendingWSBatch]);

  const isFirstLoad = useRef(true); // (i.e. this is not a crew switch)
  useEffect(() => {
    if (!wsReady) return;
    if (!token) return;

    // if authed, populate existing activities and start listening to user websocket
    // if have pending transactions, load back to the oldest one in case it missed the activity;
    // else, will just pull most recent X (limit set on server)

    const pendingTxHashes = pendingTransactions
      .map((tx) => tx.txHash)
      .filter((txHash) => !!txHash);
    if (pendingTxHashes?.length > 0) {
      // NOTE: since is to make sure no pagination occurs... we should fix this endpoint on the server
      api.getTransactionActivities(pendingTxHashes).then(async (data) => {
        await hydrateActivities(data.activities, queryClient);
        handleActivities(data.activities, isFirstLoad.current);
        if (data.blockNumber > 0) setBlockNumber(data.blockNumber); // TODO: is this still necessary?
      });
    } else {
      handleActivities([], isFirstLoad.current);
    }

    // after loaded once, if switch crews, this block will run again... but in the event of catching up
    // on missing pending activities here, we DO need to invalidate the cache values
    isFirstLoad.current = false;

    const crewRoom = crew?.id ? `Crew::${crew.id}` : null;

    // setup ws listeners
    const connListenerRegId = registerConnectionHandler(onWSConnection);
    const messageListenerRegIds = [];
    messageListenerRegIds.push(registerMessageHandler(onWSMessage));
    if (crewRoom) {
      messageListenerRegIds.push(registerMessageHandler(onWSMessage, crewRoom));
    }

    // reset on logout / disconnect
    return () => {
      setActivities([]);
      unregisterConnectionHandler(connListenerRegId);
      messageListenerRegIds.forEach((regId) => unregisterMessageHandler(regId));
    }
  }, [crew?.id, onWSConnection, onWSMessage, token, wsReady]);

  return (
    <ActivitiesContext.Provider value={activities}>
      {children}
    </ActivitiesContext.Provider>
  );
};

export default ActivitiesContext;
