import { ThemeProvider } from 'styled-components';
import Button from './ButtonAlt';
import { useContext, useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ActionSubmissionProvider from './ActionSubmissionProvider';
import { useActionSubmission } from '../contexts/ActionSubmissionContext';
import { notifyTransactionSettlement } from '../lib/transactionSettlement';
import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import { reportFailure } from '../lib/errorReporting';

jest.mock('~/contexts/ChainTransactionContext', () => ({ __esModule: true, default: require('react').createContext(null) }), { virtual: true });
jest.mock('~/hooks/useStore', () => {
  const store = selector => selector({ dispatchEffectStartRequested: jest.fn() });
  store.getState = () => ({ dispatchAlertLogged: jest.fn() });
  return { __esModule: true, default: store };
}, { virtual: true });
jest.mock('~/components/Badge', () => () => null, { virtual: true });
jest.mock('~/components/PurchaseButtonInner', () => () => null, { virtual: true });
jest.mock('~/theme', () => ({ colors: { main: '#00ffff', txButton: '#ff00ff' }, hexToRGB: () => '255, 255, 255' }), { virtual: true });
jest.mock('react-tooltip', () => ({ Tooltip: () => null }));
jest.mock('react-spinners/BarLoader', () => ({ color }) => <span role="progressbar" data-color={color} />);
jest.mock('../lib/errorReporting', () => ({ reportFailure: jest.fn() }));

let execute, onClose, onSuccess, onSetAction;
function Controls({ before = async () => {}, fireAndForget = false, loading = false, buttonKey = 0 }) {
  const submission = useActionSubmission();
  const chain = useContext(ChainTransactionContext);
  const [text, setText] = useState('my entered value');
  return <>
    <input aria-label="value" value={text} onChange={e => setText(e.target.value)} />
    <span>{submission.busy ? 'busy' : 'ready'}</span>
    <Button key={buttonKey} submissionId="dialog-go" isTransaction loading={loading} onClick={async () => {
      await before();
      if (fireAndForget) { chain.execute('Test'); return; }
      return chain.execute('Test');
    }}>Submit</Button>
    <Button onClick={submission.dismiss}>X</Button>
    <button onClick={submission.requestClose}>Automatic close</button>
    <button onClick={() => submission.navigate('NEXT')}>Advance</button>
  </>;
}
function View(props) {
  return <ThemeProvider theme={{ colors: { main: "#00ffff", txButton: "#ff00ff" }, cursors: { active: "pointer" } }}><ChainTransactionContext.Provider value={{ execute }}>
    <ActionSubmissionProvider onClose={onClose} onSuccess={onSuccess} onSetAction={onSetAction}>
      <Controls {...props} />
    </ActionSubmissionProvider>
  </ChainTransactionContext.Provider></ThemeProvider>;
}
beforeEach(() => {
  execute = jest.fn().mockResolvedValue({ status: 'submitted', txHash: '0x123' });
  onClose = jest.fn(); onSuccess = jest.fn(); onSetAction = jest.fn();
  jest.clearAllMocks();
});
const submit = async () => {
  fireEvent.click(screen.getByText('Submit'));
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
};

test('preparation, wallet and indexer waits share one busy state and prevent double submission', async () => {
  let finishPreparation;
  const before = () => new Promise(resolve => { finishPreparation = resolve; });
  render(<View before={before} />);
  fireEvent.click(screen.getByText('Submit'));
  expect(screen.getByText('busy')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Submit' }).getAttribute('aria-busy')).toBe('true');
  expect(screen.getByRole('button', { name: 'Submit' }).disabled).toBe(true);
  expect(within(screen.getByRole('button', { name: 'Submit' })).getByRole('progressbar').getAttribute('data-color')).toBe('#ff00ff');
  expect(screen.getByRole('button', { name: 'X' }).disabled).toBe(false);
  fireEvent.click(screen.getByText('Submit'));
  expect(execute).not.toHaveBeenCalled();
  await act(async () => finishPreparation());
  expect(execute).toHaveBeenCalledTimes(1);
  expect(onSuccess).not.toHaveBeenCalled();
  act(() => notifyTransactionSettlement('other-transaction', 'indexed'));
  expect(screen.getByText('busy')).toBeTruthy();
  await act(async () => notifyTransactionSettlement('0x123', 'indexed'));
  expect(onSuccess).toHaveBeenCalledWith('Test');
  expect(screen.getByText('ready')).toBeTruthy();
});

test.each([undefined, { status: 'denied' }, { status: 'unknown' }, { status: 'failed' }])('no submitted transaction leaves the form open and retryable (%j)', async outcome => {
  execute.mockResolvedValue(outcome);
  render(<View />);
  await submit();
  await screen.findByText('ready');
  expect(onClose).not.toHaveBeenCalled();
  expect(onSuccess).not.toHaveBeenCalled();
  expect(screen.getByLabelText('value').value).toBe('my entered value');
  expect(screen.getByRole('button', { name: 'Submit' }).disabled).toBe(false);
  expect(screen.queryByRole('progressbar')).toBeNull();
});

test('pending activity supplied by a manager keeps the button disabled and loading', () => {
  const view = render(<View loading />);
  expect(screen.getByRole('button', { name: 'Submit' }).disabled).toBe(true);
  expect(screen.getByRole('progressbar')).toBeTruthy();
  view.rerender(<View loading={false} />);
  expect(screen.getByRole('button', { name: 'Submit' }).disabled).toBe(false);
  expect(screen.queryByRole('progressbar')).toBeNull();
});

function StandaloneView({ onClick, onTransactionComplete, loading = false, promptingTransaction = false }) {
  return <ThemeProvider theme={{ colors: { main: '#00ffff', txButton: '#ff00ff' }, cursors: { active: 'pointer' } }}>
    <ChainTransactionContext.Provider value={{ promptingTransaction }}>
      <Button isTransaction loading={loading} color="#ffffff" onClick={onClick} onTransactionComplete={onTransactionComplete}>Submit</Button>
      <Button isTransaction onClick={() => {}}>Another action</Button>
    </ChainTransactionContext.Provider>
  </ThemeProvider>;
}

test('standalone transaction buttons lock immediately and stay loading until indexing clears the activity', async () => {
  let finishWallet;
  const onClick = jest.fn(() => new Promise(resolve => { finishWallet = resolve; }));
  const onTransactionComplete = jest.fn();
  render(<StandaloneView onClick={onClick} onTransactionComplete={onTransactionComplete} />);
  const button = screen.getByRole('button', { name: 'Submit' });
  fireEvent.click(button);
  expect(button.disabled).toBe(true);
  expect(button.getAttribute('aria-busy')).toBe('true');
  expect(within(button).getByRole('progressbar').getAttribute('data-color')).toBe('#ff00ff');
  const otherButton = screen.getByRole('button', { name: 'Another action' });
  expect(within(otherButton).queryByRole('progressbar')).toBeNull();
  fireEvent.click(button);
  expect(onClick).toHaveBeenCalledTimes(1);
  await act(async () => finishWallet({ status: 'submitted', txHash: '0x123' }));
  expect(button.disabled).toBe(true);
  expect(screen.getByRole('progressbar')).toBeTruthy();
  expect(onTransactionComplete).not.toHaveBeenCalled();
  await act(async () => notifyTransactionSettlement('0x123', 'indexed'));
  expect(button.disabled).toBe(false);
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(onTransactionComplete).toHaveBeenCalledWith({ status: 'indexed', txHash: '0x123' });
});

test.each([undefined, { status: 'unknown' }, { status: 'failed' }, { status: 'denied' }])('standalone buttons unlock after an unsuccessful wallet attempt (%j)', async outcome => {
  const onClick = jest.fn().mockResolvedValue(outcome);
  render(<StandaloneView onClick={onClick} />);
  const button = screen.getByRole('button', { name: 'Submit' });
  fireEvent.click(button);
  await waitFor(() => expect(button.disabled).toBe(false));
  expect(screen.queryByRole('progressbar')).toBeNull();
  fireEvent.click(button);
  await waitFor(() => expect(onClick).toHaveBeenCalledTimes(2));
});

test('standalone buttons unlock after a reverted transaction or thrown wallet error', async () => {
  const onClick = jest.fn().mockResolvedValueOnce({ status: 'submitted', txHash: '0x123' }).mockRejectedValueOnce(new Error('Wallet timeout'));
  render(<StandaloneView onClick={onClick} />);
  const button = screen.getByRole('button', { name: 'Submit' });
  fireEvent.click(button);
  await act(async () => notifyTransactionSettlement('0x123', 'failed'));
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  await waitFor(() => expect(button.disabled).toBe(false));
  expect(reportFailure).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('progressbar')).toBeNull();
});

test('a reverted transaction stops loading without closing or advancing', async () => {
  render(<View />);
  await submit();
  fireEvent.click(screen.getByText('Automatic close'));
  fireEvent.click(screen.getByText('Advance'));
  await act(async () => notifyTransactionSettlement('0x123', 'failed'));
  expect(screen.getByText('ready')).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
  expect(onSetAction).not.toHaveBeenCalled();
  expect(onSuccess).not.toHaveBeenCalled();
});

test('manual X works while pending and late success cannot navigate after unmount', async () => {
  const view = render(<View />);
  await submit();
  fireEvent.click(screen.getByText('X'));
  expect(onClose).toHaveBeenCalledTimes(1);
  view.unmount();
  await act(async () => notifyTransactionSettlement('0x123', 'indexed'));
  expect(onSuccess).not.toHaveBeenCalled();
  expect(onSetAction).not.toHaveBeenCalled();
});

test('next-step navigation waits for indexed success', async () => {
  render(<View />);
  await submit();
  fireEvent.click(screen.getByText('Advance'));
  expect(onSetAction).not.toHaveBeenCalled();
  await act(async () => notifyTransactionSettlement('0x123', 'indexed'));
  expect(onSetAction).toHaveBeenCalledWith('NEXT');
  expect(onSuccess).not.toHaveBeenCalled();
});

test('tracks fire-and-forget callers and completion racing the submission response', async () => {
  execute.mockImplementation(async () => {
    notifyTransactionSettlement('0x123', 'indexed');
    return { status: 'submitted', txHash: '0x123' };
  });
  render(<View fireAndForget />);
  await submit();
  await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('Test'));
});

