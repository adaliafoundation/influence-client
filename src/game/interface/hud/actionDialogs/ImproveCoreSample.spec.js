import React from 'react';
import { act, render } from '@testing-library/react';
import ImproveCoreSample from './ImproveCoreSample';
import useCrewContext from '~/hooks/useCrewContext';
import useCoreSampleManager from '~/hooks/actionManagers/useCoreSampleManager';
import useClosestAccessibleInventory from '~/hooks/useClosestAccessibleInventory';
import { useAsteroidAndLot } from '../ActionDialog';
import { ActionDialogFooter, CoreSampleSelectionDialog, InventorySelectionDialog } from './components';

jest.mock('@influenceth/sdk', () => ({
  Permission: { IDS: { USE_DEPOSIT: 1 } }, Asteroid: {}, Lot: { toIndex: id => Number(id || 0) },
  Crewmate: { ABILITY_IDS: { HOPPER_TRANSPORT_TIME: 1, FREE_TRANSPORT_DISTANCE: 2, CORE_SAMPLE_QUALITY: 3, CORE_SAMPLE_TIME: 4 } },
  Deposit: { STATUSES: { USED: 9 }, getSampleTime: () => 10 },
  Product: { TYPES: { 1: { massPerUnit: 1, category: 'metal' }, 175: {} }, IDS: { CORE_DRILL: 175 } },
  Time: { toRealDurationCeil: value => value }
}));
jest.mock('~/hooks/useCrewContext', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/actionManagers/useCoreSampleManager', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useActionCrew', () => () => ({}), { virtual: true });
jest.mock('~/hooks/useCrew', () => () => ({}), { virtual: true });
jest.mock('~/hooks/useEntity', () => {
  const data = { Location: { locations: [] } };
  return entity => ({ data: entity ? data : undefined });
}, { virtual: true });
jest.mock('~/hooks/useClosestAccessibleInventory', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useStore', () => {
  const state = { asteroids: { resourceMap: {} } };
  return selector => selector(state);
}, { virtual: true });
jest.mock('~/lib/utils', () => ({
  reactBool: Boolean, formatTimer: String, locationsArrToObj: () => ({ lotIndex: 10 }), keyify: value => value,
  getCrewAbilityBonuses: ids => Object.fromEntries(ids.map(id => [id, { totalBonus: 1 }]))
}), { virtual: true });
jest.mock('~/components/Icons', () => ({ CoreSampleIcon: () => null, ImproveCoreSampleIcon: () => null, ResourceIcon: () => null }), { virtual: true });
jest.mock('~/components/ResourceThumbnail', () => () => null, { virtual: true });
jest.mock('~/components/CrewIndicator', () => () => null, { virtual: true });
jest.mock('~/components/TextInputUncontrolled', () => ({}), { virtual: true });
jest.mock('~/theme', () => ({ colors: { resources: {} } }), { virtual: true });
jest.mock('~/lib/actionStages', () => ({ NOT_STARTED: 0 }), { virtual: true });
jest.mock('../ActionDialog', () => ({
  ActionDialogInner: ({ children }) => children, useAsteroidAndLot: jest.fn()
}));
jest.mock('./components', () => ({
  ActionDialogBody: ({ children }) => children, FlexSection: ({ children }) => children,
  ActionDialogFooter: jest.fn(() => null), ActionDialogHeader: () => null, ActionDialogStats: () => null,
  getBonusDirection: () => 0, formatSampleMass: String, TravelBonusTooltip: () => null,
  TimeBonusTooltip: () => null, MaterialBonusTooltip: () => null, EmptyResourceImage: () => null,
  FlexSectionInputBlock: () => null, FlexSectionSpacer: () => null,
  CoreSampleSelectionDialog: jest.fn(() => null), InventorySelectionDialog: jest.fn(() => null)
}));

