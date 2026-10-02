import { getPendingSwayAmounts, isSwayDepositComplete } from './sway';

const outgoing = { txHash: '0x123', direction: 'l1_to_l2', amount: '12.345678', fromAddress: '0xa', toAddress: '0xb', status: 'waiting_l2' };
const withdrawal = { id: 'withdrawal', amount: '0x989680', fromAddress: '0xb', toAddress: '0xa', pendingCount: 1, readyCount: 1 };

test('local deposits immediately show equal outgoing and incoming amounts without changing balances', () => {
  expect(getPendingSwayAmounts([outgoing], '0xa', '0xb')).toEqual({
    ethereum: { incoming: 0n, outgoing: 12345678n }, starknet: { incoming: 12345678n, outgoing: 0n }
  });
});

test('indexed withdrawals include pending and ready counts and exclude already finalized messages', () => {
  const totals = getPendingSwayAmounts([withdrawal], '0xa', '0xb', ['withdrawal:ready:0']);
  expect(totals.ethereum.incoming).toBe(10000000n);
  expect(totals.starknet.outgoing).toBe(10000000n);
});

test('opposing transfers remain visible instead of cancelling each other out', () => {
  const totals = getPendingSwayAmounts([outgoing, withdrawal], '0xa', '0xb');
  expect(totals.ethereum).toEqual({ incoming: 20000000n, outgoing: 12345678n });
});

test('completed, failed and finalization transactions do not create pending deltas', () => {
  const totals = getPendingSwayAmounts([
    { ...outgoing, status: 'COMPLETE' }, { ...outgoing, status: 'failed' },
    { ...outgoing, direction: 'receive_l1' }, { ...withdrawal, pendingCount: 0, readyCount: 0 }
  ], '0xa', '0xb');
  expect(totals.ethereum).toEqual({ incoming: 0n, outgoing: 0n });
  expect(totals.starknet).toEqual({ incoming: 0n, outgoing: 0n });
});

test('each indicator belongs to its connected wallet, including padded addresses', () => {
  const totals = getPendingSwayAmounts([withdrawal], '0x000a', '0xc');
  expect(totals.ethereum.incoming).toBe(20000000n);
  expect(totals.starknet.outgoing).toBe(0n);
});

test('only successful accepted L1 messages clear the deposit indicators', () => {
  expect(isSwayDepositComplete([])).toBeFalsy();
  expect(isSwayDepositComplete([{ execution_status: 'REVERTED', finality_status: 'ACCEPTED_ON_L2' }])).toBe(false);
  expect(isSwayDepositComplete([{ execution_status: 'SUCCEEDED', finality_status: 'RECEIVED' }])).toBe(false);
  expect(isSwayDepositComplete([{ execution_status: 'SUCCEEDED', finality_status: 'ACCEPTED_ON_L1' }])).toBe(true);
});

jest.mock('viem', () => {
  global.TextEncoder = require('util').TextEncoder;
  global.TextDecoder = require('util').TextDecoder;
  return jest.requireActual('viem');
});
