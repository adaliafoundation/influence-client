const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const React = require('react');
const { render, screen } = require('@testing-library/react');
const { Entity } = require('@influenceth/sdk');
jest.mock('~/components/Icons', () => ({ LaunchShipIcon: () => null }), { virtual: true });
jest.mock('~/theme', () => ({ colors: {} }), { virtual: true });
jest.mock('~/hooks/actionManagers/useShipDockingManager', () => jest.fn(), { virtual: true });
jest.mock('~/lib/shipEjectionEligibility', () => jest.requireActual('../../../../lib/shipEjectionEligibility'), { virtual: true });
jest.mock('./ActionButton', () => (props) => <button disabled={!!props.flags.disabled}>{props.labelAddendum || props.label}</button>);
const useShipDockingManager = require('~/hooks/actionManagers/useShipDockingManager');
const { Component: EjectShip, isVisible } = require('./EjectShip').default;
const ship = { id: 9, Control: { controller: { id: 2 } }, Location: { location: { label: Entity.IDS.LOT, id: 5 } } };

test('bystanders and same-wallet other crews see force launch without property ownership', () => {
  expect(isVisible({ crew: { id: 1 }, ship, accountCrewIds: [1, 2] })).toBe(true);
  expect(isVisible({ crew: { id: 2 }, ship })).toBe(false);
  expect(isVisible({ crew: { id: 1 }, ship: { ...ship, Location: { location: { label: Entity.IDS.BUILDING, id: 8 } } } })).toBe(true);
  expect(isVisible({ crew: { id: 1 }, ship: { ...ship, Location: { location: { label: Entity.IDS.ASTEROID, id: 1 } } } })).toBe(false);
});

test.each(['allowed', 'blocked', 'checking'])('uses shared %s eligibility for the button', (status) => {
  useShipDockingManager.mockReturnValue({ ejectionEligibility: { status, reason: status === 'allowed' ? null : 'Protection' } });
  render(<EjectShip ship={ship} />);
  expect(screen.getByRole('button').disabled).toBe(status !== 'allowed');
});
