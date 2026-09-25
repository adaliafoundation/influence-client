const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const React = require('react');
const { renderHook, act } = require('@testing-library/react');

jest.mock('~/contexts/ChainTransactionContext', () => ({ __esModule: true, default: require('react').createContext() }), { virtual: true });
jest.mock('~/hooks/actionManagers/usePolicyManager', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('~/lib/utils', () => ({ daysToSeconds: (v) => v * 86400, secondsToDays: (v) => v / 86400, getAgreementPath: () => '' }), { virtual: true });
jest.mock('~/lib/priceUtils', () => ({ TOKEN: { SWAY: 'sway' }, TOKEN_SCALE: { sway: 1e6 } }), { virtual: true });

const { Entity, Permission } = require('@influenceth/sdk');
const ChainTransactionContext = require('~/contexts/ChainTransactionContext').default;
const usePolicyManager = require('~/hooks/actionManagers/usePolicyManager').default;
const useCrewContext = require('~/hooks/useCrewContext').default;
const useAgreementManager = require('./useAgreementManager').default;
const target = { id: 123, label: Entity.IDS.LOT };

test.each([2493, 5630])('restoration uses selected eligible crew %s for permitted and caller', (id) => {
  const execute = jest.fn();
  useCrewContext.mockReturnValue({ crew: { id } });
  usePolicyManager.mockReturnValue({ currentPolicy: { policyType: Permission.POLICY_IDS.PREPAID, agreements: [] } });
  const wrapper = ({ children }) => <ChainTransactionContext.Provider value={{ execute }}>{children}</ChainTransactionContext.Provider>;
  const { result } = renderHook(() => useAgreementManager(target, Permission.IDS.USE_LOT), { wrapper });
  act(() => result.current.extendAgreement({ permitted: { id, label: Entity.IDS.CREW }, term: 86400, termPrice: 100n }));
  expect(execute).toHaveBeenCalledWith('ExtendPrepaidAgreement', expect.objectContaining({
    target,
    permitted: { id, label: Entity.IDS.CREW },
    caller_crew: { id, label: Entity.IDS.CREW },
    added_term: 86400,
    termPrice: 100n
  }), expect.any(Object));
});
