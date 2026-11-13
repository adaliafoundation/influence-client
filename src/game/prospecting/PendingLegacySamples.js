import { Fragment } from 'react';
import { Product } from '@influenceth/sdk';
import Button from '~/components/ButtonAlt';
import LiveTimer from '~/components/LiveTimer';
import useCoreSampleManager from '~/hooks/actionManagers/useCoreSampleManager';
import { SectionTitle, Rule } from '../interface/hud/hudMenus/components/components';

// Legacy jobs retain their original randomness and finish transaction. They do
// not have a private campaign transcript or need the new proof/key setup.
export default function PendingLegacySamples({ lotId }) {
  const { currentSamplingActions, completedSamplingActions, finishSampling } = useCoreSampleManager(lotId);
  if (!currentSamplingActions.length && !completedSamplingActions.length) return null;
  return (
    <section aria-label="Earlier sampling">
      <SectionTitle><span>Earlier sampling</span></SectionTitle>
      <p>Complete samples already underway to use their results as claims.</p>
      {currentSamplingActions.map(({ action, status }) => {
        const ready = status === 'READY_TO_FINISH';
        const finishing = status === 'FINISHING';
        return (
          <Fragment key={action.sampleId || `${action.resourceId}:${action.owner}`}>
            <Rule />
            <SectionTitle><span>{Product.TYPES[action.resourceId]?.name} #{action.sampleId || 'pending'}</span></SectionTitle>
            <p>{action.isNew ? 'Core sample' : 'Improvement'} · {finishing ? 'Completing…'
              : ready ? 'Ready to complete'
                : <LiveTimer target={action.finishTime} prefix="Ready in " />}</p>
            <Button size="small" isTransaction disabled={!ready} loading={finishing}
              onClick={() => finishSampling(action.sampleId)}>
              {finishing ? 'Completing…' : 'Complete Claim'}
            </Button>
          </Fragment>
        );
      })}
      {completedSamplingActions.map(({ action }) => (
        <p key={action.sampleId} role="status">Sample #{action.sampleId} completed.</p>
      ))}
      <Rule />
    </section>
  );
}
