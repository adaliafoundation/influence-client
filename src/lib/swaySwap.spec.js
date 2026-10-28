import { quoteToCalls } from '@avnu/avnu-sdk';
import api from '~/lib/api';
import { assertSwapCurrent, formatSwapAmount, parseSlippageBps, parseUsdcAmount, prepareSwaySwap } from './swaySwap';

jest.mock('@avnu/avnu-sdk', () => ({
  quoteToCalls: jest.fn(),
  calculateMinReceivedAmount: (amount, slippage) => amount - amount * BigInt(Math.round(slippage * 10000)) / 10000n
}));
jest.mock('@influenceth/sdk', () => ({ Address: { areEqual: (a, b) => a === b } }));
jest.mock('~/appConfig', () => ({ appConfig: { get: () => 'https://avnu.test' } }), { virtual: true });
jest.mock('~/lib/api', () => ({ getSwapQuote: jest.fn() }), { virtual: true });
jest.mock('~/lib/priceUtils', () => ({ TOKEN: { USDC: 'usdc', SWAY: 'sway' } }), { virtual: true });
jest.mock('~/lib/utils', () => ({ areChainsEqual: (a, b) => a === b }), { virtual: true });

const request = { accountAddress: 'account', chainId: 'chain', amount: 5000000n, slippageBps: 100 };
let quote;
beforeEach(() => {
  jest.clearAllMocks();
  quote = { quoteId: 'quote', chainId: 'chain', sellTokenAddress: 'usdc', buyTokenAddress: 'sway', sellAmount: 5000000n, buyAmount: 123456789n };
  api.getSwapQuote.mockResolvedValue([quote]);
  quoteToCalls.mockResolvedValue({ calls: [{ contractAddress: 'router', entrypoint: 'swap', calldata: ['5'] }] });
});

test('parses input without floating point rounding', () => {
  expect(parseUsdcAmount('9007199254740993.000001')).toBe(9007199254740993000001n);
  expect(formatSwapAmount(parseUsdcAmount('5.123456'))).toBe('5.123456');
  for (const value of ['', '0', '-1', '1e6', '1.1234567', 'Infinity']) expect(parseUsdcAmount(value)).toBeNull();
  expect(parseSlippageBps('0.29')).toBe(29);
  expect(parseSlippageBps('5.01')).toBeNull();
});

test('builds only the selected USDC to SWAY quote with explicit slippage', async () => {
  const swap = await prepareSwaySwap(request);
  expect(api.getSwapQuote).toHaveBeenCalledWith({ sellToken: 'usdc', buyToken: 'sway', amount: 5000000n, account: 'account' });
  expect(quoteToCalls).toHaveBeenCalledWith({ quoteId: 'quote', takerAddress: 'account', slippage: 0.01, executeApprove: true }, { baseUrl: 'https://avnu.test' });
  expect(swap.minimumReceived).toBe(122222222n);
  expect(swap.calls).toHaveLength(1);
});

test.each([
  { sellTokenAddress: 'eth' }, { buyTokenAddress: 'usdc' }, { sellAmount: 6000000n }, { chainId: 'other' }
])('rejects mismatched quote %s before building calls', async change => {
  Object.assign(quote, change);
  await expect(prepareSwaySwap(request)).rejects.toThrow('does not match');
  expect(quoteToCalls).not.toHaveBeenCalled();
});

test('rejects empty liquidity and expired quotes', async () => {
  api.getSwapQuote.mockResolvedValueOnce([]);
  await expect(prepareSwaySwap(request)).rejects.toThrow('No swap liquidity');
  quote.expiry = Math.floor(Date.now() / 1000) - 1;
  await expect(prepareSwaySwap(request)).rejects.toThrow('expired');
});

test('approval cannot survive expiry or wallet/network changes', () => {
  const swap = { ...request, expiresAt: 1000 };
  expect(() => assertSwapCurrent(swap, request, 999)).not.toThrow();
  expect(() => assertSwapCurrent(swap, request, 1000)).toThrow('expired');
  expect(() => assertSwapCurrent(swap, { ...request, accountAddress: 'other' }, 999)).toThrow('changed');
  expect(() => assertSwapCurrent(swap, { ...request, chainId: 'other' }, 999)).toThrow('changed');
});
