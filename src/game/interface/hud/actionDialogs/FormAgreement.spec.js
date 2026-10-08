const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const React = require('react');
const { render, screen, fireEvent } = require('@testing-library/react');
const { Building, Entity, Permission } = require('@influenceth/sdk');

jest.mock('~/appConfig', () => ({ appConfig: { get: () => '' } }), { virtual: true });
jest.mock('~/components/Icons', () => new Proxy({}, { get: () => () => null }), { virtual: true });
jest.mock('~/components/CrewIndicator', () => () => null, { virtual: true });
jest.mock('~/components/ButtonAlt', () => () => null, { virtual: true });
jest.mock('~/components/TextInputUncontrolled', () => ({ __esModule: true, default: 'input', TextInputWrapper: 'div' }), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useStore', () => () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useEntity', () => () => ({}), { virtual: true });
jest.mock('~/hooks/useSession', () => () => ({}), { virtual: true });
jest.mock('~/hooks/useLot', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useAsteroid', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useCrew', () => id => ({ data: { id, Crew: { delegatedTo: '0x123' } } }), { virtual: true });
jest.mock('~/hooks/useHydratedLocation', () => () => ({}), { virtual: true });
jest.mock('~/hooks/useBlockTime', () => () => 1800000000, { virtual: true });
jest.mock('~/hooks/useWalletTokenBalance', () => ({ useSwayBalance: () => ({ data: 10n ** 18n }) }), { virtual: true });
jest.mock('~/hooks/actionManagers/useAgreementManager', () => jest.fn(), { virtual: true });
jest.mock('~/lib/actionStages', () => ({ NOT_STARTED: 0, STARTING: 1 }), { virtual: true });
jest.mock('~/lib/clipboard', () => ({}), { virtual: true });
jest.mock('~/lib/priceUtils', () => ({ TOKEN: { SWAY: 'sway' }, TOKEN_SCALE: { sway: 1e6 } }), { virtual: true });
jest.mock('~/lib/starterPacks', () => ({ STARTER_LOT_LEASE_TERM: 2592000, isStarterLotLeaseCandidate: () => false }), { virtual: true });
jest.mock('~/lib/leaseUtils', () => jest.requireActual('../../../../lib/leaseUtils'), { virtual: true });
jest.mock('~/lib/utils', () => ({
  daysToSeconds: n => n * 86400, secondsToDays: n => n / 86400,
  monthsToSeconds: n => n * 2592000, secondsToMonths: n => n / 2592000,
  reactBool: Boolean, nativeBool: Boolean, safeBigInt: n => BigInt(n || 0),
  locationsArrToObj: () => ({ asteroidId: 2 }), formatFixed: n => String(n), formatTimer: n => String(n)
}), { virtual: true });
jest.mock('~/theme', () => ({ __esModule: true, default: { colors: {} }, hexToRGB: () => '0,0,0' }), { virtual: true });
jest.mock('../ActionDialog', () => ({ ActionDialogInner: ({ children }) => children }));
jest.mock('./components', () => ({
  ActionDialogHeader: () => null,
  ActionDialogBody: () => null,
  ActionDialogFooter: ({ disabled, onGo, goLabel }) => <button disabled={disabled} onClick={onGo}>{goLabel}</button>
}));

const FormAgreement = require('./FormAgreement').default;
const now = 1800000000;
let lot, expiredAgreement, manager;
beforeEach(() => {
  const crew = { id: 7, label: Entity.IDS.CREW };
  expiredAgreement = {
    permission: Permission.IDS.USE_LOT, permitted: crew, noticeTime: 0,
    startTime: now - 200 * 86400, endTime: now - 130 * 86400,
    rate: 1000, initialTerm: 86400, noticePeriod: 0
  };
  lot = {
    id: 123, label: Entity.IDS.LOT, UseLot: { tenant: crew },
    PrepaidAgreements: [expiredAgreement],
    PrepaidPolicies: [{ permission: Permission.IDS.USE_LOT, rate: 2000, initialTerm: 86400, noticePeriod: 0 }],
    building: { Building: { status: Building.CONSTRUCTION_STATUSES.OPERATIONAL }, Control: { controller: crew } }
  };
  const currentPolicy = Permission.getPolicyDetails(lot, undefined, now)[Permission.IDS.USE_LOT];
  manager = {
    currentPolicy, currentAgreementRaw: currentPolicy.agreements[0], currentAgreement: null,
    extendAgreement: jest.fn(), enterAgreement: jest.fn()
  };
  require('~/hooks/useCrewContext').mockReturnValue({ crew, authorize: method => ({ status: method === 'controls' ? 'denied' : 'allowed' }) });
  require('~/hooks/useLot').mockImplementation(() => ({ data: lot }));
  require('~/hooks/useAsteroid').mockReturnValue({ data: { Control: { controller: { id: 9 } } } });
  require('~/hooks/actionManagers/useAgreementManager').mockImplementation(() => manager);
});

test.each([false, true])('restores a 130-day-overdue lease with extension entrypoint %s', (isExtension) => {
  expect(manager.currentPolicy.agreements).toEqual([]);
  expect(manager.currentAgreementRaw).toBeUndefined();
  render(<FormAgreement entity={lot} permission={Permission.IDS.USE_LOT} isExtension={isExtension} />);
  const restore = screen.getByRole('button', { name: 'Restore Lease' });
  expect(restore).toBeEnabled();
  fireEvent.click(restore);
  expect(manager.extendAgreement).toHaveBeenCalledWith({
    recipient: '0x123', term: 30 * 86400,
    termPrice: Permission.getPrepaidAgreementExtensionPaymentAmount(expiredAgreement, 30 * 86400, now),
    permitted: { id: 7, label: Entity.IDS.CREW }
  });
  expect(manager.enterAgreement).not.toHaveBeenCalled();
});

test('an expired agreement with notice cannot be restored through the extension entrypoint', () => {
  expiredAgreement.noticeTime = expiredAgreement.endTime - 86400;
  render(<FormAgreement entity={lot} permission={Permission.IDS.USE_LOT} isExtension />);
  expect(screen.getByRole('button')).toBeDisabled();
  fireEvent.click(screen.getByRole('button'));
  expect(manager.extendAgreement).not.toHaveBeenCalled();
});
