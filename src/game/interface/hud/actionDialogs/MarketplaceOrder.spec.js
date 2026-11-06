const React = require('react');
const { render } = require('@testing-library/react');

jest.mock('@influenceth/sdk', () => ({
  Asteroid: { getLotDistance: () => 0, getLotTravelTimeReal: () => 0 },
  Crewmate: { ABILITY_IDS: {
    HOPPER_TRANSPORT_TIME: 'HOPPER_TRANSPORT_TIME',
    FREE_TRANSPORT_DISTANCE: 'FREE_TRANSPORT_DISTANCE',
    MARKETPLACE_FEE_REDUCTION: 'MARKETPLACE_FEE_REDUCTION',
    MARKETPLACE_FEE_ENFORCEMENT: 'MARKETPLACE_FEE_ENFORCEMENT'
  } },
  Inventory: { getType: () => ({}) },
  Lot: { toIndex: () => 0 },
  Order: {
    IDS: { LIMIT_BUY: 'LIMIT_BUY', LIMIT_SELL: 'LIMIT_SELL' },
    FEE_SCALE: 1,
    adjustedFee: () => 0
  },
  Permission: { IDS: { LIMIT_BUY: 1, LIMIT_SELL: 2, BUY: 3, SELL: 4 } },
  Product: { TYPES: { 5: { isAtomic: true, name: 'Product', massPerUnit: 1, volumePerUnit: 1 } } }
}));
jest.mock('~/components/Icons', () => {
  const Icon = () => null;
  return {
    InventoryIcon: Icon,
    SwayIcon: Icon,
    MarketBuyIcon: Icon,
    MarketSellIcon: Icon,
    LimitBuyIcon: Icon,
    LimitSellIcon: Icon,
    CancelLimitOrderIcon: Icon,
    LocationIcon: Icon,
    CloseIcon: Icon
  };
}, { virtual: true });
jest.mock('~/components/ButtonAlt', () => ({ __esModule: true, default: () => null }), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useLot', () => jest.fn(), { virtual: true });
jest.mock('~/components/ResourceThumbnail', () => ({ __esModule: true, default: () => null }), { virtual: true });
jest.mock('~/components/TextInputUncontrolled', () => ({
  __esModule: true,
  default: () => null,
  TextInputWrapper: () => null
}), { virtual: true });
jest.mock('~/components/MouseoverInfoPane', () => ({ __esModule: true, default: () => null }), { virtual: true });
jest.mock('~/hooks/useEntity', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useHydratedCrew', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useOrderList', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useWalletTokenBalance', () => ({ useSwayBalance: jest.fn() }), { virtual: true });
jest.mock('~/lib/formatters', () => ({ __esModule: true, default: { lotName: () => '' } }), { virtual: true });
jest.mock('~/theme', () => ({
  __esModule: true,
  default: { colors: { disabledBackground: '#000000', error: '#ff0000' } },
  hexToRGB: () => '0, 0, 0'
}), { virtual: true });
jest.mock('~/lib/priceUtils', () => ({
  TOKEN: { SWAY: 'SWAY' },
  TOKEN_SCALE: { SWAY: 1e6 }
}), { virtual: true });
jest.mock('~/hooks/actionManagers/useMarketplaceManager', () => jest.fn(), { virtual: true });
jest.mock('~/lib/utils', () => ({
  reactBool: Boolean,
  formatFixed: value => String(value ?? 0),
  formatTimer: value => String(value ?? 0),
  getCrewAbilityBonuses: () => ({}),
  locationsArrToObj: () => ({}),
  ordersToFills: jest.fn(() => []),
  safeBigInt: value => BigInt(value || 0)
}), { virtual: true });
jest.mock('~/lib/actionStages', () => ({ NOT_STARTED: 0, STARTING: 1 }), { virtual: true });
jest.mock('./components', () => {
  const EmptyComponent = () => null;
  return {
    ActionDialogFooter: jest.fn(() => null),
    ActionDialogHeader: EmptyComponent,
    ActionDialogStats: EmptyComponent,
    ActionDialogBody: EmptyComponent,
    FlexSection: EmptyComponent,
    FlexSectionInputBlock: EmptyComponent,
    FlexSectionSpacer: EmptyComponent,
    FlexSectionBlock: EmptyComponent,
    formatResourceMass: () => '',
    formatResourceVolume: () => '',
    getBonusDirection: () => 0,
    MouseoverContent: EmptyComponent,
    LotInputBlock: EmptyComponent,
    InventorySelectionDialog: EmptyComponent,
    InventoryInputBlock: EmptyComponent,
    TransferDistanceDetails: EmptyComponent,
    TimeBonusTooltip: EmptyComponent,
    getTripDetails: () => ({ totalTime: 0 }),
    FeeBonusTooltip: EmptyComponent,
    formatResourceAmount: () => '',
    formatTimeRequirements: () => ({})
  };
});
jest.mock('../ActionDialog', () => ({
  useAsteroidAndLot: jest.fn(),
  ActionDialogInner: jest.fn(() => null)
}));

const { useAsteroidAndLot, ActionDialogInner } = require('../ActionDialog');
const useMarketplaceManager = require('~/hooks/actionManagers/useMarketplaceManager');
const useCrewContext = require('~/hooks/useCrewContext');
const useLot = require('~/hooks/useLot');
const useEntity = require('~/hooks/useEntity');
const useHydratedCrew = require('~/hooks/useHydratedCrew');
const useOrderList = require('~/hooks/useOrderList');
const { useSwayBalance } = require('~/hooks/useWalletTokenBalance');
const { ActionDialogFooter } = require('./components');
const utils = require('~/lib/utils');
const marketplaceOrderModule = require('./MarketplaceOrder');
const MarketplaceOrder = marketplaceOrderModule.default;
const { hasMatchingBuyOrder } = marketplaceOrderModule;
const exchange = { id: 42, Exchange: { makerFee: 0, takerFee: 0 }, Control: { controller: { id: 99 } } };
const asteroid = { id: 1 };
const getPendingOrder = jest.fn();
const dialogProps = () => ActionDialogInner.mock.calls.at(-1)[0];
const footerProps = () => ActionDialogFooter.mock.calls.at(-1)[0];

beforeEach(() => {
  jest.clearAllMocks();
  getPendingOrder.mockReturnValue(undefined);
  useMarketplaceManager.mockReturnValue({ getPendingOrder });
  useCrewContext.mockReturnValue({ crew: { id: 7, label: 'Crew' }, crewCan: () => true });
  useLot.mockReturnValue({ data: undefined });
  useEntity.mockReturnValue({ data: undefined });
  useHydratedCrew.mockReturnValue({ data: undefined });
  useOrderList.mockReturnValue({ data: [], refetch: jest.fn() });
  useSwayBalance.mockReturnValue({ data: 100_000_000 });
  utils.ordersToFills.mockReturnValue([]);
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

const openBuyOrder = {
  orderType: 'LIMIT_BUY',
  crew: { id: 7 },
  entity: { id: 42 },
  product: 5,
  price: 1.234567,
  storage: { id: 11 },
  storageSlot: 2,
  amount: 10
};
const buyOrderKey = {
  buyerCrewId: 7,
  exchangeId: 42,
  productId: 5,
  price: '1.2345674',
  storageId: 11,
  storageSlot: 2
};

test('matches a buy order with the same key at SWAY precision, regardless of amount', () => {
  expect(hasMatchingBuyOrder([{ ...openBuyOrder, amount: 100 }], buyOrderKey)).toBe(true);
});

test.each([
  ['buyer crew', { buyerCrewId: 8 }],
  ['exchange', { exchangeId: 43 }],
  ['product', { productId: 6 }],
  ['price', { price: 1.2345684 }],
  ['storage', { storageId: 12 }],
  ['storage slot', { storageSlot: 3 }]
])('does not match when the %s differs', (_field, keyChange) => {
  expect(hasMatchingBuyOrder([openBuyOrder], { ...buyOrderKey, ...keyChange })).toBe(false);
});

const renderOrderForm = ({
  mode = 'buy',
  type = 'limit',
  orders = [openBuyOrder],
  isCancellation = false,
  storageId = 11,
  storageSlot = 2,
  price = buyOrderKey.price
} = {}) => {
  const crew = { id: 7, label: 'Crew' };
  const storage = {
    id: storageId,
    label: `Storage ${storageId}`,
    Inventories: [{ slot: storageSlot, contents: [{ product: 5, amount: 100 }] }],
    Location: { locations: [] }
  };
  const lot = { id: 10, building: exchange };
  const manager = {
    getPendingOrder,
    createBuyOrder: jest.fn(),
    createSellOrder: jest.fn(),
    cancelBuyOrder: jest.fn(),
    cancelSellOrder: jest.fn(),
    fillBuyOrders: jest.fn(),
    fillSellOrders: jest.fn()
  };

  useAsteroidAndLot.mockReturnValue({ asteroid, lot, isLoading: false });
  useMarketplaceManager.mockReturnValue(manager);
  useCrewContext.mockReturnValue({ crew, crewCan: () => true });
  useLot.mockReturnValue({ data: undefined });
  useEntity.mockReturnValue({ data: storage });
  useHydratedCrew.mockImplementation((id) => ({ data: id === crew.id ? crew : undefined }));
  useOrderList.mockReturnValue({ data: orders, refetch: jest.fn() });
  useSwayBalance.mockReturnValue({ data: 100_000_000 });

  render(
    <MarketplaceOrder
      mode={mode}
      type={type}
      resourceId={5}
      isCancellation={isCancellation}
      cancellationInitialCaller="0xabc"
      cancellationMakerFee={0}
      preselect={{
        crew: isCancellation ? crew : undefined,
        limitPrice: price,
        quantity: 5,
        storage: { id: storageId, label: storage.label },
        storageSlot
      }}
    />
  );
  return render(dialogProps().children);
};

test('passes the duplicate reason to the disabled limit-buy action without rendering it inline', () => {
  const { queryByRole } = renderOrderForm();
  const { disabled, disabledReason } = footerProps();

  expect(queryByRole('status')).toBeNull();
  expect(disabledReason).toBe('order already exists');
  expect(disabled).toBe(true);
});

test('allows a limit buy to a different storage', () => {
  const { queryByRole } = renderOrderForm({ storageId: 12 });

  expect(queryByRole('status')).toBeNull();
  expect(footerProps().disabledReason).toBeUndefined();
  expect(footerProps().disabled).toBe(false);
});

test.each([
  ['market buy', 'buy', [openBuyOrder, { orderType: 'LIMIT_SELL', product: 5, amount: 10, price: 2 }]],
  ['market sell', 'sell', [openBuyOrder]]
])('does not apply the duplicate guard to %s', (_label, mode, orders) => {
  utils.ordersToFills.mockReturnValue([{ fillValue: 10 }]);
  const { queryByRole } = renderOrderForm({ mode, type: 'market', orders });

  expect(queryByRole('status')).toBeNull();
  expect(footerProps().disabledReason).toBeUndefined();
  expect(footerProps().disabled).toBe(false);
});

test('does not apply the duplicate guard to limit sells', () => {
  const { queryByRole } = renderOrderForm({
    mode: 'sell',
    orders: [{ ...openBuyOrder, price: 0.5 }, openBuyOrder]
  });

  expect(queryByRole('status')).toBeNull();
  expect(footerProps().disabledReason).toBeUndefined();
  expect(footerProps().disabled).toBe(false);
});

test('does not apply the duplicate guard to buy-order cancellations', () => {
  const { queryByRole } = renderOrderForm({ isCancellation: true });

  expect(queryByRole('status')).toBeNull();
  expect(footerProps().disabledReason).toBeUndefined();
  expect(footerProps().disabled).toBe(false);
});
