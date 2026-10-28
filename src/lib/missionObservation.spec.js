const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const { Entity, System, MissionObservation } = require('@influenceth/sdk');
const { hash } = require('starknet');
const { getObservationRequest, observeNativeMissionCall } = require('./missionObservation');

const entity = (label, id) => ({ label, id });
const crew = entity(Entity.IDS.CREW, '501');
const exchange = entity(Entity.IDS.BUILDING, '100');
const colony = { campaign: '123', subject: entity(Entity.IDS.ASTEROID, '99'), mission: 3 };
const candidates = [colony, { ...colony, mission: 4 }];
const dispatcher = '0x123', account = '0xabc', escrowAddress = '0x456', token = '0x789';
const sell = { seller_crew: entity(Entity.IDS.CREW, '900'), exchange, product: 1, amount: 3, price: 5,
  storage: exchange, storage_slot: 2, destination: entity(Entity.IDS.BUILDING, '101'), destination_slot: 2, caller_crew: crew };
const api = () => ({ getMissionObservationCandidates: jest.fn().mockResolvedValue({ candidates }),
  getStarterMissions: jest.fn(), getMissionBinding: jest.fn(), getEntityById: jest.fn() });
const direct = (system, vars, service) => {
  const call = System.getRunSystemCall(system, vars, dispatcher);
  return observeNativeMissionCall({ system, vars, call, dispatcher, account, api: service });
};

test('a third-party sell fill observes the exchange colony without requiring ownership or starter eligibility', async () => {
  const service = api();
  const result = await direct('FillSellOrder', sell, service);
  expect(service.getMissionObservationCandidates).toHaveBeenCalledWith({
    system: 'FillSellOrder', targetUuid: String(Entity.packEntity(exchange)), crewId: '501'
  });
  expect(service.getStarterMissions).not.toHaveBeenCalled();
  const [begin, native, end] = result.calls;
  expect(native).toEqual(System.getRunSystemCall('FillSellOrder', sell, dispatcher));
  expect(begin.entrypoint).toBe('begin_observation');
  expect(begin.calldata.slice(2, 5)).toEqual([
    hash.computePoseidonHashOnElements(native.calldata.slice(2)), BigInt(account).toString(), '2'
  ]);
  expect(begin.calldata.slice(5)).toEqual(['123', (BigInt(Entity.packEntity(colony.subject)) + (24n << 80n)).toString()]);
  expect(end.entrypoint).toBe('end_observation');
});

test.each([1, 30])('Escrow buy fill of %s units preserves its stored hook and hashes actual callback fields', async amount => {
  const service = api();
  const vars = { buyer_crew: entity(Entity.IDS.CREW, '900'), exchange, product: 1, price: 5,
    storage: exchange, storage_slot: 2, amount, origin: entity(Entity.IDS.BUILDING, '101'), origin_slot: 2, caller_crew: crew };
  const hook = System.getRunSystemCall('FillBuyOrder', vars, dispatcher,
    ['buyer_crew', 'exchange', 'product', 'price', 'storage', 'storage_slot']);
  hook.entrypoint = hash.getSelectorFromName(hook.entrypoint);
  hook.calldata[1] = '25';
  const data = System.formatSystemCalldata('FillBuyOrder', vars, ['amount', 'origin', 'origin_slot', 'caller_crew']);
  const withdrawals = [{ recipient: account, amount: 2n ** 130n }, { recipient: '0xdef', amount: 7n }];
  const call = System.getEscrowWithdrawCall(withdrawals, '0x111', hook, data, escrowAddress, token);
  const before = JSON.stringify(call);
  const result = await observeNativeMissionCall({ system: 'FillBuyOrder', vars, call, dispatcher, account, api: service,
    escrow: { hook, data, withdrawals, address: escrowAddress, token } });
  const [begin, native, end] = result.calls;
  const fullArgs = [...hook.calldata.slice(2), ...data, account, 2, token, 2,
    account, 0, 4, '0xdef', 7, 0];
  expect(begin.calldata[2]).toBe(hash.computePoseidonHashOnElements(fullArgs));
  expect(begin.calldata[3]).toBe(BigInt(escrowAddress).toString());
  expect(begin.calldata.slice(5)).toEqual(MissionObservation.encodeMissionTargets(candidates));
  expect(native).toBe(call);
  expect(JSON.stringify(native)).toBe(before);
  expect(end.entrypoint).toBe('end_observation');
  expect(service.getStarterMissions).not.toHaveBeenCalled();
});

