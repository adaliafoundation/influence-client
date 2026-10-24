import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';

import CoreSampling from './CoreSampling';

jest.mock('@influenceth/sdk', () => ({
  Deposit: { STATUSES: { SAMPLED: 2 } },
  Entity: { IDS: { LOT: 1, BUILDING: 2, CREW: 3, DEPOSIT: 4 } },
  Product: { IDS: { CORE_DRILL: 175 }, TYPES: { 1: { name: 'Iron' }, 3: { name: 'Ice' }, 175: { name: 'Core Drill' } } }
}));
jest.mock('~/components/Dropdown', () => jest.fn(() => null), { virtual: true });
jest.mock('~/components/Icons', () => ({
  CloseIcon: () => null,
  ImproveCoreSampleIcon: () => null,
  NewCoreSampleIcon: () => null,
  ResourceIcon: () => null,
  WarningIcon: () => null
}), { virtual: true });
jest.mock('~/components/LiveReadyStatus', () => () => null, { virtual: true });
jest.mock('~/components/ResourceThumbnail', () => jest.fn(() => null), { virtual: true });
jest.mock('~/components/WarningAlert', () => ({ children }) => <div data-testid="warning">{children}</div>, { virtual: true });
jest.mock('~/contexts/ActionSubmissionContext', () => ({ useActionSubmission: jest.fn() }), { virtual: true });
jest.mock('~/contexts/ChainTransactionContext', () => require('react').createContext(null), { virtual: true });
jest.mock('~/hooks/useAccessibleAsteroidInventories', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useAsteroid', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useAsteroidBuildings', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useBlockTime', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useConstants', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useLot', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useStore', () => jest.fn(), { virtual: true });
jest.mock('~/lib/actionStages', () => ({ NOT_STARTED: 'NOT_STARTED', STARTING: 'STARTING', COMPLETED: 'COMPLETED' }), { virtual: true });
jest.mock('~/lib/coreSamplingBatch', () => ({
  getCoreSamplingCrewBonuses: jest.fn(),
  getExtractorLots: jest.fn(),
  getLotResourceAbundances: jest.fn(),
  planCoreSamplingBatch: jest.fn()
}), { virtual: true });
jest.mock('~/lib/formatters', () => ({
  crewName: (crew) => `Crew #${crew?.id}`,
  entityName: (entity) => `Building #${entity?.id}`
}), { virtual: true });
jest.mock('~/lib/starterPacks', () => ({ hasStarterCoreSampleEntitlement: jest.fn() }), { virtual: true });
jest.mock('~/lib/utils', () => ({
  formatFixed: (value) => value,
  formatTimer: (value) => `${value}s`,
  locationsArrToObj: () => ({ lotIndex: 15 }),
  reactBool: Boolean
}), { virtual: true });
jest.mock('./components', () => ({
  ActionDialogFooter: jest.fn(({ onGo }) => <button data-testid="go" onClick={onGo} />),
  ActionDialogHeader: () => null
}));
jest.mock('../ActionDialog', () => ({
  ActionDialogInner: ({ children }) => <div>{children}</div>,
  theming: { NOT_STARTED: {} }
}));

const Dropdown = require('~/components/Dropdown');
const ChainTransactionContext = require('~/contexts/ChainTransactionContext');
const { useActionSubmission } = require('~/contexts/ActionSubmissionContext');
const useBlockTime = require('~/hooks/useBlockTime');
const useConstants = require('~/hooks/useConstants');
const useLot = require('~/hooks/useLot');
const useStore = require('~/hooks/useStore');
const {
  getCoreSamplingCrewBonuses,
  getExtractorLots,
  getLotResourceAbundances,
  planCoreSamplingBatch
} = require('~/lib/coreSamplingBatch');
const { hasStarterCoreSampleEntitlement } = require('~/lib/starterPacks');
const useAccessibleAsteroidInventories = require('~/hooks/useAccessibleAsteroidInventories');
const useAsteroid = require('~/hooks/useAsteroid');
const useAsteroidBuildings = require('~/hooks/useAsteroidBuildings');
const useCrewContext = require('~/hooks/useCrewContext');
const { ActionDialogFooter } = require('./components');