const propsOf = component => component.mock.calls.at(-1)[0];
const closestDrillSource = { id: 3, label: 2, lotIndex: 15, slot: 2 };
test('permission snapshots preserve a chosen deposit and drill source', () => {
  const deposits = [1, 2].map(id => ({ id, Deposit: { resource: 1, initialYield: 100, status: 1 } }));
  useAsteroidAndLot.mockReturnValue({ asteroid: { id: 1 }, lot: { id: 10, deposits }, isLoading: false });
  const startImproving = jest.fn();
  useCoreSampleManager.mockReturnValue({ currentSamplingActions: [], completedSamplingActions: [], startImproving });
  const updatePermissions = () => useCrewContext.mockReturnValue({
    accountCrewIds: [1], crewCan: () => true, crewAuthorization: () => ({ status: 'allowed' })
  });
  useClosestAccessibleInventory.mockReturnValue(undefined);
  updatePermissions();
  const preselect = { sampleId: 1, origin: { id: 10 } };
  const { rerender } = render(<ImproveCoreSample preselect={preselect} />);
  const drillSource = { lotIndex: 20, slot: 2 };
  act(() => {
    propsOf(CoreSampleSelectionDialog).onSelected(deposits[1]);
    propsOf(InventorySelectionDialog).onSelected(drillSource);
  });
  updatePermissions();
  rerender(<ImproveCoreSample preselect={preselect} />);
  expect(propsOf(CoreSampleSelectionDialog).initialSelection.id).toBe(2);
  act(() => propsOf(ActionDialogFooter).onGo());
  expect(startImproving).toHaveBeenCalledWith(2, drillSource, undefined);
});

test('defaults an eligible deposit and nearest drill source', () => {
  const deposits = [{ id: 1, Deposit: { resource: 1, initialYield: 100, status: 1 } }];
  useAsteroidAndLot.mockReturnValue({ asteroid: { id: 1 }, lot: { id: 10, deposits }, isLoading: false });
  const startImproving = jest.fn();
  useCoreSampleManager.mockReturnValue({ currentSamplingActions: [], completedSamplingActions: [], startImproving });
  useCrewContext.mockReturnValue({ accountCrewIds: [1], crewCan: () => true, crewAuthorization: () => ({ status: 'allowed' }) });
  useClosestAccessibleInventory.mockReturnValue(closestDrillSource);

  render(<ImproveCoreSample />);

  expect(useClosestAccessibleInventory).toHaveBeenCalledWith(1, 175, { lotIndex: 10 });
  expect(propsOf(CoreSampleSelectionDialog).initialSelection.id).toBe(1);
  act(() => propsOf(ActionDialogFooter).onGo());
  expect(startImproving).toHaveBeenCalledWith(1, closestDrillSource, undefined);
});

test('leaves the drill unselected when no eligible source is available', () => {
  const deposits = [{ id: 1, Deposit: { resource: 1, initialYield: 100, status: 1 } }];
  useAsteroidAndLot.mockReturnValue({ asteroid: { id: 1 }, lot: { id: 10, deposits }, isLoading: false });
  const startImproving = jest.fn();
  useCoreSampleManager.mockReturnValue({ currentSamplingActions: [], completedSamplingActions: [], startImproving });
  useCrewContext.mockReturnValue({ accountCrewIds: [1], crewCan: () => true, crewAuthorization: () => ({ status: 'allowed' }) });
  useClosestAccessibleInventory.mockReturnValue(null);

  render(<ImproveCoreSample />);

  expect(propsOf(ActionDialogFooter).disabled).toBe(true);
  expect(propsOf(CoreSampleSelectionDialog).initialSelection.id).toBe(1);
});

test('preserves preselected and manual drill sources when discovery resolves', () => {
  const deposits = [{ id: 1, Deposit: { resource: 1, initialYield: 100, status: 1 } }];
  useAsteroidAndLot.mockReturnValue({ asteroid: { id: 1 }, lot: { id: 10, deposits }, isLoading: false });
  const startImproving = jest.fn();
  useCoreSampleManager.mockReturnValue({ currentSamplingActions: [], completedSamplingActions: [], startImproving });
  useCrewContext.mockReturnValue({ accountCrewIds: [1], crewCan: () => true, crewAuthorization: () => ({ status: 'allowed' }) });
  useClosestAccessibleInventory.mockReturnValue(closestDrillSource);

  const { rerender } = render(<ImproveCoreSample preselect={{ sampleId: 1, origin: { id: 10 } }} />);

  act(() => propsOf(ActionDialogFooter).onGo());
  expect(startImproving).toHaveBeenCalledWith(1, { lotIndex: 10, slot: null }, undefined);
  startImproving.mockClear();

  const manualSource = { lotIndex: 20, slot: 3 };
  act(() => propsOf(InventorySelectionDialog).onSelected(manualSource));
  rerender(<ImproveCoreSample preselect={{ sampleId: 1, origin: { id: 10 } }} />);
  act(() => propsOf(ActionDialogFooter).onGo());
  expect(startImproving).toHaveBeenCalledWith(1, manualSource, undefined);
});
