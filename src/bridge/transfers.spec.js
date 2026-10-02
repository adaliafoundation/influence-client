import {
  LOCAL_BRIDGE_TRANSFER_TTL, isBridgeTransferIndexed, isBridgeTransferInScope,
  pruneBridgeTransfers, sameBridgeAddress
} from './transfers';
import { selectPersistedState } from '../lib/storePersistence';

const now = 1800000000000;
const transfer = {
  id: '0x123', txHash: '0x123', createdAt: now, network: '1:SN_MAIN',
  assetType: 'asteroids', assetIds: [141, 178689], direction: 'l1_to_l2',
  fromAddress: '0xa', toAddress: '0xb', status: 'waiting_l2'
};
const scope = { network: '1:SN_MAIN', ethereumAddress: '0x000A', starknetAddress: '0x000B' };
const crossing = {
  ...transfer, eventTimestamp: now / 1000, status: 'PROCESSING'
};
const completedAsset = (id) => ({
  id, Nft: { bridge: { status: 'COMPLETE', destination: 'STARKNET' }, owners: { starknet: '0xb' } }
});

test('cleans legacy, terminal and expired records for every wallet while preserving recent scoped records', () => {
  const legacy = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [i, { ...transfer, network: undefined }]));
  const records = {
    ...legacy,
    recent: transfer,
    otherWallet: { ...transfer, fromAddress: '0xc' },
    expired: { ...transfer, createdAt: now - LOCAL_BRIDGE_TRANSFER_TTL },
    complete: { ...transfer, status: 'COMPLETE' },
    failed: { ...transfer, status: 'failed' },
    invalid: { ...transfer, createdAt: undefined }
  };
  expect(pruneBridgeTransfers(records, now)).toEqual({ recent: transfer, otherWallet: records.otherWallet });
  expect(Object.keys(records)).toHaveLength(1006);
});

test('persistence filters old placeholders on both hydration and subsequent saves', () => {
  jest.spyOn(Date, 'now').mockReturnValue(now);
  const state = { sounds: { volume: 0.5 }, bridgeTransfers: { legacy: { ...transfer, network: undefined }, current: transfer } };
  const cleaned = selectPersistedState(state);
  expect(cleaned).toEqual({ sounds: state.sounds, bridgeTransfers: { current: transfer } });
  expect(selectPersistedState(JSON.parse(JSON.stringify(cleaned)))).toEqual(cleaned);
  Date.now.mockRestore();
});

test('scopes local transfers by both wallets and network, normalizing padded hex addresses', () => {
  expect(isBridgeTransferInScope(transfer, scope)).toBe(true);
  for (const change of [{ ethereumAddress: '0xc' }, { starknetAddress: '0xc' }, { network: '11155111:SN_SEPOLIA' }, { starknetAddress: undefined }]) {
    expect(isBridgeTransferInScope(transfer, { ...scope, ...change })).toBe(false);
  }
  const outgoing = { ...transfer, direction: 'l2_to_l1', fromAddress: '0xb', toAddress: '0xa' };
  expect(isBridgeTransferInScope(outgoing, scope)).toBe(true);
  expect(isBridgeTransferInScope({ ...outgoing, direction: 'receive_l1' }, scope)).toBe(true);
  expect(sameBridgeAddress(undefined, undefined)).toBe(false);
});

test('empty API responses and partial indexing never retire a whole batch', () => {
  expect(isBridgeTransferIndexed(transfer, [])).toBe(false);
  expect(isBridgeTransferIndexed(transfer, [{ ...crossing, assetIds: [141] }])).toBe(false);
  expect(isBridgeTransferIndexed(transfer, [], [completedAsset(141)])).toBe(false);
  expect(isBridgeTransferIndexed(transfer, [], transfer.assetIds.map(completedAsset))).toBe(true);
});

test('recognizes active and completed crossings but rejects previous trips, other assets and recipients', () => {
  expect(isBridgeTransferIndexed(transfer, [crossing])).toBe(true);
  expect(isBridgeTransferIndexed(transfer, [{ ...crossing, status: 'COMPLETE' }])).toBe(true);
  for (const change of [
    { eventTimestamp: now / 1000 - 60 }, { direction: 'l2_to_l1' }, { assetType: 'ships' }, { toAddress: '0xc' }
  ]) {
    expect(isBridgeTransferIndexed(transfer, [{ ...crossing, ...change }])).toBe(false);
  }
});

test('a ready withdrawal does not mean its Ethereum finalization transaction has been indexed', () => {
  const receive = { ...transfer, direction: 'receive_l1' };
  expect(isBridgeTransferIndexed(receive, [{ ...crossing, direction: 'l2_to_l1' }])).toBe(false);
  expect(isBridgeTransferIndexed(receive, [{ ...crossing, direction: 'l2_to_l1', status: 'COMPLETE' }])).toBe(true);
});

test('SWAY reconciliation uses transaction events, not a repeated amount or zero ready count', () => {
  const sway = { ...transfer, assetType: 'sway', amount: '10' };
  expect(isBridgeTransferIndexed(sway, [{ amount: '10', readyCount: 0, events: [{ transactionHash: '0x999' }] }])).toBe(false);
  expect(isBridgeTransferIndexed(sway, [{ readyCount: 0, events: [{ transactionHash: '0x000123' }] }])).toBe(true);
});
