const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const React = require('react');
const { renderHook } = require('@testing-library/react');
const { Entity } = require('@influenceth/sdk');
jest.mock('~/contexts/ChainTransactionContext', () => ({ __esModule: true, default: require('react').createContext() }), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('~/hooks/useFailureReporter', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('../useEntity', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('../useHydratedCrew', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('~/lib/api', () => ({ __esModule: true, default: { getEntities: jest.fn() } }), { virtual: true });
jest.mock('~/lib/orderCancellation', () => jest.requireActual('../../lib/orderCancellation'), { virtual: true });
jest.mock('~/lib/priceUtils', () => ({ TOKEN: { SWAY: 'sway' }, TOKEN_SCALE: { sway: 1e6 } }), { virtual: true });
const Context = require('~/contexts/ChainTransactionContext').default;
const useCrewContext = require('~/hooks/useCrewContext').default;
const api = require('~/lib/api').default;
const useMarketplaceManager = require('./useMarketplaceManager').default;
const crew = { label: Entity.IDS.CREW, id: 1, Crew: { delegatedTo: '0x111' } };
const buyer = { label: Entity.IDS.CREW, id: 2 };
const storage = { label: Entity.IDS.BUILDING, id: 3 };
const exchange = { label: Entity.IDS.BUILDING, id: 4, Control: { controller: { id: 5 } } };
let execute, reportBlocked, recheckAuthorization, recheckActingCrew;
const wrapper = ({ children }) => <Context.Provider value={{ execute }}>{children}</Context.Provider>;
const params = { amount: 101, buyer, product: 1, price: 0.000001, destination: storage, destinationSlot: 2, initialCaller: '0x222', makerFee: 100 };
beforeEach(() => {
  jest.clearAllMocks();
  execute = jest.fn();
  reportBlocked = jest.fn();
  recheckAuthorization = jest.fn(async () => ({ status: 'allowed' }));
  recheckActingCrew = jest.fn(async () => ({ status: 'allowed' }));
  useCrewContext.mockReturnValue({ crew, pendingTransactions: [], authorize: () => ({ status: 'allowed' }), recheckAuthorization, recheckActingCrew });
  require('~/hooks/useFailureReporter').default.mockReturnValue(reportBlocked);
  require('../useEntity').default.mockReturnValue({ data: exchange });
  require('../useHydratedCrew').default.mockReturnValue({ data: { Crew: { delegatedTo: '0x555' } } });
  api.getEntities.mockResolvedValue([{ ...buyer, Crew: { delegatedTo: '0x333' } }]);
});
test('admin cancellation preserves the buyer and deposit identity and refunds the buyer current delegate', async () => {
  const { result } = renderHook(() => useMarketplaceManager(exchange.id), { wrapper });
  await result.current.cancelBuyOrder(params);
  expect(execute).toHaveBeenCalledWith('EscrowWithdrawalAndFillBuyOrders', [expect.objectContaining({
    buyer_crew: buyer, caller_crew: { id: crew.id, label: crew.label },
    depositCaller: '0x222', seller_account: '0x333', isCancellation: true,
    payments: { toExchange: 0, toPlayer: 102 }, amount: 0, storage, storage_slot: 2
  })], expect.anything());
  expect(recheckActingCrew).toHaveBeenCalledWith({ requireReady: false });
});
test('marketplace admin can cancel when it does not control storage', async () => {
  recheckAuthorization.mockImplementation(async (_, [, target]) => ({ status: target.id === exchange.id ? 'allowed' : 'denied' }));
  const { result } = renderHook(() => useMarketplaceManager(exchange.id), { wrapper });
  await result.current.cancelSellOrder({ amount: 10, seller: buyer, product: 1, price: 2, origin: storage, originSlot: 2 });
  expect(execute).toHaveBeenCalledWith('CancelSellOrder', expect.objectContaining({ seller_crew: buyer, caller_crew: { id: crew.id, label: crew.label }, storage }), expect.anything());
});
test('revoked control blocks submission after the dialog was opened', async () => {
  recheckAuthorization.mockResolvedValue({ status: 'denied' });
  const { result } = renderHook(() => useMarketplaceManager(exchange.id), { wrapper });
  await result.current.cancelBuyOrder(params);
  expect(execute).not.toHaveBeenCalled();
  expect(reportBlocked).toHaveBeenCalledWith({ status: 'denied' });
});
test('missing buyer delegate cannot redirect a refund to the acting crew', async () => {
  api.getEntities.mockResolvedValue([]);
  const { result } = renderHook(() => useMarketplaceManager(exchange.id), { wrapper });
  await expect(result.current.cancelBuyOrder(params)).rejects.toThrow('buyer refund account');
  expect(execute).not.toHaveBeenCalled();
});
