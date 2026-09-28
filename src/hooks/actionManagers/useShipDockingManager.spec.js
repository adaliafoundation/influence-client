const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const React = require('react');
const { renderHook } = require('@testing-library/react');
const { Entity } = require('@influenceth/sdk');
jest.mock('~/contexts/ChainTransactionContext', () => ({ __esModule: true, default: require('react').createContext() }), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useShip', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useShipEjectionEligibility', () => jest.fn(), { virtual: true });
jest.mock('~/lib/shipEjectionEligibility', () => jest.requireActual('../../lib/shipEjectionEligibility'), { virtual: true });
jest.mock('~/lib/actionStages', () => ({ STARTING: 'STARTING', NOT_STARTED: 'NOT_STARTED' }), { virtual: true });
const Context = require('~/contexts/ChainTransactionContext').default;
const useCrewContext = require('~/hooks/useCrewContext');
const useShip = require('~/hooks/useShip');
const useShipEjectionEligibility = require('~/hooks/useShipEjectionEligibility');
const useShipDockingManager = require('./useShipDockingManager').default;
let ship, execute, recheck, getPendingTx;
const wrapper = ({ children }) => <Context.Provider value={{ execute, getPendingTx }}>{children}</Context.Provider>;
beforeEach(() => {
  ship = { id: 9, Control: { controller: { id: 2 } }, Location: { location: { label: Entity.IDS.LOT, id: 5 }, locations: [{ label: Entity.IDS.ASTEROID, id: 1 }, { label: Entity.IDS.LOT, id: 5 }] } };
  execute = jest.fn();
  getPendingTx = jest.fn(() => null);
  recheck = jest.fn(async () => ({ status: 'allowed', ship }));
  useCrewContext.mockReturnValue({ crew: { id: 1 }, accountCrewIds: [1, 2] });
  useShip.mockReturnValue({ data: ship });
  useShipEjectionEligibility.mockReturnValue({ eligibility: { status: 'allowed' }, recheck });
});

test.each(['blocked', 'checking'])('does not submit a fresh %s result even if UI was allowed', async (status) => {
  recheck.mockResolvedValue({ status, reason: 'Protection changed' });
  const { result } = renderHook(() => useShipDockingManager(9), { wrapper });
  expect((await result.current.undockShip(true)).status).toBe(status);
  expect(execute).not.toHaveBeenCalled();
});

test('same-wallet other crew eviction always submits unpowered with refreshed ship data', async () => {
  const freshShip = { ...ship, Location: { location: { label: Entity.IDS.LOT, id: 5 }, locations: [{ label: Entity.IDS.ASTEROID, id: 1 }, { label: Entity.IDS.LOT, id: 6 }] } };
  recheck.mockResolvedValue({ status: 'allowed', ship: freshShip });
  const { result } = renderHook(() => useShipDockingManager(9), { wrapper });
  await result.current.undockShip(false);
  expect(recheck).toHaveBeenCalledWith({ shipId: 9, crewId: 1 });
  expect(execute).toHaveBeenCalledWith('UndockShip', { ship: freshShip, powered: false, caller_crew: { label: Entity.IDS.CREW, id: 1 } }, { asteroidId: 1, lotId: 6 });
});

test('failed preflight reads cannot submit', async () => {
  recheck.mockRejectedValue(new Error('Unavailable'));
  const { result } = renderHook(() => useShipDockingManager(9), { wrapper });
  await expect(result.current.undockShip(true)).rejects.toThrow('Unavailable');
  expect(execute).not.toHaveBeenCalled();
});

test('self launch retains its chosen propulsion and does not use eviction prerequisites', async () => {
  useCrewContext.mockReturnValue({ crew: { id: 2 } });
  const { result } = renderHook(() => useShipDockingManager(9), { wrapper });
  await result.current.undockShip(false);
  expect(recheck).not.toHaveBeenCalled();
  expect(execute).toHaveBeenCalledWith('UndockShip', expect.objectContaining({ powered: true }), expect.any(Object));
});


test('unknown ship control cannot submit through the self-launch path', async () => {
  delete ship.Control;
  const { result } = renderHook(() => useShipDockingManager(9), { wrapper });
  expect((await result.current.undockShip(true)).status).toBe('checking');
  expect(execute).not.toHaveBeenCalled();
});
