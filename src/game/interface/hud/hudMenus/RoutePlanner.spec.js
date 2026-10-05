import React from 'react';
import { ThemeProvider } from 'styled-components';
import { fireEvent, render, screen } from '@testing-library/react';
import RoutePlanner from './RoutePlanner';
import useCrewContext from '~/hooks/useCrewContext';
import useWalletShips from '~/hooks/useWalletShips';
import Porkchop from '~/components/Porkchop';

jest.mock('@influenceth/sdk', () => ({
  Crew: { getCurrentFoodRatio: () => 1, getTimeSinceFed: () => 0 },
  Crewmate: { ABILITY_IDS: { PROPELLANT_EXHAUST_VELOCITY: 1 } },
  Entity: { IDS: { SHIP: 6, ASTEROID: 3 } },
  Inventory: { STATUSES: { AVAILABLE: 1 }, getType: (_, bonuses) => ({ massConstraint: 100000000 * bonuses.mass }) },
  Ship: {
    TYPES: { 1: { name: 'Shuttle', cargoSlot: 1, propellantSlot: 2, hullMass: 1000, exhaustVelocity: 100 } },
    IDS: { SHUTTLE: 1 }, STATUSES: { AVAILABLE: 1 }, Entity: { getVariant: () => ({}) }, propellantToDeltaV: () => 100
  },
  Time: { fromOrbitADays: () => ({ toDate: () => new Date(100000) }), toGameDuration: value => value }
}));
jest.mock('~/hooks/useCrewContext', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useCoarseTime', () => () => 100, { virtual: true });
jest.mock('~/hooks/useConstants', () => () => ({ data: 1 }), { virtual: true });
jest.mock('~/hooks/useAsteroid', () => {
  const data = { Orbit: {} };
  return () => ({ data });
}, { virtual: true });
jest.mock('~/hooks/useWalletShips', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useStore', () => {
  const state = { asteroids: { origin: 1, destination: 2 }, dispatchReorientCamera: jest.fn(), dispatchTravelSolution: jest.fn() };
  return selector => selector(state);
}, { virtual: true });
jest.mock('~/lib/utils', () => ({
  getCrewAbilityBonuses: (_, crew) => ({ totalBonus: crew.exhaustBonus }),
  reactBool: Boolean, nativeBool: Boolean, formatFixed: String
}), { virtual: true });
jest.mock('~/lib/geometryUtils', () => ({ sampleAsteroidOrbit: () => [] }), { virtual: true });
jest.mock('~/lib/formatters', () => ({ shipName: ship => ship.Name.name }), { virtual: true });
jest.mock('~/components/Porkchop', () => jest.fn(() => null), { virtual: true });
jest.mock('~/components/CrewmateCardFramed', () => ({ CrewCaptainCardFramed: () => null }), { virtual: true });
jest.mock('~/components/Dropdown', () => () => null, { virtual: true });
jest.mock('~/components/Icons', () => ({ CheckedIcon: () => null, UncheckedIcon: () => null, CloseIcon: () => null, RefreshIcon: () => null, WarningIcon: () => null }), { virtual: true });
jest.mock('~/components/MouseoverInfoPane', () => () => null, { virtual: true });
jest.mock('~/components/SliderInput', () => () => null, { virtual: true });
jest.mock('~/components/NumberInput', () => props => <input type="number" value={props.value} onChange={event => props.onChange(event.target.value)} />, { virtual: true });
jest.mock('../actionDialogs/components', () => ({ ShipImage: () => null, MaterialBonusTooltip: () => null, MouseoverContent: () => null }));
jest.mock('./components/components', () => ({ Scrollable: ({ children }) => <div>{children}</div> }));

const crewSnapshot = (exhaustBonus = 1) => ({
  id: 1, Crew: { lastFed: 100 }, _inventoryBonuses: { mass: 1, volume: 1 }, _foodBonuses: { consumption: 1 }, exhaustBonus
});
const plotProps = () => Porkchop.mock.calls.at(-1)[0];
const tree = () => <ThemeProvider theme={{ colors: {}, cursors: {} }}><RoutePlanner /></ThemeProvider>;
beforeEach(() => {
  useWalletShips.mockReturnValue({ data: [], isLoading: false });
});

test('block updates preserve the plot inputs and edited simulated masses, while real bonus changes update the plot', () => {
  useCrewContext.mockReturnValue({ crew: crewSnapshot(), loading: false });
  const { rerender } = render(tree());
  const [cargo, propellant] = screen.getAllByRole('spinbutton');
  fireEvent.change(cargo, { target: { value: '12' } });
  fireEvent.change(propellant, { target: { value: '34' } });
  const previous = plotProps();
  expect(previous.shipParams.actualCargoMass).toBe(12000000);
  expect(previous.shipParams.actualPropellantMass).toBe(34000000);

  for (let block = 0; block < 3; block++) {
    useCrewContext.mockReturnValue({ crew: crewSnapshot(), loading: false });
    rerender(tree());
    expect(plotProps().shipParams).toBe(previous.shipParams);
    expect(plotProps().originPath).toBe(previous.originPath);
    expect(plotProps().destinationPath).toBe(previous.destinationPath);
    expect(plotProps().lastFedAt).toBe(previous.lastFedAt);
    expect(cargo.value).toBe('12');
    expect(propellant.value).toBe('34');
  }

  useCrewContext.mockReturnValue({ crew: crewSnapshot(1.2), loading: false });
  rerender(tree());
  expect(plotProps().shipParams.exhaustVelocity).toBe(120);
  expect(plotProps().shipParams.actualCargoMass).toBe(12000000);
});

test('block updates keep an actual ship’s plot inputs stable', () => {
  useCrewContext.mockReturnValue({ crew: crewSnapshot(), loading: false });
  useWalletShips.mockReturnValue({ data: [{
    id: 10, label: 6, Name: { name: 'Ship' }, Ship: { shipType: 1 }, Location: { location: { label: 3, id: 1 } },
    Inventories: [{ slot: 1, mass: 12000000 }, { slot: 2, mass: 34000000 }]
  }], isLoading: false });
  const { rerender } = render(tree());
  const previous = plotProps().shipParams;
  useCrewContext.mockReturnValue({ crew: crewSnapshot(), loading: false });
  rerender(tree());
  expect(plotProps().shipParams).toBe(previous);
  expect(previous.actualCargoMass).toBe(12000000);
  expect(previous.actualPropellantMass).toBe(34000000);
});
