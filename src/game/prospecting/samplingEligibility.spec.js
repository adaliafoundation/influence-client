/** @jest-environment node */
import { Extractor } from '@influenceth/sdk';
import { samplingDisabledReason } from './samplingEligibility';

it('blocks every RUNNING slot, even after its finish time, until collection', () => {
  const input = { hasOriginPermission: true, loading: false, extractors: [
    { slot: 1, status: Extractor.STATUSES.IDLE },
    { slot: 2, status: Extractor.STATUSES.RUNNING, finishTime: 1 }
  ] };
  expect(samplingDisabledReason(input)).toContain('RUNNING');
  expect(samplingDisabledReason({ ...input, extractors: [] })).toBeNull();
});

it('requires access only to the origin and waits for loaded target data', () => {
  expect(samplingDisabledReason({ loading: true })).toContain('Checking');
  expect(samplingDisabledReason({ hasOriginPermission: false, loading: false, extractors: [] })).toContain('starting lot');
  expect(samplingDisabledReason({ hasOriginPermission: true, loading: false, extractors: [] })).toBeNull();
});
