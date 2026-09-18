import { act, render } from '@testing-library/react';
import { useContext } from 'react';
import SessionContext, { SessionProvider } from './SessionContext';
import { AUTH_PHASES } from '~/lib/authFlow';
import { RpcProvider, WalletAccount } from 'starknet';
import { createWalletConnectors } from '~/lib/wallets';
import api from '~/lib/api';
import useStore from '~/hooks/useStore';

jest.mock('starknet', () => ({ RpcProvider: jest.fn(), PaymasterRpc: jest.fn(), WalletAccount: { connect: jest.fn() } }));
jest.mock('react-jwt', () => ({ isExpired: () => true }));
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
jest.mock('~/lib/loginTypedData', () => ({ getLoginTypedData: (value) => value }), { virtual: true });
jest.mock('~/lib/paymaster', () => ({}), { virtual: true });
jest.mock('~/lib/priceUtils', () => ({ TOKEN: {} }), { virtual: true });
jest.mock('~/lib/utils', () => ({ areChainsEqual: (a, b) => a === b, resolveChainId: (value) => value, fireTrackingEvent: jest.fn() }), { virtual: true });
jest.mock('~/lib/walletPolicies', () => ({ buildGameplaySessionPolicies: () => [] }), { virtual: true });
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
let session, connector, provider, state;
function Probe() {
  session = useContext(SessionContext);
  return null;
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  state = {
    currentSession: {}, gameplay: {}, sessions: {},
    dispatchAlertLogged: jest.fn(), dispatchSessionStarted: jest.fn(),
    dispatchSessionSuspended: jest.fn(), dispatchSessionEnded: jest.fn()
  };
  useStore.mockImplementation((select) => select(state));
  provider = { getClassAt: jest.fn() };
  RpcProvider.mockImplementation(() => provider);
  connector = { id: 'controller', wallet: { id: 'controller' }, connect: jest.fn() };
  createWalletConnectors.mockReturnValue({ controller: connector });
  WalletAccount.connect.mockResolvedValue({ signMessage: jest.fn() });
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
  expect(WalletAccount.connect).not.toHaveBeenCalled();
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
