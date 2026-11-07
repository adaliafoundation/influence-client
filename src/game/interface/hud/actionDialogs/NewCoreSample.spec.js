import React from 'react';
import { act, render } from '@testing-library/react';
import NewCoreSample from './NewCoreSample';
import actionStage from '~/lib/actionStages';
import useCoreSampleManager from '~/hooks/actionManagers/useCoreSampleManager';
import useClosestAccessibleInventory from '~/hooks/useClosestAccessibleInventory';
import useActionCrew from '~/hooks/useActionCrew';
import useEntity from '~/hooks/useEntity';
import useStore from '~/hooks/useStore';
import { hasStarterCoreSampleEntitlement } from '~/lib/starterPacks';
import { ActionDialogFooter, FlexSectionInputBlock, InventorySelectionDialog, ResourceSelectionDialog } from './components';
import { useAsteroidAndLot } from '../ActionDialog';
import { Asteroid } from '@influenceth/sdk';

jest.mock('@influenceth/sdk', () => ({
  Asteroid: {
    Entity: { getAbundances: jest.fn(), getAbundanceAtLot: jest.fn() },
    getLotDistance: jest.fn(() => 0),
    getLotTravelTimeReal: jest.fn(() => 10)
  },
  Crewmate: { ABILITY_IDS: { HOPPER_TRANSPORT_TIME: 1, FREE_TRANSPORT_DISTANCE: 2, CORE_SAMPLE_QUALITY: 3, CORE_SAMPLE_TIME: 4 } },
  Deposit: { getSampleBounds: jest.fn(() => ({ lower: 1, upper: 10 })), getSampleTime: jest.fn(() => 10) },
  Lot: { toIndex: id => Number(id || 0) },
  Product: {
    IDS: { CORE_DRILL: 175 },
    TYPES: {
      1: { name: 'Iron', massPerUnit: 1 },
      2: { name: 'Copper', massPerUnit: 1 },
      3: { name: 'Nickel', massPerUnit: 1 },
      175: { name: 'Core Drill', massPerUnit: 1 }
    }
  },
  Time: { toRealDurationCeil: value => value }
}));
jest.mock('~/components/Icons', () => ({ NewCoreSampleIcon: () => null, ResourceIcon: () => null }), { virtual: true });
jest.mock('~/components/ResourceThumbnail', () => () => null, { virtual: true });
jest.mock('~/hooks/actionManagers/useCoreSampleManager', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useActionCrew', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useClosestAccessibleInventory', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useEntity', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useStore', () => jest.fn(), { virtual: true });
jest.mock('~/lib/actionStages', () => ({ NOT_STARTED: 'NOT_STARTED', STARTING: 'STARTING', COMPLETED: 'COMPLETED' }), { virtual: true });
jest.mock('~/lib/starterPacks', () => ({ hasStarterCoreSampleEntitlement: jest.fn() }), { virtual: true });
jest.mock('~/lib/utils', () => ({
  formatFixed: String,
  formatTimer: String,
  getCrewAbilityBonuses: ids => Object.fromEntries(ids.map(id => [id, { totalBonus: 1 }])),
  locationsArrToObj: () => ({ lotIndex: 45 }),
  reactBool: Boolean
}), { virtual: true });
jest.mock('./components', () => {
  const passChildren = ({ children }) => children;
  const noContent = () => null;
  return {
    ActionDialogBody: passChildren,
    ActionDialogFooter: jest.fn(noContent),
    ActionDialogHeader: jest.fn(noContent),
    ActionDialogStats: jest.fn(noContent),
    EmptyResourceImage: jest.fn(noContent),
    FlexSection: passChildren,
    FlexSectionInputBlock: jest.fn(noContent),
    FlexSectionSpacer: jest.fn(noContent),
    InventorySelectionDialog: jest.fn(noContent),
    MaterialBonusTooltip: jest.fn(noContent),
    ProgressBarSection: jest.fn(noContent),
    ResourceSelectionDialog: jest.fn(noContent),
    SublabelBanner: jest.fn(noContent),
    TimeBonusTooltip: jest.fn(noContent),
    TravelBonusTooltip: jest.fn(noContent),
    formatSampleMass: String,
    formatTimeRequirements: details => ({ total: 10, details }),
    getBonusDirection: () => 0,
    getTripDetails: () => ({ totalTime: 20, tripDetails: [] })
  };
});
jest.mock('../ActionDialog', () => ({
  ActionDialogInner: ({ children }) => children,
  theming: { COMPLETED: { highlight: 'highlight' } },
  useAsteroidAndLot: jest.fn()
}));

