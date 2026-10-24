import React from 'react';
import { act, render } from '@testing-library/react';
import Extract from './Extract';
import actionStage from '~/lib/actionStages';
import useActionCrew from '~/hooks/useActionCrew';
import useBlockTime from '~/hooks/useBlockTime';
import useCrew from '~/hooks/useCrew';
import useCrewContext from '~/hooks/useCrewContext';
import useEntity from '~/hooks/useEntity';
import useExtractionManager from '~/hooks/actionManagers/useExtractionManager';
import useLot from '~/hooks/useLot';
import useProductionAuthorization from '~/hooks/useProductionAuthorization';
import useStore from '~/hooks/useStore';
import { useMissionActionDetails } from '~/contexts/MissionActionContext';
import { ActionDialogFooter, CoreSampleSelectionDialog } from './components';
import { useAsteroidAndLot } from '../ActionDialog';
import { Asteroid, Extractor } from '@influenceth/sdk';

jest.mock('@influenceth/sdk', () => ({
  Asteroid: { Entity: { getBonusByResource: jest.fn(() => ({ totalBonus: 1 })) }, getLotDistance: jest.fn(() => 0), getLotTravelTimeReal: jest.fn(() => 10) },
  Crewmate: { ABILITY_IDS: { HOPPER_TRANSPORT_TIME: 1, FREE_TRANSPORT_DISTANCE: 2, EXTRACTION_TIME: 3 } },
  Deposit: { STATUSES: { SAMPLED: 2 } },
  Extractor: { getExtractionTimeReal: jest.fn(() => 10) },
  Inventory: { getType: jest.fn(() => ({ massConstraint: 100, volumeConstraint: 100 })) },
  Lot: { toIndex: id => Number(id || 0) },
  Permission: { IDS: { USE_DEPOSIT: 1, EXTRACT_RESOURCES: 2 } },
  Product: {
    TYPES: {
      1: { i: 1, name: 'Iron', category: 'metal', massPerUnit: 1, volumePerUnit: 1 },
      2: { i: 2, name: 'Copper', category: 'metal', massPerUnit: 1, volumePerUnit: 1 }
    }
  },
  Time: { getCrewLaborDuration: value => value }
}));
jest.mock('~/components/Icons', () => ({
  AgreementIcon: () => null, CoreSampleIcon: () => null, ExtractionIcon: () => null, InventoryIcon: () => null,
  LocationIcon: () => null, ResourceIcon: () => null, SwayIcon: () => null, WarningIcon: () => null
}), { virtual: true });
jest.mock('~/components/ResourceThumbnail', () => () => null, { virtual: true });
jest.mock('~/contexts/MissionActionContext', () => ({ useMissionActionDetails: jest.fn() }), { virtual: true });
jest.mock('~/hooks/useProductionAuthorization', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useActionCrew', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useBlockTime', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useCrew', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useEntity', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/actionManagers/useExtractionManager', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useLot', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useStore', () => jest.fn(), { virtual: true });
jest.mock('~/lib/actionStages', () => ({ NOT_STARTED: 0, STARTING: 1, READY_TO_COMPLETE: 2 }), { virtual: true });
jest.mock('~/lib/formatters', () => ({ lotName: String }), { virtual: true });
jest.mock('~/lib/utils', () => ({
  formatFixed: String,
  formatSampleMass: String,
  formatSampleVolume: String,
  formatTimer: String,
  getCrewAbilityBonuses: ids => Object.fromEntries(ids.map(id => [id, { totalBonus: 1 }])),
  getProcessorLeaseConfig: () => null,
  getProcessorLeaseSelections: () => ({ leasePayment: 0, desiredLeaseTerm: 0, actualLeaseTerm: 0 }),
  locationsArrToObj: () => ({ lotId: undefined }),
  reactBool: Boolean
}), { virtual: true });
jest.mock('~/theme', () => ({ colors: { depositSize: 'depositSize', main: 'main', successDarkRGB: '0, 0, 0', successDark: 'successDark' } }), { virtual: true });
jest.mock('./components', () => {
  const passChildren = ({ children }) => children;
  const noContent = () => null;
  const components = {
    ActionDialogBody: passChildren,
    ActionDialogFooter: jest.fn(noContent),
    ActionDialogHeader: jest.fn(noContent),
    ActionDialogStats: jest.fn(noContent),
    CoreSampleSelectionDialog: jest.fn(noContent),
    EmptyResourceImage: noContent,
    FlexSection: passChildren,
    FlexSectionInputBlock: jest.fn(noContent),
    FlexSectionSpacer: noContent,
    InventoryInputBlock: noContent,
    InventorySelectionDialog: noContent,
    ProgressBarSection: noContent,
    ResourceAmountSlider: jest.fn(noContent),
    Section: passChildren,
    SectionBody: passChildren,
    SectionTitle: noContent,
    SublabelBanner: noContent,
    TimeBonusTooltip: noContent,
    TransferDistanceDetails: noContent,
    TravelBonusTooltip: noContent,
    formatResourceVolume: String,
    formatSampleMass: String,
    formatSampleVolume: String,
    formatTimeRequirements: details => ({ total: 10, details }),
    getBonusDirection: () => 0,
    getTripDetails: () => ({ totalTime: 20, tripDetails: [] })
  };
  return new Proxy(components, {
    get(target, property) {
      if (property in target) return target[property];
      return typeof property === 'string' && /^[A-Z]/.test(property) ? noContent : undefined;
    }
  });
});
jest.mock('../ActionDialog', () => ({
  ActionDialogInner: ({ children }) => children,
  theming: { 0: { highlight: 'highlight' }, 1: { highlight: 'highlight' }, 2: { highlight: 'highlight' } },
  useAsteroidAndLot: jest.fn()
}));

const dialogComponents = require('./components');
const propsOf = component => component.mock.calls.at(-1)[0];
const sample = (id, remainingYield, controllerId = 1, resource = 1) => ({
  id,
  Control: { controller: { id: controllerId } },
  Deposit: { resource, remainingYield, status: 2 },
  PrivateSale: { amount: 0 }
});

let lot;
let asteroid;
let extractionManager;
let crew;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  Object.values(dialogComponents).forEach((component) => {
    if (component?._isMockFunction) component.mockImplementation(() => null);
  });
  asteroid = { id: 7, Celestial: { abundances: {} } };
  lot = { id: 10, deposits: [] };
  crew = { _location: { lotId: 90 }, _timeAcceleration: 1, Crew: { readyAt: 0 } };
  extractionManager = {
    actionStage: actionStage.NOT_STARTED,
    currentExtraction: null,
    startExtraction: jest.fn(),
    finishExtraction: jest.fn()
  };
  useActionCrew.mockReturnValue(crew);
  useBlockTime.mockReturnValue(0);
  useCrew.mockReturnValue({ data: undefined });
  useCrewContext.mockReturnValue({
    accountCrewIds: [1],
    crewCan: () => true,
    crewAuthorization: () => ({ status: 'allowed' })
  });
  useEntity.mockReturnValue({ data: undefined });
  useExtractionManager.mockReturnValue(extractionManager);
  useLot.mockReturnValue({ data: undefined });
  useProductionAuthorization.mockReturnValue({ allowed: true, message: null, recheck: jest.fn() });
  useStore.mockImplementation(selector => selector({ dispatchAlertLogged: jest.fn() }));
  useAsteroidAndLot.mockReturnValue({ asteroid, lot, isLoading: false });
  Asteroid.Entity.getBonusByResource.mockReturnValue({ totalBonus: 1 });
  Extractor.getExtractionTimeReal.mockReturnValue(10);
});