const execute = jest.fn();

// minimal theme: only the keys referenced by the dialog's styled components
const theme = { colors: { main: '#ffffff', orange: '#ffa500' }, cursors: { active: 'pointer', default: 'default' } };

const renderDialog = () => render(
  <ThemeProvider theme={theme}>
    <ChainTransactionContext.Provider value={{ execute }}>
      <CoreSampling onClose={() => {}} />
    </ChainTransactionContext.Provider>
  </ThemeProvider>
);

// the dialog renders one add dropdown per extractor; the last render's set ends
// with the extractors in display order (#10, #11 own)
const addDropdowns = () => Dropdown.mock.calls.slice(-2).map(([props]) => props);

const queueJob = (extractorIndex, resourceId) => {
  act(() => {
    addDropdowns()[extractorIndex].onChange({ value: resourceId });
  });
};

const removeButtons = () => (
  screen.getAllByRole('button').filter((button) => button !== screen.getByTestId('go'))
);

const footerProps = () => ActionDialogFooter.mock.calls.at(-1)[0];

const drillInventory = {
  id: 50,
  label: 2,
  Location: { locations: [{ label: 1, id: 200 }] },
  Inventories: [{ slot: 1, contents: [{ product: 175, amount: 5 }] }]
};
const crew = { id: 9, _location: { asteroidId: 7, lotId: 200, lotIndex: 15 }, Crew: { readyAt: 1200 } };
const plannedJob = (lotId, resourceId) => ({
  lotId,
  lotIndex: lotId - 81,
  resourceId,
  drillSource: { id: 50, label: 2, slot: 1, lotIndex: 15 },
  duration: 2500,
  startTime: 1200,
  finishTime: 3700,
  hasDrillSource: true,
  isWithinBudget: true
});

beforeEach(() => {
  jest.clearAllMocks();
  useActionSubmission.mockReturnValue(undefined);
  useStore.mockImplementation((selector) => selector({ asteroids: { origin: 7 } }));
  useBlockTime.mockReturnValue(1000);
  useConstants.mockReturnValue({ data: 86400 });
  // deposits come from each lot, as in the "My Deposits" resources panel section
  useLot.mockImplementation((lotId) => ({ data: { id: lotId, deposits: [] } }));
  getCoreSamplingCrewBonuses.mockReturnValue({});
  getExtractorLots.mockReturnValue([
    { extractor: { id: 11, label: 2, Control: { controller: { id: 9 } } }, lotId: 101, lotIndex: 20, distance: 5 },
    { extractor: { id: 12, label: 2, Control: { controller: { id: 99 } } }, lotId: 102, lotIndex: 30, distance: 20 },
    { extractor: { id: 10, label: 2, Control: { controller: { id: 9 } } }, lotId: 100, lotIndex: 10, distance: 7 }
  ]);
  getLotResourceAbundances.mockReturnValue([{ i: 3, abundance: 0.9 }, { i: 1, abundance: 0.4 }]);
  hasStarterCoreSampleEntitlement.mockReturnValue(false);
  useAsteroid.mockReturnValue({ data: { id: 7 }, isLoading: false });
  useAsteroidBuildings.mockReturnValue({ data: [{ id: 11 }, { id: 12 }, { id: 10 }], isLoading: false });
  useCrewContext.mockReturnValue({ accountCrewIds: [9], crew });
  useAccessibleAsteroidInventories.mockReturnValue({ data: [drillInventory], checking: false, isLoading: false });
  execute.mockImplementation(() => Promise.resolve({ status: 'submitted' }));
  ActionDialogFooter.mockImplementation(({ onGo }) => <button data-testid="go" onClick={onGo} />);
  // like the real planner, per-job input fields (e.g. depositId) ride along
  planCoreSamplingBatch.mockImplementation(({ jobs }) => ({
    jobs: jobs.map((job, i) => ({ ...job, ...plannedJob(job.lotId, job.resourceId), startTime: 1200 + i * 2500 })),
    startTime: 1200,
    finishTime: 1200 + jobs.length * 2500,
    isWithinBudget: true
  }));
});