const { Deposit } = require('@influenceth/sdk');
const dialogComponents = require('./components');
const propsOf = component => component.mock.calls.at(-1)[0];
const inputProps = title => FlexSectionInputBlock.mock.calls.map(([props]) => props).filter(props => props.title === title).at(-1);
const closestSource = { id: 3, label: 2, lotIndex: 30, slot: 2 };
const manualSource = { id: 4, label: 2, lotIndex: 40, slot: 3 };
const preselectedOrigin = { id: 5, label: 2 };
const originEntity = { Location: { locations: [] } };

let asteroid;
let lot;
let abundanceByResource;
let closestInventory;
let manager;
let storeState;
let crew;

beforeEach(() => {
  jest.clearAllMocks();
  Object.values(dialogComponents).forEach((component) => {
    if (component?._isMockFunction) component.mockImplementation(() => null);
  });
  asteroid = { id: 7, Celestial: { abundances: { 1: 1, 2: 1, 3: 1 } } };
  lot = { id: 100, deposits: [] };
  abundanceByResource = { 1: 0.2, 2: 0.8, 3: 0 };
  closestInventory = undefined;
  crew = { _location: { asteroidId: 7, lotId: 90 }, _timeAcceleration: 1 };
  manager = { currentSamplingActions: [], completedSamplingActions: [], startSampling: jest.fn(), finishSampling: jest.fn() };
  storeState = {
    asteroids: { resourceMap: { active: false, selected: undefined } },
    dispatchResourceMapSelect: jest.fn(),
    dispatchResourceMapToggle: jest.fn()
  };

  Asteroid.Entity.getAbundances.mockReturnValue({ 1: 1, 2: 1, 3: 1 });
  Asteroid.Entity.getAbundanceAtLot.mockImplementation((entity, lotIndex, resourceId) => abundanceByResource[resourceId] || 0);
  Deposit.getSampleBounds.mockReturnValue({ lower: 1, upper: 10 });
  Deposit.getSampleTime.mockReturnValue(10);
  useActionCrew.mockReturnValue(crew);
  useClosestAccessibleInventory.mockImplementation(() => closestInventory);
  useCoreSampleManager.mockImplementation(() => manager);
  useEntity.mockImplementation(entity => ({ data: entity ? originEntity : undefined }));
  useStore.mockImplementation(selector => selector(storeState));
  useAsteroidAndLot.mockReturnValue({ asteroid, lot, isLoading: false });
  hasStarterCoreSampleEntitlement.mockReturnValue(false);
});

test('defaults to the most abundant positive resource and nearest core-drill source', () => {
  closestInventory = closestSource;

  render(<NewCoreSample />);

  expect(propsOf(ResourceSelectionDialog).initialSelection).toBe(2);
  expect(useClosestAccessibleInventory).toHaveBeenCalledWith(7, 175, { lotIndex: 100 });
  expect(inputProps('Resource').label).toBe('Copper');
  expect(inputProps('Tool').label).toBe('Core Drill');

  act(() => propsOf(ActionDialogFooter).onGo());
  expect(manager.startSampling).toHaveBeenCalledWith(2, closestSource);
});

