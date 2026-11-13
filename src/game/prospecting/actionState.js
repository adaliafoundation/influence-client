export function prospectingActionState({ resourceName, connected, unlocked, loading, error, summary }) {
  const flags = { disabled: false, loading: false, attention: false };
  if (!connected) return { label: 'Prospect', detail: 'Sign in to save a private campaign', flags: { ...flags, disabled: true } };
  if (loading) return { label: 'Loading Prospecting', detail: resourceName, flags: { ...flags, disabled: true, loading: true } };
  if (error) return { label: 'Recover Prospecting', detail: `${resourceName} · Open the campaign to retry recovery`, flags };
  if (!unlocked) return { label: `Prospect for ${resourceName}`, detail: 'Unlock private data to start or resume', flags };
  if (!summary) return { label: `Prospect for ${resourceName}`, detail: 'Start a prospecting campaign', flags };
  if (summary.pending) return { label: `Sampling ${resourceName}`, detail: 'Waiting for drilling work and future-block randomness',
    flags: { ...flags, loading: true } };
  if (summary.finalized) return { label: `View ${resourceName} Claim`, detail: 'Local claim selected', flags };
  if (summary.samples >= 10) return summary.productive
    ? { label: `Review ${resourceName} Claim`, detail: '10 / 10 samples · Choose a claim', flags: { ...flags, attention: true }, review: true }
    : { label: `Review ${resourceName} Campaign`, detail: '10 / 10 samples · No ore found', flags };
  return { label: `Continue ${resourceName} Prospecting`, detail: `${summary.samples} / 10 samples · Resume saved campaign`, flags };
}