test('unexpected preparation errors are reported once and preserve entered values', async () => {
  render(<View before={async () => { throw new Error('failure'); }} />);
  fireEvent.click(screen.getByText('Submit'));
  await screen.findByText('ready');
  expect(reportFailure).toHaveBeenCalledTimes(1);
  expect(execute).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

test('closing during preparation prevents a late wallet submission', async () => {
  let finishPreparation;
  const view = render(<View before={() => new Promise(resolve => { finishPreparation = resolve; })} />);
  fireEvent.click(screen.getByText('Submit'));
  fireEvent.click(screen.getByText('X'));
  view.unmount();
  await act(async () => finishPreparation());
  expect(execute).not.toHaveBeenCalled();
  expect(onSuccess).not.toHaveBeenCalled();
});


test.each(['indexed', 'failed', 'rejected'])('automatic closure waits through the wallet and only follows indexed success (%s)', async outcome => {
  let finishWallet;
  execute.mockImplementation(() => new Promise(resolve => { finishWallet = resolve; }));
  render(<View />);
  await submit();
  fireEvent.click(screen.getByText('Automatic close'));
  expect(onClose).not.toHaveBeenCalled();
  expect(onSuccess).not.toHaveBeenCalled();
  await act(async () => finishWallet(outcome === 'rejected' ? undefined : { status: 'submitted', txHash: '0x123' }));
  expect(onClose).not.toHaveBeenCalled();
  if (outcome !== 'rejected') await act(async () => notifyTransactionSettlement('0x123', outcome));
  expect(onClose).toHaveBeenCalledTimes(outcome === 'indexed' ? 1 : 0);
  expect(screen.getByText('ready')).toBeTruthy();
});

test('dialogs with no success navigation remain open after indexed success', async () => {
  onSuccess = undefined;
  render(<View />);
  await submit();
  await act(async () => notifyTransactionSettlement('0x123', 'indexed'));
  expect(onClose).not.toHaveBeenCalled();
  expect(onSetAction).not.toHaveBeenCalled();
  expect(reportFailure).not.toHaveBeenCalled();
  expect(screen.getByText('ready')).toBeTruthy();
});

test('the primary loader survives a button remount through wallet approval and indexing', async () => {
  let finishWallet;
  execute.mockImplementation(() => new Promise(resolve => { finishWallet = resolve; }));
  const view = render(<View />);
  await submit();
  view.rerender(<View buttonKey={1} />);
  const button = screen.getByRole('button', { name: 'Submit' });
  expect(button.disabled).toBe(true);
  expect(button.getAttribute('aria-busy')).toBe('true');
  expect(within(button).getByRole('progressbar').getAttribute('data-color')).toBe('#ff00ff');
  await act(async () => finishWallet({ status: 'submitted', txHash: '0x123' }));
  expect(within(button).getByRole('progressbar')).toBeTruthy();
  expect(onSuccess).not.toHaveBeenCalled();
  await act(async () => notifyTransactionSettlement('0x123', 'indexed'));
  expect(within(button).queryByRole('progressbar')).toBeNull();
  expect(onSuccess).toHaveBeenCalledWith('Test');
});
