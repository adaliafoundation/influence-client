import { Mining } from '@influenceth/sdk';

export function samplingDisabledReason({ hasOriginPermission, extractors, loading }) {
  if (loading) return 'Checking lot access and extractor activity…';
  if (!hasOriginPermission) return 'Permission to use the starting lot is required for another sample.';
  if (Mining.isSamplingBlocked(extractors)) return 'Sampling is blocked while an extractor is RUNNING on this lot, including jobs awaiting collection.';
  return null;
}