test('leaves the resource unselected when the lot has no positive abundance', () => {
  abundanceByResource = { 1: 0, 2: 0, 3: 0 };
  closestInventory = closestSource;

  render(<NewCoreSample />);

  expect(propsOf(ResourceSelectionDialog).initialSelection).toBeUndefined();
  expect(inputProps('Resource').label).toBe('Select');
  expect(propsOf(ActionDialogFooter).disabled).toBe(true);
});

test('leaves the drill unselected when no eligible source is available', () => {
  closestInventory = null;

  render(<NewCoreSample />);

  expect(inputProps('Resource').label).toBe('Copper');
  expect(inputProps('Tool').label).toBe('Select');
  expect(propsOf(ActionDialogFooter).disabled).toBe(true);
});

test('preserves preselected resource and drill source', () => {
  closestInventory = closestSource;

  render(<NewCoreSample preselect={{ resourceId: 1, origin: preselectedOrigin }} />);

  expect(propsOf(ResourceSelectionDialog).initialSelection).toBe(1);
  expect(inputProps('Resource').label).toBe('Iron');
  act(() => propsOf(ActionDialogFooter).onGo());
  expect(manager.startSampling).toHaveBeenCalledWith(1, { lotIndex: 45, slot: null });
});

test('preserves a selected resource-map mineral', () => {
  storeState.asteroids.resourceMap = { active: true, selected: 1 };

  render(<NewCoreSample />);

  expect(propsOf(ResourceSelectionDialog).initialSelection).toBe(1);
  expect(inputProps('Resource').label).toBe('Iron');
});

test('preserves a manual mineral choice and explicit clearing', () => {
  closestInventory = closestSource;
  const { rerender } = render(<NewCoreSample />);

  act(() => propsOf(ResourceSelectionDialog).onSelected(1));
  abundanceByResource = { 1: 0.1, 2: 0.9, 3: 0 };
  rerender(<NewCoreSample />);
  expect(inputProps('Resource').label).toBe('Iron');

  act(() => propsOf(ResourceSelectionDialog).onSelected(undefined));
  rerender(<NewCoreSample />);

  expect(inputProps('Resource').label).toBe('Select');
  expect(propsOf(ResourceSelectionDialog).initialSelection).toBeUndefined();
});

test('does not select an inventory drill when the starter pack supplies one', () => {
  closestInventory = closestSource;
  hasStarterCoreSampleEntitlement.mockReturnValue(true);

  render(<NewCoreSample />);

  expect(useClosestAccessibleInventory).toHaveBeenCalledWith(null, 175, undefined);
  expect(inputProps('Tool').sublabel).toBe('Included in Starter Pack');
  act(() => propsOf(ActionDialogFooter).onGo());
  expect(manager.startSampling).toHaveBeenCalledWith(2, undefined);
});

test('preserves a manual drill choice and explicit clearing while discovery resolves', () => {
  const { rerender } = render(<NewCoreSample />);

  act(() => propsOf(InventorySelectionDialog).onSelected(manualSource));
  closestInventory = closestSource;
  rerender(<NewCoreSample />);
  act(() => propsOf(ActionDialogFooter).onGo());
  expect(manager.startSampling).toHaveBeenLastCalledWith(2, manualSource);

  act(() => propsOf(InventorySelectionDialog).onSelected(null));
  rerender(<NewCoreSample />);
  act(() => propsOf(ActionDialogFooter).onGo());
  expect(manager.startSampling).toHaveBeenLastCalledWith(2, null);
});

test('preserves the resource and drill source from the current sampling action', () => {
  const currentAction = { resourceId: 1, sampleId: 9, origin: preselectedOrigin, originSlot: 2 };
  manager.currentSamplingActions = [{ stage: actionStage.NOT_STARTED, action: currentAction }];
  storeState.asteroids.resourceMap = { active: true, selected: 2 };
  closestInventory = closestSource;

  render(<NewCoreSample sampleId={9} />);

  act(() => propsOf(ActionDialogFooter).onGo());
  expect(manager.startSampling).toHaveBeenCalledWith(1, { lotIndex: 45, slot: 2 });
});