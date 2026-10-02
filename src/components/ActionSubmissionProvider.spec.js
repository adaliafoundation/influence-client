import { ThemeProvider } from 'styled-components';
import Button from './ButtonAlt';
import { useContext, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
jest.mock('../lib/errorReporting', () => ({ reportFailure: jest.fn() }));

let execute, onClose, onSuccess, onSetAction;
function Controls({ before = async () => {}, fireAndForget = false }) {
  const submission = useActionSubmission();
  const chain = useContext(ChainTransactionContext);
  const [text, setText] = useState('my entered value');
  return <>
    <input aria-label="value" value={text} onChange={e => setText(e.target.value)} />
    <span>{submission.busy ? 'busy' : 'ready'}</span>
    <Button isTransaction onClick={async () => {
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

test.each([undefined, { status: 'denied' }])('no submitted transaction leaves the form open and retryable (%j)', async outcome => {
  execute.mockResolvedValue(outcome);
  render(<View />);
  await submit();
  await screen.findByText('ready');
  expect(onClose).not.toHaveBeenCalled();
  expect(onSuccess).not.toHaveBeenCalled();
  expect(screen.getByLabelText('value').value).toBe('my entered value');
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
