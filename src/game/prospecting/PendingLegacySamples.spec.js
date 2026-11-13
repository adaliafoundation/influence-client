import { fireEvent, render, screen } from '@testing-library/react';
import PendingLegacySamples from './PendingLegacySamples';
import useCoreSampleManager from '~/hooks/actionManagers/useCoreSampleManager';

jest.mock('~/hooks/actionManagers/useCoreSampleManager', () => jest.fn(), { virtual: true });
jest.mock('~/components/ButtonAlt', () => ({ children, isTransaction, loading, ...props }) =>
  <button {...props} aria-busy={loading}>{children}</button>, { virtual: true });
jest.mock('~/components/LiveTimer', () => ({ target }) => <span>Timer {target}</span>, { virtual: true });
jest.mock('../interface/hud/hudMenus/components/components', () => ({
  SectionTitle: ({ children }) => <div>{children}</div>, Rule: () => <hr />
}));

const finish = jest.fn();
const job = (status, isNew = true) => ({ status, action: {
  sampleId: 42, resourceId: 1, owner: 9, isNew, finishTime: 200
} });
beforeEach(() => {
  finish.mockClear();
  useCoreSampleManager.mockReturnValue({ currentSamplingActions: [], completedSamplingActions: [], finishSampling: finish });
});
it.each([true, false])('completes an earlier sample/improvement through the same pane: %s', isNew => {
  useCoreSampleManager.mockReturnValue({ currentSamplingActions: [job('READY_TO_FINISH', isNew)],
    completedSamplingActions: [], finishSampling: finish });
  render(<PendingLegacySamples lotId={7} />);
  expect(screen.getByText(isNew ? /Core sample/ : /Improvement/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Complete Claim' }));
  expect(finish).toHaveBeenCalledWith(42);
});
it.each(['SAMPLING', 'FINISHING'])('does not resubmit a %s job', status => {
  useCoreSampleManager.mockReturnValue({ currentSamplingActions: [job(status)], completedSamplingActions: [], finishSampling: finish });
  render(<PendingLegacySamples lotId={7} />);
  const button = screen.getByRole('button');
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(finish).not.toHaveBeenCalled();
  if (status === 'SAMPLING') expect(screen.getByText('Timer 200')).toBeInTheDocument();
});
it('leaves no transition section when there are no old jobs', () => {
  render(<PendingLegacySamples lotId={7} />);
  expect(screen.queryByRole('region', { name: 'Earlier sampling' })).not.toBeInTheDocument();
});
it('shows completion without claiming a positive yield for an empty result', () => {
  useCoreSampleManager.mockReturnValue({ currentSamplingActions: [], completedSamplingActions: [job('READY')], finishSampling: finish });
  render(<PendingLegacySamples lotId={7} />);
  expect(screen.getByRole('status')).toHaveTextContent('Sample #42 completed.');
});
