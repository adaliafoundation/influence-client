import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { usePrivy } from '@privy-io/react-auth';
import { useExportWallet } from '@privy-io/react-auth/extended-chains';
import { PrivyWalletProvider, usePrivyWallet } from './PrivyWalletContext';

jest.mock('@privy-io/react-auth', () => ({
  PrivyProvider: ({ children }) => children,
  usePrivy: jest.fn(),
  useModalStatus: () => ({ isOpen: false }),
  useLogin: () => ({ login: jest.fn() })
}));
jest.mock('@privy-io/react-auth/extended-chains', () => ({
  useExportWallet: jest.fn(),
  useCreateWallet: () => ({ createWallet: jest.fn() }),
  useSignRawHash: () => ({ signRawHash: jest.fn() })
}), { virtual: true });
jest.mock('~/appConfig', () => ({ appConfig: { get: () => 'test-app' } }), { virtual: true });
jest.mock('~/lib/privyWallet', () => {
  Object.assign(global, { TextEncoder: require('util').TextEncoder, TextDecoder: require('util').TextDecoder });
  return require('../lib/privyWallet');
}, { virtual: true });
jest.mock('~/lib/privyAuthErrors', () => require('../lib/privyAuthErrors'), { virtual: true });
jest.mock('~/lib/walletIds', () => require('../lib/walletIds'), { virtual: true });

const ExportConsumer = ({ onError }) => {
  const { exportPrivateKey } = usePrivyWallet();
  return <button onClick={() => exportPrivateKey().catch(onError)}>Export</button>;
};

beforeEach(() => {
  useExportWallet.mockReturnValue({ exportWallet: jest.fn().mockResolvedValue() });
  usePrivy.mockReturnValue({
    ready: true,
    authenticated: true,
    user: { linkedAccounts: [{
      type: 'wallet', walletClientType: 'privy', chainType: 'starknet',
      address: '0x123', publicKey: '0x456', id: 'wallet-id'
    }] }
  });
});

test('exports the linked Privy Starknet wallet instead of the derived account address', async () => {
  render(<PrivyWalletProvider><ExportConsumer onError={jest.fn()} /></PrivyWalletProvider>);
  fireEvent.click(screen.getByText('Export'));
  await waitFor(() => expect(useExportWallet.mock.results.at(-1).value.exportWallet)
    .toHaveBeenCalledWith({ address: '0x123' }));
});

test('refuses export after Privy authentication expires', async () => {
  usePrivy.mockReturnValue({ ready: true, authenticated: false, user: null });
  const onError = jest.fn();
  render(<PrivyWalletProvider><ExportConsumer onError={onError} /></PrivyWalletProvider>);
  fireEvent.click(screen.getByText('Export'));
  await waitFor(() => expect(onError).toHaveBeenCalled());
  expect(useExportWallet.mock.results.at(-1).value.exportWallet).not.toHaveBeenCalled();
});
