import React from 'react';
import { act, render } from '@testing-library/react';
import FeedCrew from './FeedCrew';
import actionStages from '~/lib/actionStages';
import useAsteroid from '~/hooks/useAsteroid';
import useBlockTime from '~/hooks/useBlockTime';
import useClosestAccessibleInventory from '~/hooks/useClosestAccessibleInventory';
import useCrew from '~/hooks/useCrew';
import useCrewContext from '~/hooks/useCrewContext';
import useEntity from '~/hooks/useEntity';
import useFeedCrewManager from '~/hooks/actionManagers/useFeedCrewManager';
import useLot from '~/hooks/useLot';
import { hasStarterFoodSupplyEntitlement } from '~/lib/starterPacks';
import { ActionDialogFooter, InventorySelectionDialog, ItemSelectionSection, MultiSourceInputBlock, OrderSelectionDialog } from './components';

jest.mock('@influenceth/sdk', () => ({
  Asteroid: { getLotDistance: () => 0, getLotTravelTimeReal: () => 0 },
  Crew: {
    CREWMATE_FOOD_PER_YEAR: 100,
    getCurrentFoodRatio: () => 0.5,
    getFoodMultiplier: () => 1,
    getTimeSinceFed: () => 0
  },
  Crewmate: { ABILITY_IDS: { HOPPER_TRANSPORT_TIME: 1, FREE_TRANSPORT_DISTANCE: 2 } },
  Lot: { toIndex: id => Number(id || 0) },
  Permission: { IDS: { REMOVE_PRODUCTS: 1, BUY: 2 } },
  Product: { IDS: { FOOD: 129 }, TYPES: { 129: { massPerUnit: 1, volumePerUnit: 1 } } },
  Time: { toGameDuration: value => value, toRealDuration: value => value }
}));
jest.mock('~/contexts/MissionActionContext', () => ({ useMissionActionDetails: jest.fn() }), { virtual: true });
jest.mock('~/components/Icons', () => ({
  AddRationsIcon: () => null, ForwardIcon: () => null, InventoryIcon: () => null, RouteIcon: () => null,
  WarningIcon: () => null, StopwatchIcon: () => null, FoodIcon: () => null
}), { virtual: true });
jest.mock('~/components/ResourceThumbnail', () => () => null, { virtual: true });
jest.mock('~/hooks/useAsteroid', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useBlockTime', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useClosestAccessibleInventory', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useCrew', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useEntity', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/actionManagers/useFeedCrewManager', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useLot', () => jest.fn(), { virtual: true });
jest.mock('~/lib/actionStages', () => ({ NOT_STARTED: 'NOT_STARTED', STARTING: 'STARTING' }), { virtual: true });
jest.mock('~/lib/starterPacks', () => ({ hasStarterFoodSupplyEntitlement: jest.fn() }), { virtual: true });
jest.mock('~/lib/utils', () => ({
  formatFixed: String,
  formatTimer: String,
  getCrewAbilityBonuses: () => ({ totalBonus: 1 }),
  locationsArrToObj: () => ({ lotId: 200 }),
  reactBool: Boolean
}), { virtual: true });
jest.mock('~/theme', () => ({ colors: { green: 'green', main: 'main', warning: 'warning' } }), { virtual: true });
jest.mock('./components', () => {
  const passChildren = ({ children }) => children;
  const noContent = () => null;
  return {
    ActionDialogBody: passChildren,
    ActionDialogFooter: jest.fn(noContent),
    ActionDialogHeader: jest.fn(noContent),
    ActionDialogStats: jest.fn(noContent),
    ActionDialogTabs: jest.fn(noContent),
    CrewInputBlock: jest.fn(noContent),
    FlexSection: passChildren,
    FlexSectionBlock: passChildren,
    FlexSectionInputBlock: jest.fn(noContent),
    FlexSectionSpacer: jest.fn(noContent),
    InventoryChangeCharts: jest.fn(noContent),
    InventorySelectionDialog: jest.fn(noContent),
    ItemSelectionSection: jest.fn(noContent),
    MiniBarChart: jest.fn(noContent),
    MultiSourceInputBlock: jest.fn(noContent),
    OrderSelectionDialog: jest.fn(noContent),
    ProgressBarSection: jest.fn(noContent),
    TimeBonusTooltip: jest.fn(noContent),
    TransferDistanceDetails: jest.fn(noContent),
    TransferSelectionDialog: jest.fn(noContent),
    formatMass: String,
    formatResourceMass: String,
    formatTimeRequirements: details => ({ total: details || 0, details: [] }),
    formatVolume: String,
    getBonusDirection: () => 0
  };
});
jest.mock('../ActionDialog', () => ({ ActionDialogInner: ({ children }) => children }));