test('each fill has a sequential observation group, with its own target and arguments', async () => {
  const service = api();
  service.getMissionObservationCandidates.mockResolvedValueOnce({ candidates }).mockResolvedValueOnce({ candidates: [{ ...colony, subject: { ...colony.subject, id: '1000' } }] });
  const a = await direct('FillSellOrder', sell, service);
  const b = await direct('FillSellOrder', { ...sell, exchange: { ...exchange, id: '110' }, amount: 8 }, service);
  expect([...a.calls, ...b.calls].map(c => c.entrypoint)).toEqual([
    'begin_observation', 'run_system', 'end_observation', 'begin_observation', 'run_system', 'end_observation'
  ]);
  expect(a.calls[0].calldata[2]).not.toBe(b.calls[0].calldata[2]);
  expect(a.calls[0].calldata[6]).not.toBe(b.calls[0].calldata[6]);
});

test('a fill can credit starter storage and another player’s colony in the same native invocation', async () => {
  const service = api();
  const starter = { campaign: '321', subject: crew, mission: 3 };
  service.getMissionObservationCandidates.mockResolvedValue({ candidates: [starter, { ...starter, mission: 7 }, ...candidates] });
  service.getStarterMissions.mockResolvedValue({ active: true, eligible: true, campaign: '321', missions: [{ accepted: true }] });
  const result = await direct('FillSellOrder', sell, service);
  expect(result.calls[0].calldata.slice(5)).toEqual(MissionObservation.encodeMissionTargets([starter, { ...starter, mission: 7 }, ...candidates]));
});

test('cancellation and unrelated actions stay native and do not request evidence', async () => {
  const service = api();
  expect(getObservationRequest('FillBuyOrder', { ...sell, isCancellation: true })).toBeNull();
  expect(getObservationRequest('CreateSellOrder', sell)).toBeNull();
  expect(getObservationRequest('DockShip', { target: entity(Entity.IDS.LOT, 2) })).toBeNull();
  expect(getObservationRequest('ResupplyFood', { origin: entity(Entity.IDS.BUILDING, 0) })).toBeNull();
  const call = { contractAddress: escrowAddress, entrypoint: 'withdraw', calldata: [] };
  const result = await observeNativeMissionCall({ system: 'FillBuyOrder', vars: { ...sell, isCancellation: true }, call, dispatcher, account, api: service });
  expect(result.calls).toEqual([call]);
  expect(service.getMissionObservationCandidates).not.toHaveBeenCalled();
});

test('candidate lookup failure blocks preparation instead of silently losing another player’s evidence', async () => {
  const service = api();
  service.getMissionObservationCandidates.mockRejectedValue(new Error('offline'));
  await expect(direct('FillSellOrder', sell, service)).rejects.toThrow('offline');
});

test('no active candidates preserves the native call', async () => {
  const service = api();
  service.getMissionObservationCandidates.mockResolvedValue({ candidates: [] });
  expect((await direct('FillSellOrder', sell, service)).calls).toEqual([System.getRunSystemCall('FillSellOrder', sell, dispatcher)]);
});

test.each([
  ['ScanSurfaceStart', { asteroid: colony.subject }], ['ScanSurfaceFinish', { asteroid: colony.subject }],
  ['ConstructionStart', { building: exchange }], ['ConstructionFinish', { building: exchange }],
  ['StationCrew', { destination: exchange }], ['DockShip', { target: exchange, powered: true }]
])('%s preserves native caller and observes target candidates before individual branch acceptance', async (system, vars) => {
  const service = api();
  const result = await direct(system, { ...vars, caller_crew: crew }, service);
  expect(result.calls[1]).toEqual(System.getRunSystemCall(system, { ...vars, caller_crew: crew }, dispatcher));
  expect(result.candidates).toEqual(candidates);
});