test('lists only the player\'s own extractors, sorted by name with distance', () => {
  const { container } = renderDialog();
  const text = container.textContent;
  expect(text).toContain('Crew #9');
  expect(text).toContain('Your Extractors');
  // only own extractors (#10, #11) are shown; the other player's (#12) is excluded
  expect(text).not.toContain('Building #12');
  expect(text.indexOf('Building #10')).toBeLessThan(text.indexOf('Building #11'));
  expect(text).toContain('7km away');
  expect(text).toContain('5km away');
  expect(text).not.toContain('20km');
});

test('the add dropdown is labeled with the resources icon and offers lot resources', () => {
  renderDialog();
  const [first] = addDropdowns();
  expect(first.initialSelection).toBe(null);
  // the pseudo-option only carries the resources icon
  expect(first.options[0]).toMatchObject({ value: null, label: '' });
  expect(first.options[0].icon).toBeTruthy();
  expect(first.options.map(({ value, label }) => ({ value, label }))).toEqual([
    { value: null, label: '' },
    { value: 3, label: 'Ice' },
    { value: 1, label: 'Iron' }
  ]);
});

test('queues multiple samplings per extractor and submits them in a single bulk transaction', async () => {
  const { container } = renderDialog();

  // first extractor is Building #10 (lot 100); queue two samplings on it
  queueJob(0, 3);
  expect(container.textContent).toContain('1 sample queued');
  queueJob(0, 1);
  expect(container.textContent).toContain('2 samples queued');
  expect(screen.getAllByText('~2500s')).toHaveLength(2);

  // ...and one more on the second own extractor, Building #11 (lot 101)
  queueJob(1, 3);
  expect(screen.getAllByText('~2500s')).toHaveLength(3);

  fireEvent.click(screen.getByTestId('go'));
  await Promise.resolve();

  expect(execute).toHaveBeenCalledWith('BulkSampleDepositStart', {
    caller_crew: { id: crew.id, label: 3 },
    samplingCalls: [
      { key: 'SampleDepositStart', vars: expect.objectContaining({ lot: { id: 100, label: 1 }, resource: 3 }) },
      { key: 'SampleDepositStart', vars: expect.objectContaining({ lot: { id: 100, label: 1 }, resource: 1 }) },
      { key: 'SampleDepositStart', vars: expect.objectContaining({ lot: { id: 101, label: 1 }, resource: 3 }) }
    ]
  });
  expect(footerProps().goLabel).toBe('Start 3 Core Samples');
});

test.each(['denied', 'unresolved', 'submitted'])('keeps queued samplings when batch execution is %s', async (status) => {
  execute.mockResolvedValue({ status });
  const { container } = renderDialog();
  queueJob(0, 3);

  await act(async () => {
    fireEvent.click(screen.getByTestId('go'));
    await Promise.resolve();
  });

  expect(container.textContent).toContain('Ice');
  expect(container.textContent).toContain('Samplings planned: 1');
});

test('clears queued samplings after batch execution is indexed', async () => {
  execute.mockResolvedValue({ status: 'indexed' });
  const { container } = renderDialog();
  queueJob(0, 3);

  await act(async () => {
    fireEvent.click(screen.getByTestId('go'));
    await Promise.resolve();
  });

  expect(container.textContent).not.toContain('Ice');
  expect(container.textContent).toContain('Samplings planned: 0');
});

test('queued samplings show a fixed resource and can be removed', async () => {
  const { container } = renderDialog();
  queueJob(0, 3);
  queueJob(0, 1);

  expect(container.textContent).toContain('Ice (90%)');
  expect(container.textContent).toContain('Iron (40%)');

  // remove the first queued job on the active extractor
  fireEvent.click(removeButtons()[0]);

  fireEvent.click(screen.getByTestId('go'));
  await Promise.resolve();

  expect(execute).toHaveBeenCalledWith('BulkSampleDepositStart', {
    caller_crew: { id: crew.id, label: 3 },
    samplingCalls: [
      { key: 'SampleDepositStart', vars: expect.objectContaining({ lot: { id: 100, label: 1 }, resource: 1 }) }
    ]
  });
  expect(footerProps().goLabel).toBe('Start 1 Core Sample');
});

