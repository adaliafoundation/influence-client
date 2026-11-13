import { useEffect, useMemo, useState } from 'react';
import { Entity, Lot, Product, Prospecting } from '@influenceth/sdk';
import { appConfig } from '~/appConfig';
import { NewCoreSampleIcon, ImproveCoreSampleIcon } from '~/components/Icons';
import usePrivateDataKey from '~/hooks/usePrivateDataKey';
import useSession from '~/hooks/useSession';
import useStore from '~/hooks/useStore';
import useCoachmarkRefSetter from '~/hooks/useCoachmarkRefSetter';
import { COACHMARK_IDS } from '~/contexts/CoachmarkContext';
import { useProspecting, prospectingOnchain } from '../../../prospecting/store';
import { campaignIdentity } from '../../../prospecting/campaignIdentity';
import { createCampaignRepository } from '../../../prospecting/campaignRepository';
import { replayCampaign } from '../../../prospecting/campaignRecord';
import { prospectingActionState } from '../../../prospecting/actionState';
import ActionButton from './ActionButton';

export default function Prospect({ asteroidId, lotId, resourceId }) {
  const { accountAddress, chainId, provider } = useSession(false);
  const onchain = prospectingOnchain();
  const coachmarkRef = useCoachmarkRefSetter();
  const { privateKey, publicKey } = usePrivateDataKey();
  const open = useProspecting((s) => s.open);
  const dispatchHudMenuOpened = useStore((s) => s.dispatchHudMenuOpened);
  const dispatchResourceMapSelect = useStore((s) => s.dispatchResourceMapSelect);
  const dispatchResourceMapToggle = useStore((s) => s.dispatchResourceMapToggle);
  const identity = useMemo(() => campaignIdentity({
    chainId, dispatcher: appConfig.get('Starknet.Address.dispatcher'), owner: accountAddress,
    asteroidId: Number(asteroidId), originIndex: Lot.toIndex(lotId), resource: Number(resourceId)
  }), [accountAddress, chainId, asteroidId, lotId, resourceId]);
  const [saved, setSaved] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!identity || !privateKey || !publicKey) { setSaved(null); return; }
    setSaved({ identity, loading: true });
    const load = async () => {
      if (onchain) {
        const game = Prospecting.Game.createClient({ dispatcher: identity.game, provider });
        const id = await game.origin({ label: Entity.IDS.LOT, id: lotId });
        if (id === '0') return { record: null };
        const c = await game.campaign(id);
        if (c.resource !== Number(resourceId)) return { record: null };
        const pending = c.pending ? await game.core(id, c.count) : null;
        const block = pending ? await provider.getBlock('latest') : null;
        const waiting = pending && !Prospecting.isSampleReady({ readyAt: pending.ready, targetBlock: pending.target },
          { now: Number(block.timestamp), blockNumber: block.block_number });
        const savedRecord = await createCampaignRepository(identity, publicKey, privateKey, id).load();
        return { ...savedRecord, summary: { samples: c.sampleCount, pending: !!waiting,
          productive: savedRecord ? replayCampaign(savedRecord.record, identity).cells.some(cell => cell[3]) : false } };
      }
      return createCampaignRepository(identity, publicKey, privateKey).load();
    };
    load().then((savedRecord) => {
      if (cancelled) return;
      const campaign = savedRecord?.record ? replayCampaign(savedRecord.record, identity) : null;
      setSaved({ identity, loading: false, summary: savedRecord?.summary || (campaign && {
        samples: campaign.history.length, finalized: !!campaign.finalized,
        productive: campaign.cells.some((cell) => cell[0] && cell[3])
      }) });
    }).catch((error) => {
      if (!cancelled) setSaved({ identity, loading: false, error: error.message });
    });
    return () => { cancelled = true; };
  }, [identity, privateKey, publicKey, onchain, provider, lotId, resourceId]);

  const view = prospectingActionState({
    resourceName: Product.TYPES[resourceId]?.name || 'Resource',
    connected: !!accountAddress, unlocked: !!privateKey,
    loading: saved?.identity === identity && saved.loading,
    error: saved?.identity === identity && saved.error,
    summary: saved?.identity === identity ? saved.summary : null
  });
  return (
    <ActionButton
      ref={coachmarkRef(COACHMARK_IDS.actionButtonCoreSample)}
      label={view.label}
      labelAddendum={view.detail}
      flags={view.flags}
      icon={view.review ? <ImproveCoreSampleIcon /> : <NewCoreSampleIcon />}
      onClick={() => {
        dispatchResourceMapSelect(Number(resourceId));
        dispatchResourceMapToggle(true);
        open(Number(asteroidId), Lot.toIndex(lotId), Number(resourceId));
        dispatchHudMenuOpened('LOT_PROSPECTING');
      }}
    />
  );
}
