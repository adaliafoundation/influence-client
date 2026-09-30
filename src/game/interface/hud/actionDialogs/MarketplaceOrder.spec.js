const React = require('react');
const { render } = require('@testing-library/react');

jest.mock('@influenceth/sdk', () => ({}));
jest.mock('~/components/Icons', () => ({}), { virtual: true });
jest.mock('~/components/ButtonAlt', () => ({}), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => ({}), { virtual: true });
jest.mock('~/hooks/useLot', () => ({}), { virtual: true });
jest.mock('~/components/ResourceThumbnail', () => ({}), { virtual: true });
jest.mock('~/components/TextInputUncontrolled', () => ({}), { virtual: true });
jest.mock('~/components/MouseoverInfoPane', () => ({}), { virtual: true });
jest.mock('~/hooks/useEntity', () => ({}), { virtual: true });
jest.mock('~/hooks/useHydratedCrew', () => ({}), { virtual: true });
jest.mock('~/hooks/useOrderList', () => ({}), { virtual: true });
jest.mock('~/hooks/useWalletTokenBalance', () => ({}), { virtual: true });
jest.mock('~/lib/formatters', () => ({}), { virtual: true });
jest.mock('~/theme', () => ({}), { virtual: true });
jest.mock('~/lib/priceUtils', () => ({}), { virtual: true });
jest.mock('~/hooks/actionManagers/useMarketplaceManager', () => jest.fn(), { virtual: true });
jest.mock('~/lib/utils', () => ({ reactBool: Boolean }), { virtual: true });
jest.mock('~/lib/actionStages', () => ({ NOT_STARTED: 0, STARTING: 1 }), { virtual: true });
jest.mock('./components', () => ({}));
jest.mock('../ActionDialog', () => ({
  useAsteroidAndLot: jest.fn(),
  ActionDialogInner: jest.fn(() => null)
}));

const { useAsteroidAndLot, ActionDialogInner } = require('../ActionDialog');
const useMarketplaceManager = require('~/hooks/actionManagers/useMarketplaceManager');
const MarketplaceOrder = require('./MarketplaceOrder').default;
const exchange = { id: 42 };
const asteroid = { id: 1 };
const getPendingOrder = jest.fn();
const dialogProps = () => ActionDialogInner.mock.calls.at(-1)[0];

beforeEach(() => {
  jest.clearAllMocks();
  getPendingOrder.mockReturnValue(undefined);
  useMarketplaceManager.mockReturnValue({ getPendingOrder });
});

test('waits for the lot before looking up pending orders, then opens the form', () => {
  const onClose = jest.fn();
  useAsteroidAndLot.mockReturnValue({ isLoading: true });
  const { rerender } = render(<MarketplaceOrder mode="buy" type="market" resourceId={5} onClose={onClose} />);
  expect(useMarketplaceManager).toHaveBeenLastCalledWith(undefined);
  expect(getPendingOrder).not.toHaveBeenCalled();
  expect(dialogProps().isLoading).toBe(true);
  expect(onClose).not.toHaveBeenCalled();

  useAsteroidAndLot.mockReturnValue({ asteroid, lot: { building: exchange }, isLoading: false });
  getPendingOrder.mockReturnValue({ key: 'BulkFillSellOrder' });
  rerender(<MarketplaceOrder mode="buy" type="market" resourceId={5} onClose={onClose} />);
  expect(useMarketplaceManager).toHaveBeenLastCalledWith(42);
  expect(getPendingOrder).toHaveBeenCalledWith('buy', 'market', { exchange, product: 5 });
  expect(dialogProps().isLoading).toBe(false);
  expect(dialogProps().stage).toBe(1);
  expect(dialogProps().children.props.exchange).toBe(exchange);
  expect(onClose).not.toHaveBeenCalled();
});

test.each([
  { asteroid, lot: {} },
  { asteroid },
  { lot: { building: exchange } }
])('closes without exposing the form when required data is unavailable: %p', (data) => {
  const onClose = jest.fn();
  useAsteroidAndLot.mockReturnValue({ ...data, isLoading: false });
  render(<MarketplaceOrder onClose={onClose} />);
  expect(dialogProps().isLoading).toBe(true);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('uses an explicitly supplied exchange', () => {
  useAsteroidAndLot.mockReturnValue({ asteroid, lot: {}, isLoading: false });
  const onClose = jest.fn();
  render(<MarketplaceOrder exchange={exchange} onClose={onClose} />);
  expect(useMarketplaceManager).toHaveBeenLastCalledWith(42);
  expect(dialogProps().isLoading).toBe(false);
  expect(dialogProps().children.props.exchange).toBe(exchange);
  expect(onClose).not.toHaveBeenCalled();
});
