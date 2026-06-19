import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { appConfig } from '~/appConfig';
import useCrewContext from '~/hooks/useCrewContext';
import activities, { getHydrationQueryKey } from '~/lib/activities';

const getActivityConfig = (queryClient, defaultViewingAs) => (activity, overrideViewingAs) => {
  const name = activity?.event?.name || activity?.event?.event;
  const config = activities[name];
  if (!config) {
    console.warn(`No activity config found for "${name}"!`, activity);
    return null;
  }

  const prepopEntities = config.getPrepopEntities ? config.getPrepopEntities(activity) : {};
  const prepopped = Object.keys(prepopEntities).reduce((acc, prepopKey) => {
    if (!prepopEntities[prepopKey]) return acc;
    return {
      ...acc,
      [prepopKey]: queryClient.getQueryData(getHydrationQueryKey(prepopEntities[prepopKey]))
    };
  }, {});

  const viewingAs = overrideViewingAs || defaultViewingAs || {};

  // TODO: it would be more elegant to create a virtual action item from the busyItem here (as relevant)
  //  than to do the _preformatted thing, but we can circle back to that
  const busyItem = config?.getBusyItem ? config.getBusyItem(activity, prepopped) : null;

  const actionItem = config?.getActionItem ? config.getActionItem(activity.event, viewingAs, prepopped) : null;

  const getActionItemFinishCall = config?.getActionItemFinishCall ? config.getActionItemFinishCall(activity, prepopped) : null;

  const invalidations = config?.getInvalidations ? config.getInvalidations(activity, prepopped) : [];

  const onBeforeReceived = config?.onBeforeReceived ? config.onBeforeReceived(activity) : (async () => {});

  const logContent = config?.getLogContent ? config.getLogContent(activity, viewingAs, prepopped) : null;
  if (logContent && activity.event.transactionHash) logContent.txLink = `${appConfig.get('Url.starknetExplorer')}/tx/${activity.event.transactionHash}`;
  // TODO: support L1? __t is in event record, but is not included in activity record...
  //  `${appConfig.get('Url.ethereumExplorer')}/tx/${activity.event?.transactionHash}`
  
  const visitedLot = config?.getVisitedLot ? config.getVisitedLot(activity.event, prepopped) : null;

  const requiresCrewTime = !!config?.requiresCrewTime;

  const triggerAlert = !!config?.triggerAlert;

  const isActionItemHidden = (pendingTransactions, prepopped) => {
    return config?.getIsActionItemHidden
      ? config.getIsActionItemHidden(activity.event, prepopped)(pendingTransactions)
      : () => false;
  };

  return {
    actionItem,
    getActionItemFinishCall,
    invalidations,
    logContent,
    isActionItemHidden,
    onBeforeReceived,
    busyItem,
    requiresCrewTime,
    triggerAlert,
    visitedLot
  };
}

const useGetActivityConfig = () => {
  const queryClient = useQueryClient();
  const { crew } = useCrewContext();
  return useMemo(() => getActivityConfig(queryClient, { id: crew?.id, label: crew?.label, uuid: crew?.uuid }), [crew?.id, queryClient]);
}

export default useGetActivityConfig;
