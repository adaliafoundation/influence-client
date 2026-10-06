jest.mock('~/lib/starterCampaign', () => jest.requireActual('../../../lib/starterCampaign'), { virtual: true });
const React = require('react');
const { render, screen, fireEvent } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { ThemeProvider } = require('styled-components');
const create = require('zustand').default;

jest.mock('react-router-dom', () => ({ Link: ({ children }) => <span>{children}</span> }));
jest.mock('~/components/Icons', () => Object.fromEntries(['EyeIcon', 'FinishAllIcon', 'LoggedEventsIcon', 'TargetIcon'].map(name => [name, () => <span />])), { virtual: true });
jest.mock('~/components/AnimatedIcons', () => ({ ReadyIcon: () => <span /> }), { virtual: true });
jest.mock('~/lib/actionItem', () => ({ itemColors: { ready: '0,255,0', unready: '0,100,255' }, backgroundColors: { ready: '0,100,0', unready: '0,0,100' } }), { virtual: true });
jest.mock('~/components/ButtonLoadingBar', () => ({ __esModule: true, default: () => <span data-testid="finish-progress" /> }), { virtual: true });
jest.mock('~/hooks/useTransactionSubmission', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('~/components/CollapsibleSection', () => ({ __esModule: true, default: ({ title, children, initiallyClosed, onCollapsedChange }) => {
  const React = require('react');
  const [closed, setClosed] = React.useState(initiallyClosed);
  React.useEffect(() => { onCollapsedChange(closed); }, [closed]);
  return <section>{title}<button onClick={() => setClosed(!closed)}>Toggle objectives</button>{!closed && children}</section>;
} }), { virtual: true });
jest.mock('~/contexts/ChainTransactionContext', () => ({ __esModule: true, default: require('react').createContext() }), { virtual: true });
jest.mock('~/hooks/useActionItems', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('~/hooks/useActionItemTransitions', () => jest.requireActual('../../../hooks/useActionItemTransitions'), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => ({ __esModule: true, default: () => ({ crew: { id: 1, label: 1, Crew: { readyAt: 0 } } }) }), { virtual: true });
jest.mock('~/hooks/useGetActivityConfig', () => ({ __esModule: true, default: () => item => ({ getActionItemFinishCall: () => ({ activity: item.uniqueKey }) }) }), { virtual: true });
jest.mock('~/hooks/useSession', () => ({ __esModule: true, default: () => ({ authenticated: true, blockTime: 100 }) }), { virtual: true });
jest.mock('~/hooks/useStore', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('~/hooks/useSimulationEnabled', () => ({ __esModule: true, default: () => false }), { virtual: true });
jest.mock('~/hooks/actionManagers/useStarterMissionManager', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('~/hooks/useMissionGuidance', () => ({ __esModule: true, default: () => jest.fn(), useMissionScope: jest.fn() }), { virtual: true });
jest.mock('~/lib/missionObjectives', () => jest.requireActual('../../../lib/missionObjectives'), { virtual: true });
jest.mock('~/lib/missionPresentation', () => ({ getMissionObjectives: () => [] }), { virtual: true });
jest.mock('~/theme', () => ({ hexToRGB: () => '0, 100, 200' }), { virtual: true });
jest.mock('./ActionItem', () => {
  const styled = require('styled-components').default;
  return { __esModule: true, default: ({ data }) => <div>{data.uniqueKey}</div>,
    ActionItemRow: styled.div``, ActionItemIcon: styled.div``, ITEM_WIDTH: 425, TRANSITION_TIME: 0 };
});

const useTransactionSubmission = require('~/hooks/useTransactionSubmission').default;
const useStore = require('~/hooks/useStore').default;
const useActionItems = require('~/hooks/useActionItems').default;
const useManager = require('~/hooks/actionManagers/useStarterMissionManager').default;
const { useMissionScope } = require('~/hooks/useMissionGuidance');
const Context = require('~/contexts/ChainTransactionContext').default;
const ActionItems = require('./ActionItems').default;
let state, execute, view;
const theme = { colors: { success: '#00aa00', mainRGB: '0,100,200', main: '#0088aa' }, cursors: { active: 'pointer' } };
const mount = (transaction = {}) => render(<ThemeProvider theme={theme}><Context.Provider value={{ execute, getStatus: () => null, ...transaction }}><ActionItems /></Context.Provider></ThemeProvider>);

beforeEach(() => {
  execute = jest.fn();
  useTransactionSubmission.mockReturnValue({ busy: false, run: action => action() });
  state = create(set => ({ objectivePreferences: {}, dispatchUnhideAllActionItems: jest.fn(), dispatchMissionDetails: jest.fn(), dispatchLauncherPage: jest.fn(),
    dispatchObjectivePreferences: (scope, patch) => set(s => ({ objectivePreferences: {
      ...s.objectivePreferences, [scope]: { ...s.objectivePreferences[scope], ...patch }
    } })) }));
  useStore.mockImplementation(selector => state(selector));
  useMissionScope.mockReturnValue('crew-1');
  useActionItems.mockReturnValue({ allVisibleItems: [] });
  view = { active: true, eligible: true, missions: [{ id: 0, title: 'Make Landfall', canAccept: true }] };
  useManager.mockImplementation(() => ({ data: view, getPending: () => null }));
});

test('an eligible new crew sees an expanded starter invitation in All', () => {
  mount();
  expect(screen.getByText('Begin campaign: Your Foothold in Adalia')).toBeVisible();
  fireEvent.click(screen.getByText('Show details'));
  expect(state.getState().dispatchLauncherPage).toHaveBeenCalledWith('missions', 'starter');
  expect(state.getState().dispatchMissionDetails).not.toHaveBeenCalled();
});

test('acceptance moves the invitation from Ready to an active mission in In Progress without another action', () => {
  const rendered = mount();
  fireEvent.click(screen.getByText('Ready'));
  expect(screen.getByText('Begin campaign: Your Foothold in Adalia')).toBeVisible();
  view = { ...view, missions: [{ id: 0, title: 'Make Landfall', accepted: true }] };
  rendered.rerender(<ThemeProvider theme={theme}><Context.Provider value={{ execute, getStatus: () => null }}><ActionItems /></Context.Provider></ThemeProvider>);
  expect(screen.queryByText('Begin campaign: Your Foothold in Adalia')).not.toBeInTheDocument();
  expect(screen.queryByText('Mission: Make Landfall')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('In Progress'));
  expect(screen.getByText('Mission: Make Landfall')).toBeVisible();
  expect(screen.queryByText(/crew busy|view requirements|campaign warehouse/i)).not.toBeInTheDocument();
  expect(screen.queryByText('Show me how')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Show details'));
  expect(state.getState().dispatchMissionDetails).toHaveBeenCalledWith({ scope: 'crew-1', id: 0 });
});

test('collapse preferences survive remounting without affecting another crew', () => {
  const first = mount();
  fireEvent.click(screen.getByText('In Progress'));
  fireEvent.click(screen.getByText('Toggle objectives'));
  first.unmount();
  expect(state.getState().objectivePreferences['crew-1']).toEqual({ collapsed: true });
  const second = mount();
  expect(screen.queryByText('Begin campaign: Your Foothold in Adalia')).not.toBeInTheDocument();
  second.unmount();
  useMissionScope.mockReturnValue('crew-2');
  mount();
  expect(screen.getByText('Begin campaign: Your Foothold in Adalia')).toBeVisible();
});

test('Finish All sends only activity calls even with a claimable mission in Ready', () => {
  useActionItems.mockReturnValue({ allVisibleItems: [
    { uniqueKey: 'activity-1', type: 'ready', category: 'activity' },
    { uniqueKey: 'activity-2', type: 'ready', category: 'activity' }
  ] });
  view.missions = [{ id: 0, title: 'Make Landfall', accepted: true, claimable: true }];
  mount();
  fireEvent.click(screen.getByText('Finish All Ready Items'));
  expect(execute).toHaveBeenCalledWith('FinishAllReady', { finishCalls: [{ activity: 'activity-1' }, { activity: 'activity-2' }] });
});

test.each([
  ['pending transaction', { getStatus: () => 'pending' }, false],
  ['submission awaiting indexing', {}, true]
])('Finish All stays visible and blocks repeat clicks during %s', (_, transaction, busy) => {
  useTransactionSubmission.mockReturnValue({ busy, run: action => action() });
  // A pending batch remains visible even after its ready items disappear.
  if (busy) useActionItems.mockReturnValue({ allVisibleItems: [
    { uniqueKey: 'activity-1', type: 'ready', category: 'activity' },
    { uniqueKey: 'activity-2', type: 'ready', category: 'activity' }
  ] });
  mount(transaction);
  const button = screen.getByRole('button', { name: 'Finish All Ready Items' });
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByTestId('finish-progress')).toBeVisible();
  fireEvent.click(button);
  expect(execute).not.toHaveBeenCalled();
});

test('All is first and selected on every crew switch, including returning to a crew', () => {
  useActionItems.mockReturnValue({ allVisibleItems: [
    { uniqueKey: 'ready-item', type: 'ready', category: 'activity' },
    { uniqueKey: 'progress-item', type: 'unready', category: 'activity' }
  ] });
  state.getState().dispatchObjectivePreferences('crew-2', { filter: 'ready' });
  const rendered = mount();
  expect(screen.getByText('All').nextElementSibling).toBe(screen.getByText('Ready'));
  expect(screen.getByText('ready-item')).toBeVisible();
  expect(screen.getByText('progress-item')).toBeVisible();
  fireEvent.click(screen.getByText('Ready'));
  expect(screen.queryByText('progress-item')).not.toBeInTheDocument();

  for (const scope of ['crew-2', 'crew-1']) {
    useMissionScope.mockReturnValue(scope);
    rendered.rerender(<ThemeProvider theme={theme}><Context.Provider value={{ execute, getStatus: () => null }}><ActionItems /></Context.Provider></ThemeProvider>);
    expect(screen.getByText('ready-item')).toBeVisible();
    expect(screen.getByText('progress-item')).toBeVisible();
    fireEvent.click(screen.getByText('Ready'));
    expect(screen.queryByText('progress-item')).not.toBeInTheDocument();
  }
});
