const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const React = require('react');
const { render, screen, fireEvent, waitFor } = require('@testing-library/react');
const { Entity } = require('@influenceth/sdk');
jest.mock('~/components/Icons', () => ({ LaunchShipIcon: () => null }), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useStore', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useLot', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useShip', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useAsteroid', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useStationedCrews', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useBlockTime', () => () => 100, { virtual: true });
jest.mock('~/hooks/useSimulationEnabled', () => () => false, { virtual: true });
jest.mock('~/hooks/useHydratedCrew', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/actionManagers/useShipDockingManager', () => jest.fn(), { virtual: true });
jest.mock('~/theme', () => ({ colors: {} }), { virtual: true });
jest.mock('~/lib/utils', () => ({ reactBool: Boolean }), { virtual: true });
jest.mock('~/lib/formatters', () => ({ asteroidName: () => 'Asteroid' }), { virtual: true });
jest.mock('~/lib/actionStages', () => ({ NOT_STARTED: 0 }), { virtual: true });
jest.mock('~/lib/shipEjectionEligibility', () => jest.requireActual('../../../../lib/shipEjectionEligibility'), { virtual: true });
jest.mock('../ActionDialog', () => ({ ActionDialogInner: ({ children, isLoading }) => isLoading ? <p>Loading</p> : children }));
jest.mock('./components', () => ({
  ActionDialogFooter: ({ disabled, onGo }) => <button disabled={disabled} onClick={onGo}>Submit</button>,
  ActionDialogHeader: ({ action }) => <h1>{action.label}</h1>,
  ActionDialogBody: ({ children }) => <div>{children}</div>,
  FlexSection: ({ children }) => <div>{children}</div>,
  FlexSectionSpacer: () => null,
  FlexSectionInputBlock: () => null,
  AsteroidImage: () => null,
  LotInputBlock: () => null
}));
const useCrewContext = require('~/hooks/useCrewContext');
const useShip = require('~/hooks/useShip');
const useLot = require('~/hooks/useLot');
const useAsteroid = require('~/hooks/useAsteroid');
const useStationedCrews = require('~/hooks/useStationedCrews');
const useShipDockingManager = require('~/hooks/actionManagers/useShipDockingManager');
const LaunchShip = require('./LaunchShip').default;
let manager;
const createAlert = jest.fn();
beforeEach(() => {
  createAlert.mockClear();
  require('~/hooks/useStore').mockImplementation(selector => selector({ dispatchAlertLogged: createAlert }));
  useCrewContext.mockReturnValue({ crew: { id: 1 }, accountCrewIds: [1, 2] });
  useShip.mockReturnValue({ data: { id: 9, Control: { controller: { id: 2 } }, Ship: { readyAt: 999 }, Inventories: [{ reservedMass: 10 }], _location: { lotId: 5, asteroidId: 1 }, Location: { location: { label: Entity.IDS.LOT, id: 5 } } } });
  useLot.mockReturnValue({ data: { id: 5 } });
  useAsteroid.mockReturnValue({ data: { id: 1 } });
  useStationedCrews.mockReturnValue({ data: undefined, isLoading: true });
  manager = { ejectionEligibility: { status: 'allowed', reason: null }, actionStage: 0, undockShip: jest.fn(async () => undefined) };
  useShipDockingManager.mockReturnValue(manager);
});

test('same-wallet other crew opens force mode without waiting for pilot, ship readiness or deliveries', async () => {
  render(<LaunchShip shipId={9} onClose={jest.fn()} />);
  expect(screen.getByText('Force Launch Ship')).toBeTruthy();
  expect(screen.getByRole('button').disabled).toBe(false);
  fireEvent.click(screen.getByRole('button'));
  await waitFor(() => expect(manager.undockShip).toHaveBeenCalledWith(true));
});

test.each(['blocked', 'checking'])('shared %s state disables the dialog', (status) => {
  manager.ejectionEligibility = { status, reason: 'Checking ship protection' };
  render(<LaunchShip shipId={9} onClose={jest.fn()} />);
  expect(screen.getByRole('button').disabled).toBe(true);
});

test('submission displays a newly granted protection without proceeding', async () => {
  manager.undockShip.mockResolvedValue({ status: 'blocked', reason: 'Ship has permission to remain' });
  render(<LaunchShip shipId={9} onClose={jest.fn()} />);
  fireEvent.click(screen.getByRole('button'));
  await waitFor(() => expect(createAlert).toHaveBeenCalledTimes(1));
  expect(createAlert.mock.calls[0][0].data.report).toContain('Ship has permission to remain');
  expect(screen.queryByRole('status')).toBeNull();
});


test('unknown ship controller stays loading instead of entering self-launch mode', () => {
  const { data } = useShip();
  delete data.Control;
  render(<LaunchShip shipId={9} onClose={jest.fn()} />);
  expect(screen.getByText('Loading')).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
});