const dialogComponents = require('./components');
const source = { id: 3, label: 2, lotIndex: 10, slot: 1 };
const otherSource = { id: 4, label: 2, lotIndex: 15, slot: 2 };
const originEntity = {
  id: source.id,
  label: source.label,
  Location: { locations: [] },
  Inventories: [{ slot: source.slot, contents: [{ product: 129, amount: 500 }] }]
};
const propsOf = component => component.mock.calls.at(-1)[0];

let crew;
let closestInventory;
let manager;

beforeEach(() => {
  jest.clearAllMocks();
  Object.values(dialogComponents).forEach((component) => {
    if (component?._isMockFunction) component.mockImplementation(() => null);
  });
  crew = {
    id: 1,
    _crewmates: [{}, {}],
    _foodBonuses: {},
    _location: { asteroidId: 7, lotIndex: 20 },
    _timeAcceleration: 1,
    Crew: { lastFed: 0 }
  };
  closestInventory = undefined;
  manager = { actionStage: actionStages.NOT_STARTED, currentFeeding: null, feedCrew: jest.fn() };
  useAsteroid.mockReturnValue({ data: { id: 7 }, isLoading: false });
  useBlockTime.mockReturnValue(0);
  useClosestAccessibleInventory.mockImplementation(() => closestInventory);
  useCrew.mockReturnValue({ data: null });
  useCrewContext.mockReturnValue({ crew, crewCan: jest.fn(() => true), isLoading: false });
  useEntity.mockImplementation(entity => ({ data: entity?.id ? originEntity : undefined }));
  useFeedCrewManager.mockImplementation(() => manager);
  useLot.mockReturnValue({ data: { id: 200 } });
  hasStarterFoodSupplyEntitlement.mockReturnValue(false);
});

test('defaults to the closest food source and caps the amount at remaining crew capacity', () => {
  closestInventory = source;

  render(<FeedCrew />);

  expect(useClosestAccessibleInventory).toHaveBeenCalledWith(7, 129, crew._location);
  expect(propsOf(MultiSourceInputBlock).inventorySelection).toEqual(source);
  expect(propsOf(ItemSelectionSection).items).toEqual({ 129: 100 });
});

test('preserves a preselected food amount within the inventory and crew-capacity limit', () => {
  closestInventory = source;

  render(<FeedCrew preselect={{ selectedItems: { 129: 40 } }} />);

  expect(propsOf(MultiSourceInputBlock).inventorySelection).toEqual(source);
  expect(propsOf(ItemSelectionSection).items).toEqual({ 129: 40 });
});

test('does not select storage when no eligible food source is available', () => {
  closestInventory = null;

  render(<FeedCrew />);

  expect(propsOf(MultiSourceInputBlock).inventorySelection).toBeUndefined();
});

test('does not replace starter-pack sourcing', () => {
  closestInventory = source;
  hasStarterFoodSupplyEntitlement.mockReturnValue(true);

  render(<FeedCrew />);

  expect(MultiSourceInputBlock).not.toHaveBeenCalled();
  expect(InventorySelectionDialog).not.toHaveBeenCalled();
  expect(propsOf(ActionDialogFooter).goLabel).toBe('Resupply with Starter Pack');
});

test('does not replace an exchange selection while inventory discovery resolves', () => {
  const { rerender } = render(<FeedCrew />);
  const exchange = { entity: { id: 5, label: 6 }, fillAmount: 25, fillPaymentTotal: 10 };

  act(() => propsOf(OrderSelectionDialog).onCompleted(exchange));
  closestInventory = source;
  rerender(<FeedCrew />);

  expect(propsOf(MultiSourceInputBlock).exchangeSelection).toEqual(exchange);
  expect(propsOf(MultiSourceInputBlock).inventorySelection).toBeUndefined();
});

test('preserves a manual source choice and does not refill it after the user clears it', () => {
  const { rerender } = render(<FeedCrew />);

  act(() => propsOf(InventorySelectionDialog).onSelected(otherSource));
  closestInventory = source;
  rerender(<FeedCrew />);
  expect(propsOf(MultiSourceInputBlock).inventorySelection).toEqual(otherSource);

  act(() => propsOf(MultiSourceInputBlock).onClear());
  rerender(<FeedCrew />);

  expect(propsOf(MultiSourceInputBlock).inventorySelection).toBeUndefined();
});

test('does not select a default source after feeding has started', () => {
  closestInventory = source;
  manager = {
    actionStage: actionStages.STARTING,
    currentFeeding: { vars: { origin: { id: otherSource.id, label: otherSource.label }, origin_slot: otherSource.slot } },
    feedCrew: jest.fn()
  };

  render(<FeedCrew />);

  expect(propsOf(MultiSourceInputBlock).inventorySelection).toEqual({
    id: otherSource.id,
    label: otherSource.label,
    slot: otherSource.slot
  });
});