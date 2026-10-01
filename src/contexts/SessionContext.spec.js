import { isExpired } from 'react-jwt';
import { act, render } from '@testing-library/react';
import { useContext } from 'react';
import SessionContext, { SessionProvider } from './SessionContext';
import { AUTH_PHASES } from '~/lib/authFlow';
import { RpcProvider, WalletAccount } from 'starknet';
import { createWalletConnectors } from '~/lib/wallets';
import { createWalletSession } from '~/lib/walletSessions';
import api from '~/lib/api';
import useStore from '~/hooks/useStore';

jest.mock('starknet', () => ({ RpcProvider: jest.fn(), PaymasterRpc: jest.fn(), WalletAccount: jest.fn() }));
jest.mock('react-jwt', () => ({ isExpired: jest.fn(() => true) }));
jest.mock('~/lib/authFlow', () => jest.requireActual('../lib/authFlow'), { virtual: true });
jest.mock('@influenceth/sdk', () => ({ Address: { toStandard: (value) => value } }));
jest.mock('@tanstack/react-query', () => {
  const client = { invalidateQueries: jest.fn() };
  return { useQueryClient: () => client };
});
jest.mock('~/appConfig', () => ({ appConfig: { get: (key) => ({
  'Starknet.provider': 'https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/test-key',
  'Starknet.chainId': 'SN_SEPOLIA'
})[key] } }), { virtual: true });
jest.mock('~/components/Reconnecting', () => () => null, { virtual: true });
jest.mock('~/contexts/PrivyWalletContext', () => ({ usePrivyWallet: () => ({}) }), { virtual: true });
jest.mock('~/lib/api', () => ({ requestLogin: jest.fn(), verifyLogin: jest.fn() }), { virtual: true });
jest.mock('~/lib/loginTypedData', () => ({
  getLoginTypedData: (value) => value,
  getLoginVerificationParams: (value) => value
}), { virtual: true });
jest.mock('~/lib/paymaster', () => ({}), { virtual: true });
jest.mock('~/lib/priceUtils', () => ({ TOKEN: {} }), { virtual: true });
jest.mock('~/lib/utils', () => ({ areChainsEqual: (a, b) => a === b, resolveChainId: (value) => value, fireTrackingEvent: jest.fn() }), { virtual: true });
jest.mock('~/lib/walletPolicies', () => ({ buildGameplaySessionPolicies: () => [] }), { virtual: true });
jest.mock('~/lib/walletSessions', () => ({ createWalletSession: jest.fn() }), { virtual: true });
jest.mock('~/lib/wallets', () => ({
  WALLET_IDS: { CONTROLLER: 'controller', PRIVY: 'privy' },
  WALLET_ERROR_CODES: {},
  defaultEnabledConnectors: { controller: true },
  normalizeEnabledConnectors: (value) => value,
  normalizeConnectorId: (value) => value,
  getSelectedConnectorId: () => 'controller',
  getCartridgeChainOptions: () => ({}),
  getWalletCapabilities: () => ({}),
  getLoginWalletOptions: () => ['controller'],
  getStoredWalletId: jest.fn(), getPendingAuthWalletId: jest.fn(),
  clearPendingAuthWalletId: jest.fn(), clearStoredWalletId: jest.fn(),
  setStoredWalletId: jest.fn(), setPendingAuthWalletId: jest.fn(),
  createWalletConnectors: jest.fn()
}), { virtual: true });
jest.mock('~/hooks/useStore', () => jest.fn(), { virtual: true });

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
let session, connector, provider, state, walletSession;
function Probe() {
  session = useContext(SessionContext);
  return null;
}
beforeEach(() => {
  jest.clearAllMocks();
  isExpired.mockReturnValue(true);
  jest.useFakeTimers();
  state = {
    currentSession: {}, gameplay: {}, sessions: {},
    dispatchLauncherPage: jest.fn(),
    dispatchAlertLogged: jest.fn(), dispatchSessionStarted: jest.fn(),
    dispatchSessionSuspended: jest.fn(), dispatchSessionEnded: jest.fn()
  };
  useStore.mockImplementation((select) => select(state));
  useStore.getState = () => state;
  provider = { getClassAt: jest.fn() };
  RpcProvider.mockImplementation(() => provider);
  connector = { id: 'controller', wallet: { id: 'controller' }, connect: jest.fn() };
  createWalletConnectors.mockReturnValue({ controller: connector });
  WalletAccount.mockImplementation(() => ({ address: '0x123', signMessage: jest.fn().mockResolvedValue(['0x1', '0x2']) }));
  walletSession = { supported: jest.fn().mockResolvedValue(false), prepare: jest.fn(), ready: false };
  createWalletSession.mockReturnValue(walletSession);
});
afterEach(() => jest.useRealTimers());

