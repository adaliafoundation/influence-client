const React = require('react');
const { render, screen, fireEvent } = require('@testing-library/react');
require('@testing-library/jest-dom');

// Keep the real Game provider ordering and fee dialog, without wallet/network setup.
for (const [path, name] of [
  ['~/contexts/ActionItemContext', 'ActionItemProvider'],
  ['~/contexts/ActivitiesContext', 'ActivitiesProvider'],
  ['~/contexts/CoachmarkContext', 'CoachmarkProvider'],
  ['./contexts/CrewContext', 'CrewProvider'],
  ['~/contexts/DevToolContext', 'DevToolProvider'],
  ['~/contexts/PrivyWalletContext', 'PrivyWalletProvider'],
  ['~/contexts/ScreensizeContext', 'ScreensizeProvider'],
  ['~/contexts/SessionContext', 'SessionProvider'],
  ['~/contexts/SyncedTimeContext', 'SyncedTimeProvider'],
  ['~/contexts/WebsocketContext', 'WebsocketProvider'],
  ['~/contexts/WagmiContext', 'default']
]) {
  jest.doMock(path, () => ({ __esModule: true, [name]: ({ children }) => children }), { virtual: true });
}
for (const path of [
  '~/components/FullpageInterstitial', '~/components/VersionUpdateDialog',
  '~/game/Audio', '~/game/ChatListener', '~/game/FundingIntentMonitor',
  '~/game/Interface', '~/game/Scene', '~/ScreensizeWarning'
]) {
  jest.doMock(path, () => ({ __esModule: true, default: () => null }), { virtual: true });
}
jest.mock('~/contexts/ChainTransactionContext', () => {
  const React = require('react');
  const TransactionFeePrompt = require('./components/TransactionFeePrompt').default;
  return { ChainTransactionProvider: ({ children }) => {
    const [prompt, setPrompt] = React.useState(false);
    return <>{children}<button onClick={() => setPrompt(true)}>Request transaction</button>
      {prompt && <TransactionFeePrompt type="USDC" onConfirm={() => setPrompt(false)} onReject={() => setPrompt(false)} />}
    </>;
  } };
}, { virtual: true });
jest.mock('~/components/Dialog', () => jest.requireActual('./components/Dialog'), { virtual: true });
jest.mock('~/components/Button', () => ({ __esModule: true, default: ({ children, onClick }) => <button onClick={onClick}>{children}</button> }), { virtual: true });
jest.mock('~/theme', () => ({ __esModule: true, default: { colors: { contentBackdrop: 'rgba(0, 0, 0, 0.5)' }, breakpoints: { mobile: 600 } } }), { virtual: true });
jest.mock('~/appConfig/features', () => ({ features: {} }), { virtual: true });
jest.mock('~/appConfig', () => ({ appConfig: { get: () => true } }), { virtual: true });
jest.mock('~/lib/starterPacks', () => ({ STARTER_PACK_CHECKOUT_PARAM: 'checkout' }), { virtual: true });
jest.mock('~/lib/graphics/quality', () => ({ getGraphicsDefaults: jest.fn() }), { virtual: true });
jest.mock('~/hooks/useServiceWorker', () => ({ __esModule: true, default: () => ({}) }), { virtual: true });
jest.mock('~/hooks/useSession', () => ({ __esModule: true, default: () => ({ authenticated: true }) }), { virtual: true });
jest.mock('~/hooks/useStore', () => ({ __esModule: true, default: selector => selector({ graphics: { autodetect: false } }) }), { virtual: true });
jest.mock('./gtm', () => ({ initializeTagManager: jest.fn() }));
jest.mock('detect-gpu', () => ({ getGPUTier: () => new Promise(() => {}) }));

const Game = require('./Game').default;

test('provider-owned fee authorization dialogs receive the app theme', () => {
  render(<Game />);
  fireEvent.click(screen.getByRole('button', { name: 'Request transaction' }));
  expect(screen.getByRole('heading', { name: 'Authorize Operational Fees' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Not Now' }));
  expect(screen.queryByRole('heading', { name: 'Authorize Operational Fees' })).not.toBeInTheDocument();
});
