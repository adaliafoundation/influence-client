import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import FundingFlow from './FundingFlow';
import { features } from '~/appConfig/features';

jest.mock('~/appConfig/features', () => ({ features: { banxa: false, layerswap: false } }), { virtual: true });
jest.mock('~/appConfig', () => ({ appConfig: { get: () => '' } }), { virtual: true });
jest.mock('~/assets/images/sales/logo_avnu.svg', () => () => null, { virtual: true });
jest.mock('~/assets/images/sales/logo_layerswap_icon.svg', () => () => null, { virtual: true });
jest.mock('~/assets/images/starknet-icon.png', () => 'starknet-test.png', { virtual: true });
jest.mock('~/components/ButtonAlt', () => ({ children, onClick, disabled, className }) => <button className={className} disabled={disabled} onClick={onClick}>{children}</button>, { virtual: true });
jest.mock('~/components/IconButton', () => ({ children, onClick }) => <button onClick={onClick}>{children}</button>, { virtual: true });
jest.mock('~/components/Icons', () => ({ ChevronRightIcon: () => null, CloseIcon: () => null, EthIcon: () => null, UpdateIcon: () => null, WalletIcon: () => null }), { virtual: true });
jest.mock('~/components/DetailsV2', () => ({ children }) => <div>{children}</div>, { virtual: true });
jest.mock('~/hooks/useSession', () => () => ({ accountAddress: '0x123', chainId: 'SN_MAIN' }), { virtual: true });
jest.mock('~/hooks/useWalletPurchasableBalances', () => () => ({ data: {}, refetch: jest.fn() }), { virtual: true });
jest.mock('~/hooks/useWalletTokenBalance', () => ({ useUSDCBalance: () => ({ data: 5000000n, refetch: jest.fn() }) }), { virtual: true });
jest.mock('~/lib/priceUtils', () => ({ TOKEN: { USDC: 'usdc' }, TOKEN_FORMAT: {}, TOKEN_SCALE: { usdc: 1e6 }, TOKEN_FORMATTER: { usdc: () => '0 USDC' } }), { virtual: true });
jest.mock('~/hooks/useStore', () => (selector) => selector({}), { virtual: true });
jest.mock('~/lib/utils', () => ({ nativeBool: Boolean, areChainsEqual: () => false, resolveChainId: () => 'SN_MAIN', fireTrackingEvent: jest.fn() }), { virtual: true });
jest.mock('~/lib/api', () => ({}), { virtual: true });
jest.mock('~/lib/funding', () => ({}), { virtual: true });
jest.mock('./components/EthFaucetButton', () => () => null);

const theme = { colors: { main: '#fff' }, cursors: { active: 'pointer' } };
const renderFunding = (props = {}) => render(<ThemeProvider theme={theme}><FundingFlow onClose={jest.fn()} {...props} /></ThemeProvider>);

beforeEach(() => {
  features.banxa = false;
  features.layerswap = false;
});

test('shows direct funding options without Banxa or Layerswap', () => {
  renderFunding();
  expect(screen.queryByText(/Banxa/)).not.toBeInTheDocument();
  expect(screen.queryByText('Other funding options')).not.toBeInTheDocument();
  expect(screen.queryByText('Layerswap')).not.toBeInTheDocument();
  expect(screen.getByText('AVNU Swaps')).toBeVisible();
  expect(screen.getByText('Stargate Bridge')).toBeVisible();
});

test('shows configured Layerswap directly when Banxa is absent', () => {
  features.layerswap = true;
  renderFunding();
  expect(screen.getByText('Layerswap')).toBeVisible();
});

test('keeps the Banxa CTA and expandable alternatives when configured', () => {
  features.banxa = true;
  features.layerswap = true;
  renderFunding();
  expect(screen.getByText('Add USDC with Banxa')).toBeVisible();
  expect(screen.queryByText('Layerswap')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Other funding options'));
  expect(screen.getByText('Layerswap')).toBeVisible();
});

test('preserves the primary purchase action alongside direct funding options', () => {
  const purchase = jest.fn();
  const close = jest.fn();
  renderFunding({ primaryAction: { label: 'Purchase', onClick: purchase }, onClose: close });
  fireEvent.click(screen.getByText('Purchase'));
  expect(purchase).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
  expect(screen.getByText('AVNU Swaps')).toBeVisible();
});


test('continues the purchase after sufficient funds arrive', () => {
  const funded = jest.fn();
  const close = jest.fn();
  const totalPrice = { clone: () => ({ usdcValue: 5000000, to: () => 5000000 }) };
  renderFunding({ totalPrice, onFunded: funded, onClose: close });
  fireEvent.click(screen.getByText('Continue'));
  expect(funded).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});
