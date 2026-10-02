import { getCrewDisabledReason } from './ActionButton';
import ClaimArrivalReward from './ClaimArrivalReward';

jest.mock('@influenceth/sdk', () => ({ Asteroid: { SCAN_STATUSES: { SURFACE_SCANNED: 2 } } }));

jest.mock('react-dom/server', () => ({}));
jest.mock('~/components/LoadingBorder', () => () => null, { virtual: true });
jest.mock('~/components/ClipCorner', () => () => null, { virtual: true });
jest.mock('~/components/Icons', () => ({}), { virtual: true });
jest.mock('~/hooks/useActionButtonClick', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useFailureReporter', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useSyncedTime', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => jest.fn(), { virtual: true });
jest.mock('~/lib/utils', () => ({}), { virtual: true });
jest.mock('~/lib/priceUtils', () => ({}), { virtual: true });
jest.mock('~/theme', () => ({ colors: {} }), { virtual: true });

test.each([null, undefined])('disables actions with missing crew (%s), even without location or readiness checks', (crew) => {
  expect(getCrewDisabledReason({ crew, requireAsteroid: false, requireSurface: false }))
    .toBe('access restricted');
  expect(getCrewDisabledReason({ crew, requireReady: false }))
    .toBe('access restricted');
});

test('does not attempt authorization without a crew', () => {
  const crewAuthorization = jest.fn();
  expect(getCrewDisabledReason({ crew: null, permission: 1, permissionTarget: { id: 1 }, crewAuthorization }))
    .toBe('access restricted');
  expect(crewAuthorization).not.toHaveBeenCalled();
});

test('preserves pending-event and readiness checks for an existing crew', () => {
  expect(getCrewDisabledReason({ crew: { _actionTypeTriggered: 1, _ready: true } })).toBe('crew event pending');
  expect(getCrewDisabledReason({ crew: { _ready: false } })).toBe('crew busy');
  expect(getCrewDisabledReason({ crew: { _ready: true } })).toBeNull();
});

test('arrival rewards require a selected controller crew', () => {
  const props = {
    account: '0x1',
    asteroid: { Nft: { owner: '0x1' }, AsteroidReward: { hasArrivalStarterPack: true } },
    crew: null
  };
  expect(ClaimArrivalReward.isVisible(props)).toBe(false);
  props.asteroid.Control = { controller: { id: 7 } };
  expect(ClaimArrivalReward.isVisible({ ...props, crew: { id: 8 } })).toBe(false);
  expect(ClaimArrivalReward.isVisible({ ...props, crew: { id: 7 } })).toBe(true);
});
