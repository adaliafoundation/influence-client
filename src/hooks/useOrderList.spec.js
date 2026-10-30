const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const { renderHook } = require('@testing-library/react');
jest.mock('./useEntity', () => ({ __esModule: true, default: () => ({ data: undefined }) }));
jest.mock('./useMarketQuery', () => ({ __esModule: true, default: jest.fn(() => ({})) }));
jest.mock('~/lib/api', () => ({ __esModule: true, default: { getOrderList: jest.fn() } }), { virtual: true });
const useMarketQuery = require('./useMarketQuery').default;
const useOrderList = require('./useOrderList').default;
const api = require('~/lib/api').default;
beforeEach(() => jest.clearAllMocks());
test('explicit null selects the marketplace-wide list and subscribes to all products', () => {
  renderHook(() => useOrderList(10, null));
  const [options, scope] = useMarketQuery.mock.calls[0];
  expect(options).toMatchObject({ queryKey: ['orderList', 10, null], enabled: true });
  expect(scope).toMatchObject({ exchangeId: 10, products: [] });
  options.queryFn();
  expect(api.getOrderList).toHaveBeenCalledWith(10, null);
});
test('an unloaded product still disables the product-specific query', () => {
  renderHook(() => useOrderList(10, undefined));
  expect(useMarketQuery.mock.calls[0][0].enabled).toBe(false);
});
test('product-specific queries keep their own cache and subscription scope', () => {
  renderHook(() => useOrderList(10, 7));
  const [options, scope] = useMarketQuery.mock.calls[0];
  expect(options).toMatchObject({ queryKey: ['orderList', 10, 7], enabled: true });
  expect(scope.products).toEqual([7]);
});
