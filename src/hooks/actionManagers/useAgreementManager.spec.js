const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const React = require('react');
const { renderHook } = require('@testing-library/react');
const { Entity, Permission } = require('@influenceth/sdk');
jest.mock('~/contexts/ChainTransactionContext', () => ({ __esModule: true, default: require('react').createContext() }), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('~/hooks/actionManagers/usePolicyManager', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('~/lib/authorization', () => jest.requireActual('../../lib/authorization'), { virtual: true });
jest.mock('~/lib/priceUtils', () => ({ TOKEN: { SWAY: 'sway' }, TOKEN_SCALE: { sway: 1e6 } }), { virtual: true });
jest.mock('~/lib/utils', () => ({ daysToSeconds: (v) => v * 86400, secondsToDays: (v) => v / 86400, getAgreementPath: (_, permission, permitted) => `${permission}:${permitted.label}:${permitted.id}` }), { virtual: true });
const Context = require('~/contexts/ChainTransactionContext').default;
const useCrewContext = require('~/hooks/useCrewContext').default;
const usePolicyManager = require('~/hooks/actionManagers/usePolicyManager').default;
const useAgreementManager = require('./useAgreementManager').default;
const crew = { label: Entity.IDS.CREW, id: 1, Crew: { delegatedTo: '0x123' } };
const ship = { label: Entity.IDS.SHIP, id: 1 };
const target = { label: Entity.IDS.BUILDING, id: 5 };
const permission = Permission.IDS.DOCK_SHIP;
const shipAgreement = { permission, permitted: ship };
let execute;
const wrapper = ({ children }) => <Context.Provider value={{ execute }}>{children}</Context.Provider>;
beforeEach(() => {
  execute = jest.fn();
  useCrewContext.mockReturnValue({ crew });
  usePolicyManager.mockReturnValue({ currentPolicy: { agreements: [shipAgreement] } });
});
test('a ship agreement is not selected for a crew with the same numeric ID', () => {
  const { result } = renderHook(() => useAgreementManager(target, permission), { wrapper });
  expect(result.current.currentAgreementRaw).toBeUndefined();
});
test('explicit ship agreement edits preserve its label and current target', () => {
  const path = `${permission}:${ship.label}:${ship.id}`;
  const { result, rerender } = renderHook(({ entity }) => useAgreementManager(entity, permission, path), { wrapper, initialProps: { entity: target } });
  const nextTarget = { ...target, id: 6 };
  rerender({ entity: nextTarget });
  result.current.cancelAgreement();
  expect(execute).toHaveBeenCalledWith('CancelPrepaidAgreement', expect.objectContaining({ target: nextTarget, permitted: ship }), expect.anything());
});
test('padded account grants still match the delegated wallet', () => {
  const accountAgreement = { permission, permitted: '0x000123' };
  usePolicyManager.mockReturnValue({ currentPolicy: { agreements: [accountAgreement] } });
  const { result } = renderHook(() => useAgreementManager(target, permission), { wrapper });
  expect(result.current.currentAgreementRaw).toEqual(accountAgreement);
});
