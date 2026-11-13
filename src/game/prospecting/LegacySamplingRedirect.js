import { useEffect } from 'react';
import { Lot } from '@influenceth/sdk';
import useLot from '~/hooks/useLot';
import useStore from '~/hooks/useStore';
import { useProspecting } from './store';

// Activity links, pending transactions and the old action stack all enter here
// after activation, rather than keeping separate legacy completion dialogs.
export default function LegacySamplingRedirect({ params }) {
  const lotId = useStore(state => state.asteroids.lot);
  const { data: lot } = useLot(lotId);
  const sampleId = params?.sampleId || params?.preselect?.sampleId;
  const sample = lot?.deposits?.find(deposit => Number(deposit.id) === Number(sampleId));
  const resourceId = sample?.Deposit?.resource || params?.preselect?.resourceId;
  useEffect(() => {
    if (sampleId && !lot) return;
    const state = useStore.getState();
    if (lotId && resourceId) {
      state.dispatchResourceMapSelect(Number(resourceId));
      state.dispatchResourceMapToggle(true);
      const { asteroidId } = Lot.toPosition(lotId);
      useProspecting.getState().open(Number(asteroidId), Lot.toIndex(lotId), Number(resourceId));
      state.dispatchHudMenuOpened('LOT_PROSPECTING');
    } else {
      state.dispatchHudMenuOpened('RESOURCES');
    }
    state.dispatchActionDialog();
  }, [lot, lotId, sampleId, resourceId]);
  return null;
}