afterEach(() => {
  act(() => jest.runOnlyPendingTimers());
  jest.useRealTimers();
});

const renderExtract = props => {
  const view = render(<Extract {...props} />);
  act(() => jest.runOnlyPendingTimers());
  return view;
};

test('defaults to the sole eligible sampled deposit', () => {
  lot.deposits = [sample(1, 12, 2)];

  renderExtract();

  expect(propsOf(CoreSampleSelectionDialog).initialSelection.id).toBe(1);
});

test('defaults to the highest-yield own deposit when multiple deposits are eligible', () => {
  lot.deposits = [sample(1, 100, 2), sample(2, 20), sample(3, 40)];

  renderExtract();

  expect(propsOf(CoreSampleSelectionDialog).initialSelection.id).toBe(3);
});

test('honors a preselected deposit over the own-deposit yield default', () => {
  lot.deposits = [sample(1, 100), sample(2, 20)];

  renderExtract({ preselect: { depositId: 2 } });

  expect(propsOf(CoreSampleSelectionDialog).initialSelection.id).toBe(2);
});

test('uses the active extraction sample and amount instead of a default sample', () => {
  lot.deposits = [sample(1, 100, 1, 1), sample(2, 20, 1, 2)];
  extractionManager.actionStage = actionStage.STARTING;
  extractionManager.currentExtraction = { depositId: 2, yield: 5, isCoreSampleUpdated: false };

  renderExtract();

  expect(useMissionActionDetails.mock.calls.at(-1)[0]).toMatchObject({ amount: 5, resource: 2, running: true });
});