test('offers the crew\'s unused core samples for improvement', async () => {
  useLot.mockImplementation((lotId) => ({
    data: {
      id: lotId,
      deposits: lotId === 100 ? [
        // unused analyzed sample on the first extractor's lot
        { id: 60, Control: { controller: { id: 9 } }, Deposit: { status: 2, resource: 1, initialYield: 5000, remainingYield: 5000, finishTime: 500 } },
        // partially used samples are not offered
        { id: 61, Control: { controller: { id: 9 } }, Deposit: { status: 2, resource: 3, initialYield: 4000, remainingYield: 3000, finishTime: 500 } },
        // unanalyzed samples are not offered
        { id: 62, Control: { controller: { id: 9 } }, Deposit: { status: 1, resource: 3, initialYield: 0, remainingYield: 0 } },
        // other players' samples are not offered
        { id: 63, Control: { controller: { id: 99 } }, Deposit: { status: 2, resource: 1, initialYield: 5000, remainingYield: 5000, finishTime: 500 } }
      ] : []
    }
  }));
  const { container } = renderDialog();
  expect(container.textContent).toContain('1 sample available');
  expect(container.textContent).not.toContain('0 samples available');

  // first extractor renders both dropdowns: improve first, then sample
  const [improveDropdown] = Dropdown.mock.calls.slice(-3).map(([props]) => props);
  expect(improveDropdown.options.map(({ value, label }) => ({ value, label }))).toEqual([
    { value: null, label: '' },
    { value: 60, label: 'Iron (5t)' }
  ]);

  act(() => improveDropdown.onChange({ value: 60, resourceId: 1 }));
  expect(container.textContent).toContain('Iron (improvement)');
  expect(container.textContent).not.toContain('0 samples available');

  // the queued deposit is no longer offered for improvement
  // after queuing, only the sample dropdowns remain rendered
  const remaining = Dropdown.mock.calls.slice(-2).map(([props]) => props);
  expect(remaining).toHaveLength(2);
  expect(remaining.filter((props) => props.options.some((o) => o.value === 60))).toHaveLength(0);

  fireEvent.click(screen.getByTestId('go'));
  await Promise.resolve();

  expect(execute).toHaveBeenCalledWith('BulkSampleDepositStart', {
    caller_crew: { id: crew.id, label: 3 },
    samplingCalls: [
      {
        key: 'SampleDepositImprove',
        vars: expect.objectContaining({
          deposit: { id: 60, label: 4 },
          lot: { id: 100, label: 1 }
        })
      }
    ]
  });
  expect(footerProps().goLabel).toBe('Start 1 Core Sample');
});

test('disables submission while any job exceeds the crew availability', () => {
  planCoreSamplingBatch.mockImplementation(({ jobs }) => ({
    jobs: jobs.map((job, i) => ({ ...plannedJob(job.lotId, job.resourceId), isWithinBudget: i === 0 })),
    startTime: 1200,
    finishTime: 91000,
    isWithinBudget: jobs.length < 2
  }));
  renderDialog();
  queueJob(0, 3);
  queueJob(0, 1);

  expect(screen.getByTestId('warning').textContent).toContain('Exceeds 24h crew availability');
  expect(footerProps().disabled).toBe(true);
});

test('counts all unfinished jobs: running or scheduled, before and during this batch', () => {
  // lot deposits include scheduled jobs too (no yield yet), as in "My Deposits"
  useLot.mockImplementation((lotId) => ({
    data: {
      id: lotId,
      deposits: lotId === 101 ? [
        { id: 70, Control: { controller: { id: 9 } }, Deposit: { status: 1 } },
        { id: 71, Control: { controller: { id: 9 } }, Deposit: { status: 2, finishTime: 90000 } }
      ] : []
    }
  }));
  renderDialog();

  // pre-existing unfinished samplings on lot 101
  expect(screen.getByText('5km away · 2 samples queued')).toBeTruthy();

  // queuing another job on that extractor adds to the tally
  queueJob(1, 3);
  expect(screen.getByText('5km away · 3 samples queued')).toBeTruthy();

  // every extractor still allows queuing jobs
  addDropdowns().forEach((props) => expect(props.disabled).toBe(false));
});
