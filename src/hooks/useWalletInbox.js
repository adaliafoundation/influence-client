import { useQuery } from '@tanstack/react-query';
import { Address } from '@influenceth/sdk';

import useSession from '~/hooks/useSession';
import useUser from '~/hooks/useUser';
import api from '~/lib/api';
import { useMemo } from 'react';

const useWalletInbox = () => {
  const { accountAddress } = useSession();
  const { data: user, isLoading: userIsLoading, dataUpdatedAt: userDataUpdatedAt } = useUser();

  const { data: messages, isLoading, dataUpdatedAt } = useQuery({
    queryKey: [ 'inbox', accountAddress ],
    queryFn: () => api.getInboxMessages(),
    enabled: !!accountAddress && !!user?.publicKey
  });

  const { threads, unreadTally } = useMemo(() => {
    const threads = {};
    let unreadTally = 0;
    (messages || []).forEach((message) => {
      const iAmSender = Address.areEqual(accountAddress, message.sender);
      const correspondent = iAmSender
        ? message.recipient
        : message.sender;

      if (!threads[correspondent]) {
        threads[correspondent] = {
          correspondent,
          unreadTally: 0,
          updatedAt: null,
          messages: []
        };
      }

      threads[correspondent].messages.push(message);

      threads[correspondent].updatedAt = threads[correspondent].updatedAt > message.updatedAt ? threads[correspondent].updatedAt : message.createdAt;

      if (!iAmSender && !message.read) {
        threads[correspondent].unreadTally++;
        unreadTally++;
      }
    });

    return {
      threads: Object.values(threads).sort((a, b) => b.updatedAt < a.updatedAt ? -1 : 1),
      unreadTally
    };
  }, [dataUpdatedAt, messages]);

  return useMemo(() => ({
    dataUpdatedAt: Math.max(dataUpdatedAt, userDataUpdatedAt),
    isLoading: isLoading || userIsLoading,
    hasNoPublicKey: !userIsLoading && !user?.publicKey,
    threads,
    unreadTally
  }), [dataUpdatedAt, isLoading, userIsLoading, userDataUpdatedAt, user?.publicKey, threads, unreadTally]);
};

export default useWalletInbox;
