import { ThemeProvider } from 'styled-components';
import theme from '../../../theme';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import { notifyTransactionSettlement } from '../../../lib/transactionSettlement';
import BridgeCrewDelegationDialog from './BridgeCrewDelegationDialog';

jest.mock('~/contexts/ChainTransactionContext', () => ({ __esModule: true, default: require('react').createContext(null) }), { virtual: true });
jest.mock('~/contexts/ActionSubmissionContext', () => jest.requireActual('../../../contexts/ActionSubmissionContext'), { virtual: true });
jest.mock('~/components/ActionSubmissionProvider', () => jest.requireActual('../../../components/ActionSubmissionProvider'), { virtual: true });
jest.mock('~/hooks/actionManagers/useCrewDelegationManager', () => jest.requireActual('../../../hooks/actionManagers/useCrewDelegationManager'), { virtual: true });
jest.mock('starknet', () => {
  global.TextEncoder = require('util').TextEncoder;
  global.TextDecoder = require('util').TextDecoder;
  return jest.requireActual('starknet');
});
jest.mock('@influenceth/sdk', () => ({ Entity: { IDS: { CREW: 1 } } }));
jest.mock('~/bridge/transfers', () => jest.requireActual('../../../bridge/transfers'), { virtual: true });
jest.mock('~/components/StatusMessage', () => jest.requireActual('../../../components/StatusMessage'), { virtual: true });
jest.mock('~/components/GenericDialog', () => jest.requireActual('../../../components/GenericDialog'), { virtual: true });
jest.mock('~/components/TextInputUncontrolled', () => jest.requireActual('../../../components/TextInputUncontrolled'), { virtual: true });
jest.mock('~/assets/images/cursor.png', () => '', { virtual: true });
jest.mock('~/assets/images/cursor-active.png', () => '', { virtual: true });
jest.mock('~/theme', () => jest.requireActual('../../../theme'), { virtual: true });
jest.mock('~/components/Loader', () => () => null, { virtual: true });
jest.mock('~/components/NavIcon', () => () => null, { virtual: true });
jest.mock('~/lib/utils', () => ({ nativeBool: Boolean }), { virtual: true });
jest.mock('~/components/Dialog', () => ({ children }) => <div>{children}</div>, { virtual: true });
jest.mock('~/components/ButtonAlt', () => ({ children, disabled, onClick }) => <button disabled={disabled} onClick={onClick}>{children}</button>, { virtual: true });
jest.mock('~/hooks/useStore', () => ({ getState: () => ({ dispatchAlertLogged: jest.fn() }) }), { virtual: true });
jest.mock('../../../lib/errorReporting', () => ({ reportFailure: jest.fn() }));

const crew = { id: 12, Crew: { delegatedTo: '0xa' } };
let execute, onClose, onDelegated;
const view = (props = {}) => <ThemeProvider theme={theme}><ChainTransactionContext.Provider value={{ execute, getStatus: () => 'ready' }}>
  <BridgeCrewDelegationDialog crew={crew} ownerAddress="0xa" onClose={onClose} onDelegated={onDelegated} {...props} />
</ChainTransactionContext.Provider></ThemeProvider>;
const setAddress = (value) => fireEvent.change(screen.getByLabelText('Starknet account address'), { target: { value } });
const submit = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Delegate Crew' }));
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
};

beforeEach(() => {
  execute = jest.fn().mockResolvedValue({ status: 'submitted', txHash: '0x123' });
  onClose = jest.fn();
  onDelegated = jest.fn();
});

test('validates the recipient before allowing submission', () => {
  render(view());
  for (const address of ['', 'invalid', '0x0', '0x' + 'f'.repeat(64), '0x000a']) {
    setAddress(address);
    expect(screen.getByRole('button', { name: 'Delegate Crew' }).disabled).toBe(true);
  }
  setAddress('0xb');
  expect(screen.getByRole('button', { name: 'Delegate Crew' }).disabled).toBe(false);
  expect(execute).not.toHaveBeenCalled();
});

test('waits for indexing, reports success in the still-open modal, and only closes on request', async () => {
  render(view());
  setAddress('0xb');
  await submit();
  expect(execute).toHaveBeenCalledWith('DelegateCrew', { caller_crew: { id: 12, label: 1 }, delegated_to: expect.any(String) });
  expect(BigInt(execute.mock.calls[0][1].delegated_to)).toBe(11n);
  expect(screen.getByRole('button', { name: 'Delegate Crew' }).disabled).toBe(true);
  expect(onDelegated).not.toHaveBeenCalled();
  await act(async () => notifyTransactionSettlement('0x123', 'indexed'));
  expect(screen.getByText('Crew delegated successfully.')).toBeTruthy();
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(onDelegated).toHaveBeenCalledWith(12, expect.any(String));
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('revocation uses the same flow with a locked owner address', async () => {
  render(view({ crew: { ...crew, Crew: { delegatedTo: '0xb' } }, revoke: true }));
  const address = screen.getByLabelText('Starknet account address');
  expect(address.value).toBe('0xa');
  expect(address.readOnly).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Revoke Delegation' }));
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
  expect(BigInt(execute.mock.calls[0][1].delegated_to)).toBe(10n);
  await act(async () => notifyTransactionSettlement('0x123', 'indexed'));
  expect(screen.getByText('Delegation revoked. Your account controls this crew again.')).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
});

test('failure is shown in the modal and allows retry without changing the row state', async () => {
  render(view());
  setAddress('0xb');
  await submit();
  await act(async () => notifyTransactionSettlement('0x123', 'failed'));
  expect(screen.getByText('Delegation was not completed. You can try again.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Delegate Crew' }).disabled).toBe(false);
  expect(onDelegated).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

test.each([undefined, { status: 'denied' }, { status: 'unknown' }])('reports a non-submitted outcome without claiming success (%j)', async (outcome) => {
  execute.mockResolvedValue(outcome);
  render(view());
  setAddress('0xb');
  await submit();
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain(outcome?.status === 'unknown' ? 'not yet known' : 'not completed'));
  expect(onDelegated).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});
