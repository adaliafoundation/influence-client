import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import Account from './Account';
import useSession from '~/hooks/useSession';
import { usePrivyWallet } from '~/contexts/PrivyWalletContext';
import useCopyWalletAddress from '~/hooks/useCopyWalletAddress';

jest.mock('~/hooks/useSession', () => jest.fn(), { virtual: true });
jest.mock('~/contexts/PrivyWalletContext', () => ({ usePrivyWallet: jest.fn() }), { virtual: true });
jest.mock('~/hooks/useCopyWalletAddress', () => jest.fn(), { virtual: true });
jest.mock('~/components/WalletIcon', () => ({ walletId }) => <span data-testid="wallet-icon">{walletId}</span>, { virtual: true });
jest.mock('~/components/Icons', () => ({ CopyIcon: () => null, WarningIcon: () => <svg aria-label="Warning" /> }), { virtual: true });
jest.mock('~/components/DataReadout', () => ({ label, children, className }) => (
  <div className={className}><label>{label}:</label><span>{children}</span></div>
), { virtual: true });
jest.mock('~/components/ButtonPill', () => (props) => <button {...props} />, { virtual: true });
jest.mock('~/lib/wallets', () => ({
  ...jest.requireActual('../../lib/walletIds'),
  getWalletLabel: (id) => id === 'privy' ? 'Influence Account' : 'Ready Wallet'
}), { virtual: true });

const renderAccount = () => render(
  <ThemeProvider theme={{ colors: {}, cursors: {} }}><Account /></ThemeProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  useSession.mockReturnValue({ accountAddress: '0xreadyaccount', walletId: 'privy' });
  usePrivyWallet.mockReturnValue({ ready: true, modalOpen: false, exportPrivateKey: jest.fn().mockResolvedValue() });
  useCopyWalletAddress.mockReturnValue(jest.fn());
});

test('shows and copies the session account address, and opens Privy export', async () => {
  renderAccount();
  expect(useSession).toHaveBeenCalledWith(false);
  expect(screen.getByText('Influence Account')).toBeInTheDocument();
  expect(screen.getByTestId('wallet-icon')).toHaveTextContent('privy');
  expect(screen.getByText('0xreadyaccount')).toBeInTheDocument();
  expect(useCopyWalletAddress).toHaveBeenCalledWith('0xreadyaccount');
  fireEvent.click(screen.getByRole('button', { name: 'Copy account address' }));
  expect(useCopyWalletAddress.mock.results[0].value).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Export private key' }));
  await waitFor(() => expect(usePrivyWallet.mock.results[0].value.exportPrivateKey).toHaveBeenCalledTimes(1));
});

test('does not offer export for an external wallet even with a Privy session', () => {
  useSession.mockReturnValue({ accountAddress: '0xexternal', walletId: 'argentX' });
  renderAccount();
  expect(screen.getByText('Ready Wallet')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Export/ })).not.toBeInTheDocument();
});

test('does not expose account actions when logged out', () => {
  useSession.mockReturnValue({});
  renderAccount();
  expect(screen.getByText('Log in to view your wallet account.')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('disables export until Privy is ready', () => {
  usePrivyWallet.mockReturnValue({ ready: false });
  renderAccount();
  expect(screen.getByRole('button', { name: 'Export private key' })).toBeDisabled();
});

test('prevents repeated exports and allows retry after failure without exposing diagnostics', async () => {
  let rejectExport;
  const exportPrivateKey = jest.fn(() => new Promise((resolve, reject) => { rejectExport = reject; }));
  usePrivyWallet.mockReturnValue({ ready: true, exportPrivateKey });
  renderAccount();
  fireEvent.click(screen.getByRole('button', { name: 'Export private key' }));
  expect(screen.getByRole('button', { name: 'Exporting…' })).toBeDisabled();
  rejectExport(new Error('sensitive provider diagnostics'));
  await screen.findByRole('alert');
  expect(screen.getByRole('button', { name: 'Export private key' })).toBeEnabled();
  expect(screen.queryByText(/sensitive provider/)).not.toBeInTheDocument();
});


test('resets after modal dismissal even if export stays pending, ignoring stale failures on retry', async () => {
  let rejectFirstExport;
  const exportPrivateKey = jest.fn()
    .mockImplementationOnce(() => new Promise((resolve, reject) => { rejectFirstExport = reject; }))
    .mockImplementation(() => new Promise(() => {}));
  const state = { ready: true, modalOpen: false, exportPrivateKey };
  usePrivyWallet.mockImplementation(() => state);
  const view = () => <ThemeProvider theme={{ colors: {}, cursors: {} }}><Account /></ThemeProvider>;
  const { rerender } = render(view());
  fireEvent.click(screen.getByRole('button', { name: 'Export private key' }));
  state.modalOpen = true;
  rerender(view());
  expect(screen.getByRole('button', { name: 'Exporting…' })).toBeDisabled();
  state.modalOpen = false;
  rerender(view());
  expect(screen.getByRole('button', { name: 'Export private key' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Export private key' }));
  await act(async () => rejectFirstExport(new Error('Old request cancelled')));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Exporting…' })).toBeDisabled();
  expect(exportPrivateKey).toHaveBeenCalledTimes(2);
});
