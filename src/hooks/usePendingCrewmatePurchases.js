import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Address } from '@influenceth/sdk';

import useSession from '~/hooks/useSession';
import useSimulationEnabled from '~/hooks/useSimulationEnabled';
import { stripePromise } from '~/game/launcher/store/components/StripeEmbeddedCheckout';
import api from '~/lib/api';
import { isCrewmatePurchaseCustomizable } from '~/lib/crewmatePurchases';

const usePendingCrewmatePurchases = () => {
  const { accountAddress, authenticated } = useSession();
  const simulationEnabled = useSimulationEnabled();
  const enabled = !!stripePromise && !!authenticated && !!accountAddress && !simulationEnabled;
  const query = useQuery({
    queryKey: ['pendingCrewmatePurchases', accountAddress],
    queryFn: api.getPendingCrewmatePurchases,
    enabled,
    staleTime: 10000,
    refetchInterval: 30000
  });

  const purchases = useMemo(() => enabled ? (query.data?.purchases || [])
    .filter((purchase) => (
      isCrewmatePurchaseCustomizable(purchase)
      && Address.areEqual(purchase.recipient, accountAddress)
    ))
    .sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt) || a.id.localeCompare(b.id))
    : [], [accountAddress, enabled, query.data?.purchases]);

  return { ...query, enabled, purchases };
};

export default usePendingCrewmatePurchases;