const startLogin = async () => {
  await act(async () => { session.login({ controller: true }); });
  await act(async () => { jest.advanceTimersByTime(200); });
};

test.each(['resolve', 'reject'])('cancels connecting and ignores a late %s after retry', async (settle) => {
  render(<SessionProvider><Probe /></SessionProvider>);
  const first = deferred();
  connector.connect.mockReturnValueOnce(first.promise).mockReturnValue(new Promise(() => {}));
  await startLogin();
  expect(session.loginPrompt.busy).toBe(true);
  act(() => session.loginPrompt.cancel());
  expect(session.loginPrompt.busy).toBe(false);
  await startLogin();
  await act(async () => { first[settle](settle === 'resolve' ? { account: '0x123', chainId: 'SN_SEPOLIA' } : new Error('late error')); });
  expect(session.authPhase).toBe(AUTH_PHASES.CONNECTING_WALLET);
  expect(session.loginPrompt.busy).toBe(true);
  expect(state.dispatchAlertLogged).not.toHaveBeenCalled();
  expect(WalletAccount).not.toHaveBeenCalled();
});

test('cancels verification without continuing authentication when the RPC returns', async () => {
  render(<SessionProvider><Probe /></SessionProvider>);
  const verification = deferred();
  provider.getClassAt.mockReturnValue(verification.promise);
  connector.connect.mockResolvedValue({ account: '0x123', chainId: 'SN_SEPOLIA' });
  await startLogin();
  expect(session.authPhase).toBe(AUTH_PHASES.VERIFYING_WALLET);
  act(() => session.loginPrompt.cancel());
  expect(session.loginPrompt.busy).toBe(false);
  await act(async () => { verification.resolve({}); });
  expect(api.requestLogin).not.toHaveBeenCalled();
  expect(state.dispatchSessionStarted).not.toHaveBeenCalled();
});

test('passes the configured Alchemy endpoint explicitly as nodeUrl', () => {
  render(<SessionProvider><Probe /></SessionProvider>);
  expect(RpcProvider).toHaveBeenCalledWith({
    nodeUrl: 'https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/test-key'
  });
});

test('ignores a login challenge failure after cancellation and retry', async () => {
  render(<SessionProvider><Probe /></SessionProvider>);
  const challenge = deferred();
  provider.getClassAt.mockResolvedValue({});
  api.requestLogin.mockReturnValue(challenge.promise);
  connector.connect.mockResolvedValueOnce({ account: '0x123', chainId: 'SN_SEPOLIA' })
    .mockReturnValue(new Promise(() => {}));
  await startLogin();
  expect(session.authPhase).toBe(AUTH_PHASES.SIGNING_IN);
  act(() => session.loginPrompt.cancel());
  await startLogin();
  await act(async () => { challenge.reject(new Error('late API error')); });
  expect(session.authPhase).toBe(AUTH_PHASES.CONNECTING_WALLET);
  expect(state.dispatchAlertLogged).not.toHaveBeenCalled();
});

test('prepares a supported wallet session on fresh login with Default enabled', async () => {
  state.gameplay.useSessions = null;
  provider.getClassAt.mockResolvedValue({});
  api.requestLogin.mockResolvedValue({});
  api.verifyLogin.mockResolvedValue('api-token');
  walletSession.supported.mockResolvedValue(true);
  walletSession.prepare.mockResolvedValue(true);
  connector.connect.mockResolvedValue({ account: '0x123', chainId: 'SN_SEPOLIA' });
  render(<SessionProvider><Probe /></SessionProvider>);
  await startLogin();
  expect(walletSession.prepare).toHaveBeenCalledTimes(1);
  expect(state.dispatchSessionStarted).toHaveBeenCalledWith(expect.objectContaining({ token: 'api-token' }));
});