// These bindings represent work already started before the observer cutover.
// Finishing it must reuse the existing campaign/crew scope and native arguments.
test.each([
  ['ConstructionFinish', { building: exchange }, [{ kind: 'Built', entity: exchange }]],
  ['SampleDepositFinish', { deposit: entity(Entity.IDS.DEPOSIT, '102') },
    [{ kind: 'Sample', entity: entity(Entity.IDS.DEPOSIT, '102') }]],
  ['ExtractResourceFinish', { extractor: exchange, extractor_slot: 1 },
    [{ kind: 'Built', entity: exchange }, { kind: 'Extraction', entity: exchange, slot: 1 }]],
  ['ProcessProductsFinish', { processor: exchange, processor_slot: 2 },
    [{ kind: 'Built', entity: exchange }, { kind: 'Process', entity: exchange, slot: 2 }]],
  ['ReceiveDelivery', { delivery: entity(Entity.IDS.DELIVERY, '103') },
    [{ kind: 'Delivery', entity: entity(Entity.IDS.DELIVERY, '103') }]]
])('%s finishes previously bound starter work through the observer without restarting or accepting again', async (system, args, bindings) => {
  const { Building } = require('@influenceth/sdk');
  const service = api();
  const starter = { campaign: '321', subject: crew, mission: 0 };
  service.getMissionObservationCandidates.mockResolvedValue({ candidates: [starter] });
  service.getStarterMissions.mockResolvedValue({ active: true, eligible: true, campaign: '321', missions: [{ accepted: true }] });
  service.getMissionBinding.mockResolvedValue({ status: 'matched' });
  service.getEntityById.mockResolvedValue({ Control: { controller: crew }, Building: { status: Building.CONSTRUCTION_STATUSES.OPERATIONAL } });
  const vars = { ...args, caller_crew: crew };
  const result = await direct(system, vars, service);
  expect(service.getMissionBinding.mock.calls.map(([request]) => request)).toEqual(bindings.map(binding => ({
    campaign: '321', subject: crew, ...binding
  })));
  expect(result.calls.map(call => call.entrypoint)).toEqual(['begin_observation', 'run_system', 'end_observation']);
  expect(result.calls[1]).toEqual(System.getRunSystemCall(system, vars, dispatcher));
  expect(result.calls[0].calldata.slice(5)).toEqual(MissionObservation.encodeMissionTargets([starter]));
});

test.each(['unknown', 'mismatched'])('pre-cutover process with %s provenance blocks submission', async status => {
  const service = api();
  const starter = { campaign: '321', subject: crew, mission: 4 };
  service.getMissionObservationCandidates.mockResolvedValue({ candidates: [starter, ...candidates] });
  service.getStarterMissions.mockResolvedValue({ active: true, eligible: true, campaign: '321', missions: [{ accepted: true }] });
  service.getMissionBinding.mockResolvedValue({ status });
  await expect(direct('ProcessProductsFinish', { processor: exchange, processor_slot: 1, caller_crew: crew }, service)).rejects.toThrow();
});

test('unbound starter work retains another player’s colony observation', async () => {
  const service = api();
  const starter = { campaign: '321', subject: crew, mission: 0 };
  service.getMissionObservationCandidates.mockResolvedValue({ candidates: [starter, ...candidates] });
  service.getStarterMissions.mockResolvedValue({ active: true, eligible: true, campaign: '321', missions: [{ accepted: true }] });
  service.getMissionBinding.mockResolvedValue({ status: 'unbound' });
  const result = await direct('ConstructionFinish', { building: exchange, caller_crew: crew }, service);
  expect(result.candidates).toEqual(candidates);
  expect(result.calls[0].calldata.slice(5)).toEqual(MissionObservation.encodeMissionTargets(candidates));
});

test('a changed campaign definition blocks stale starter candidates', async () => {
  const service = api();
  service.getMissionObservationCandidates.mockResolvedValue({ candidates: [{ campaign: '321', subject: crew, mission: 3 }] });
  service.getStarterMissions.mockResolvedValue({ active: true, eligible: true, campaign: '322', missions: [{ accepted: true }] });
  await expect(direct('FillSellOrder', sell, service)).rejects.toThrow('Campaign state changed');
});
