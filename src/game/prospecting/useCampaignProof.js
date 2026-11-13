import { useCallback, useEffect, useRef, useState } from 'react';
import { campaignRecord } from './campaignRecord';
import { campaignProofInput } from './proofInput';
import { proveCampaign } from './browserProver';
import { useProspecting } from './store';

export default function useCampaignProof() {
  const context = useProspecting((s) => s.context);
  const [state, setState] = useState({ phase: 'idle', result: null, error: '' });
  const running = useRef(null);
  const cancel = useCallback(() => {
    const controller = running.current;
    running.current = null;
    controller?.abort();
    setState({ phase: 'idle', result: null, error: '' });
  }, []);
  useEffect(() => {
    setState({ phase: 'idle', result: null, error: '' });
    return () => { const controller = running.current; running.current = null; controller?.abort(); };
  }, [context, cancel]);
  const prove = useCallback(async () => {
    const campaign = useProspecting.getState();
    if (running.current || campaign.busy || campaign.storageStatus !== 'ready' || !campaign.finalized) return;
    const controller = new AbortController();
    running.current = controller;
    setState({ phase: 'preparing', result: null, error: '' });
    try {
      const packet = campaignProofInput(campaignRecord(campaign), campaign.storage.identity);
      const result = await proveCampaign(packet, {
        signal: controller.signal,
        onProgress: (phase) => { if (running.current === controller && !controller.signal.aborted) setState({ phase, result: null, error: '' }); }
      });
      if (running.current === controller && !controller.signal.aborted) setState({ phase: 'verified', result, error: '' });
    } catch (error) {
      if (running.current !== controller) return;
      if (error.name === 'AbortError') setState({ phase: 'idle', result: null, error: '' });
      else setState({ phase: 'error', result: null, error: error.message });
    } finally { if (running.current === controller) running.current = null; }
  }, []);
  return { ...state, prove, cancel, busy: ['preparing', 'downloading', 'proving', 'verifying'].includes(state.phase) };
}