test.each(['resolve', 'reject'])('ignores a session approval %s after cancellation', async (settle) => {
  state.gameplay.useSessions = null;
  provider.getClassAt.mockResolvedValue({});
  api.requestLogin.mockResolvedValue({});
  api.verifyLogin.mockResolvedValue('api-token');
  walletSession.supported.mockResolvedValue(true);
  const approval = deferred();
  walletSession.prepare.mockReturnValue(approval.promise);
  connector.connect.mockResolvedValue({ account: '0x123', chainId: 'SN_SEPOLIA' });
  render(<SessionProvider><Probe /></SessionProvider>);
  await startLogin();
  expect(session.authPhase).toBe(AUTH_PHASES.PREPARING_SESSION);
  act(() => session.loginPrompt.cancel());
  expect(session.loginPrompt.busy).toBe(false);
  await act(async () => { approval[settle](settle === 'resolve' ? true : new Error('late approval error')); });
  expect(state.dispatchSessionStarted).not.toHaveBeenCalled();
  expect(state.dispatchAlertLogged).not.toHaveBeenCalled();
  expect(session.gameplaySessionReady).toBe(false);
});

test.each([true, false])('ignores a session support result of %s after cancellation', async (supported) => {
  provider.getClassAt.mockResolvedValue({});
  api.requestLogin.mockResolvedValue({});
  api.verifyLogin.mockResolvedValue('api-token');
  const support = deferred();
  walletSession.supported.mockReturnValue(support.promise);
  connector.connect.mockResolvedValue({ account: '0x123', chainId: 'SN_SEPOLIA' });
  render(<SessionProvider><Probe /></SessionProvider>);
  await startLogin();
  expect(walletSession.supported).toHaveBeenCalled();
  act(() => session.loginPrompt.cancel());
  await act(async () => { support.resolve(supported); });
  expect(state.dispatchSessionStarted).not.toHaveBeenCalled();
  expect(walletSession.prepare).not.toHaveBeenCalled();
  expect(session.loginPrompt.busy).toBe(false);
});


test('opens login and returns to the requested store tab after authentication', async () => {
  provider.getClassAt.mockResolvedValue({});
  api.requestLogin.mockResolvedValue({});
  api.verifyLogin.mockResolvedValue('api-token');
  connector.connect.mockResolvedValue({ account: '0x123', chainId: 'SN_SEPOLIA' });
  render(<SessionProvider><Probe /></SessionProvider>);

  await act(async () => {
    session.login(undefined, { page: 'store', subpage: 'crewmates' });
  });
  expect(session.loginPrompt.open).toBe(true);
  expect(state.dispatchLauncherPage).toHaveBeenLastCalledWith('play');
  await act(async () => { session.loginPrompt.onSelect('controller'); });
  await act(async () => { jest.advanceTimersByTime(200); });

  expect(state.dispatchSessionStarted).toHaveBeenCalled();
  expect(state.dispatchLauncherPage).toHaveBeenLastCalledWith('store', 'crewmates');
});

test('closing a store login does not redirect a later login back to the store', async () => {
  provider.getClassAt.mockResolvedValue({});
  api.requestLogin.mockResolvedValue({});
  api.verifyLogin.mockResolvedValue('api-token');
  connector.connect.mockResolvedValue({ account: '0x123', chainId: 'SN_SEPOLIA' });
  render(<SessionProvider><Probe /></SessionProvider>);

  await act(async () => {
    session.login(undefined, { page: 'store', subpage: 'packs' });
  });
  act(() => session.loginPrompt.close());
  await startLogin();

  expect(state.dispatchSessionStarted).toHaveBeenCalled();
  expect(state.dispatchLauncherPage).toHaveBeenCalledTimes(1);
});


test('uses the account approved by the connector without a second connection request', async () => {
  connector.wallet.request = jest.fn();
  connector.connect.mockResolvedValue({ account: '0x123', chainId: 'SN_SEPOLIA' });
  provider.getClassAt.mockReturnValue(new Promise(() => {}));
  render(<SessionProvider><Probe /></SessionProvider>);
  await startLogin();
  expect(WalletAccount).toHaveBeenCalledWith({
    provider, walletProvider: connector.wallet, address: '0x123', paymaster: undefined
  });
  expect(connector.wallet.request).not.toHaveBeenCalled();
  expect(session.walletAccount.address).toBe('0x123');
});

test('retains the approved account when the extension repeats it during authentication', async () => {
  let onAccountChange;
  const account = {
    address: '0x123',
    onAccountChange: (callback) => { onAccountChange = callback; },
    off: jest.fn()
  };
  connector.connect.mockResolvedValue({ account: '0x123', chainId: 'SN_SEPOLIA', walletAccount: account });
  provider.getClassAt.mockReturnValue(new Promise(() => {}));
  render(<SessionProvider><Probe /></SessionProvider>);
  await startLogin();
  act(() => onAccountChange(['0x123']));
  expect(session.walletAccount).toBe(account);
  expect(state.dispatchSessionEnded).not.toHaveBeenCalled();
  act(() => onAccountChange([]));
  expect(session.walletAccount).toBeUndefined();
});


