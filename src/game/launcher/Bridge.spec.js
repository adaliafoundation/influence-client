import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { useAccount, useChainId, useConnect } from 'wagmi';
import Bridge from './Bridge';

jest.mock('~/assets/images/sales/asteroids_hero.png', () => 'image', { virtual: true });
jest.mock('~/assets/images/sales/crewmates_hero.png', () => 'image', { virtual: true });
jest.mock('~/assets/images/modal_headers/OwnedCrew.png', () => 'image', { virtual: true });
jest.mock('~/assets/images/hud_headers/SurfaceShip.png', () => 'image', { virtual: true });
jest.mock('~/assets/images/starknet-icon.png', () => 'image', { virtual: true });
jest.mock('~/assets/images/sales/sway_hero.jpg', () => 'image', { virtual: true });

jest.mock('viem', () => ({ formatUnits: (value, decimals) => String(Number(value) / (10 ** decimals)) }));

jest.mock('wagmi', () => ({
  useAccount: jest.fn(), useChainId: jest.fn(), useConnect: jest.fn(),
  useDisconnect: () => ({ disconnect: jest.fn() }),
  useSwitchChain: () => ({ switchChain: jest.fn() }),
}));
jest.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }));
jest.mock('~/contexts/WagmiContext', () => ({ configuredChain: { id: 1, name: 'Ethereum' } }), { virtual: true });
jest.mock('~/components/Icons', () => Object.fromEntries(
  ['AsteroidIcon', 'CopyIcon', 'CrewIcon', 'CrewmateIcon', 'EthIcon', 'GoIcon', 'ShipIcon', 'SwayIcon', 'WalletIcon']
    .map((name) => [name, () => null])
), { virtual: true });
jest.mock('~/bridge/assets', () => ({
  bridgeAssetTypes: ['asteroids', 'crewmates', 'crews', 'ships'],
  getBridgeAssetConfig: (type) => ({ label: type, entityLabel: 1 }),
  isBridgeAssetConfigured: () => true,
}), { virtual: true });
jest.mock('~/bridge/sway', () => ({
  getPendingSwayAmounts: () => ({ ethereum: {}, starknet: {} }),
}), { virtual: true });
jest.mock('~/bridge/transfers', () => ({ sameBridgeAddress: (a, b) => a === b }), { virtual: true });
jest.mock('~/bridge/limits', () => ({ MAX_BRIDGE_ASSETS: 20, getBridgeBatchError: () => null }), { virtual: true });
jest.mock('~/hooks/useSession', () => () => ({ accountAddress: '0x123', login: jest.fn() }), { virtual: true });
jest.mock('~/hooks/useStore', () => () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useBridgeActions', () => () => ({ claimedAsteroidIds: [] }), { virtual: true });
jest.mock('~/hooks/useBridgeAssets', () => ({
  __esModule: true,
  default: (type) => ({
    config: { label: type },
    ethereumAssets: { data: [{ id: 2, name: 'Ethereum asset' }] },
    starknetAssets: { data: [{ id: 1, name: 'Starknet asset' }] },
    progressItems: [],
  }),
  useBridgeSway: () => ({ ethereumSway: {}, starknetSway: { data: '1000000' }, swayCrossings: [] }),
}), { virtual: true });
jest.mock('~/game/launcher/components/BridgeAssetAction', () => () => <button>Starknet action</button>, { virtual: true });
jest.mock('~/game/launcher/components/BridgeCrewDelegationDialog', () => () => null, { virtual: true });
jest.mock('~/game/launcher/components/BridgeAssetTransferDialog', () => () => null, { virtual: true });
jest.mock('~/game/launcher/components/LauncherDialog', () => ({ panes }) => {
  const [selected, setSelected] = require('react').useState(0);
  return <div>
    {panes.map((pane, index) => <button key={pane.key} onClick={() => setSelected(index)}>{pane.label}</button>)}
    {require('react').cloneElement(panes[selected].pane)}
  </div>;
}, { virtual: true });

const renderPortal = () => render(
  <ThemeProvider theme={{ colors: {}, cursors: {} }}><Bridge /></ThemeProvider>
);

beforeEach(() => {
  useAccount.mockReturnValue({ isConnected: false });
  useChainId.mockReturnValue(1);
  useConnect.mockReturnValue({ connectors: [{ uid: 'wallet', name: 'Test wallet' }], connect: jest.fn() });
});

test.each(['asteroids', 'crewmates', 'crews', 'ships'])('%s remains usable without Ethereum while bridging is disabled', (type) => {
  renderPortal();
  fireEvent.click(screen.getByRole('button', { name: type }));
  expect(screen.getByText('Connect to Ethereum')).toBeVisible();
  expect(screen.queryByText('Ethereum asset')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Starknet asset'));
  expect(screen.getByRole('button', { name: 'Bridge to Ethereum' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Starknet action' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Test wallet' }));
  expect(useConnect().connect).toHaveBeenCalledWith({ connector: expect.objectContaining({ uid: 'wallet' }), chainId: 1 });
});

test('SWAY balance remains visible but cannot bridge without Ethereum', () => {
  renderPortal();
  fireEvent.click(screen.getByRole('button', { name: 'SWAY' }));
  expect(screen.getByText('Connect to Ethereum')).toBeVisible();
  expect(screen.getByText('1')).toBeVisible();
  fireEvent.change(screen.getByPlaceholderText('Amount'), { target: { value: '1' } });
  expect(screen.getByRole('button', { name: 'Bridge to Ethereum' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Bridge to Starknet' })).not.toBeInTheDocument();
});

test('connecting and disconnecting restores and blocks Ethereum actions', () => {
  const view = renderPortal();
  useAccount.mockReturnValue({ isConnected: true, address: '0xabc' });
  view.rerender(<ThemeProvider theme={{ colors: {}, cursors: {} }}><Bridge /></ThemeProvider>);
  expect(screen.getByText('Ethereum asset')).toBeVisible();
  fireEvent.click(screen.getByText('Starknet asset'));
  expect(screen.getByRole('button', { name: 'Bridge to Ethereum' })).toBeEnabled();
  useAccount.mockReturnValue({ isConnected: false });
  view.rerender(<ThemeProvider theme={{ colors: {}, cursors: {} }}><Bridge /></ThemeProvider>);
  expect(screen.getByText('Connect to Ethereum')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Bridge to Ethereum' })).toBeDisabled();
});

test('wrong Ethereum network only blocks the Ethereum column and bridge actions', () => {
  useAccount.mockReturnValue({ isConnected: true, address: '0xabc' });
  useChainId.mockReturnValue(2);
  renderPortal();
  expect(screen.getByRole('button', { name: 'Switch to Ethereum' })).toBeVisible();
  expect(screen.queryByText('Ethereum asset')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Starknet asset'));
  expect(screen.getByRole('button', { name: 'Bridge to Ethereum' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Starknet action' })).toBeEnabled();
});