test('returns the connection failure so a pending action does not wait for another timeout', async () => {
  const error = new Error('Connection rejected');
  connector.connect.mockRejectedValue(error);
  render(<SessionProvider><Probe /></SessionProvider>);
  let result;
  await act(async () => { result = await session.login({ controller: true }); });
  expect(result).toEqual({ error });
  expect(session.loginPrompt.busy).toBe(false);
});

const renderAuthenticatedSession = () => {
  isExpired.mockReturnValue(false);
  state.currentSession = { token: 'valid', walletId: 'controller', accountAddress: '0x123', isDeployed: true };
  state.sessions = { '0x123': state.currentSession };
  return render(<SessionProvider><Probe /></SessionProvider>);
};

test('restores a logged-in wallet silently after an unavailable attempt without logging in again', async () => {
  connector.connect.mockResolvedValue({});
  renderAuthenticatedSession();
  let unavailable;
  await act(async () => {
    unavailable = session.refreshWalletConnection();
  });
  await act(async () => { jest.advanceTimersByTime(250); });
  await act(async () => { jest.advanceTimersByTime(250); });
  await expect(unavailable).resolves.toBe(false);
  expect(session.walletReadyForTransactions).toBe(false);

  connector.connect.mockResolvedValue({ account: '0x123', chainId: 'SN_SEPOLIA' });
  let restored;
  await act(async () => { restored = session.refreshWalletConnection(); });
  await act(async () => { jest.advanceTimersByTime(200); });
  await expect(restored).resolves.toBe(true);
  expect(session.walletReadyForTransactions).toBe(true);
  expect(session.walletAccount.address).toBe('0x123');
  expect(connector.connect.mock.calls.every(([options]) => options.auto === true)).toBe(true);
  expect(api.requestLogin).not.toHaveBeenCalled();
  expect(state.dispatchAlertLogged).not.toHaveBeenCalled();
});

test.each([
  { account: '0x456', chainId: 'SN_SEPOLIA' },
  { account: '0x123', chainId: 'SN_MAIN' }
])('does not silently restore the wrong account or network: %j', async (connection) => {
  connector.connect.mockResolvedValue(connection);
  renderAuthenticatedSession();
  let restored;
  await act(async () => { restored = session.refreshWalletConnection(); });
  await act(async () => { jest.advanceTimersByTime(200); });
  await expect(restored).resolves.toBe(false);
  expect(session.walletReadyForTransactions).toBe(false);
  expect(WalletAccount).not.toHaveBeenCalled();
  expect(api.requestLogin).not.toHaveBeenCalled();
});

test('recovers after an extension logout clears the signer and removes its listeners', async () => {
  const on = jest.fn();
  const off = jest.fn();
  WalletAccount.mockImplementation(() => ({ address: '0x123', on, off }));
  connector.connect.mockResolvedValue({ account: '0x123', chainId: 'SN_SEPOLIA' });
  renderAuthenticatedSession();
  let restored;
  await act(async () => { restored = session.refreshWalletConnection(); });
  await act(async () => { jest.advanceTimersByTime(200); });
  await expect(restored).resolves.toBe(true);
  const onAccountsChanged = on.mock.calls.find(([event]) => event === 'accountsChanged')[1];

  act(() => onAccountsChanged([]));
  expect(session.authenticated).toBe(true);
  expect(session.walletReadyForTransactions).toBe(false);
  expect(off).toHaveBeenCalledWith('accountsChanged', onAccountsChanged);

  // The extension is unlocked externally; it need not emit another event to the app.
  await act(async () => { restored = session.refreshWalletConnection(); });
  await act(async () => { jest.advanceTimersByTime(200); });
  await expect(restored).resolves.toBe(true);
  expect(session.walletReadyForTransactions).toBe(true);
  expect(api.requestLogin).not.toHaveBeenCalled();
});

test('ignores a silent restore that completes after logout', async () => {
  const connection = deferred();
  connector.connect.mockReturnValue(connection.promise);
  renderAuthenticatedSession();
  let restored;
  await act(async () => { restored = session.refreshWalletConnection(); });
  await act(async () => { await session.logout(); });
  await act(async () => { connection.resolve({ account: '0x123', chainId: 'SN_SEPOLIA' }); });
  await expect(restored).resolves.toBe(false);
  expect(session.walletReadyForTransactions).toBe(false);
  expect(WalletAccount).not.toHaveBeenCalled();
});
