const React = require('react');
const { render, screen, fireEvent } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { ThemeProvider } = require('styled-components');
const create = require('zustand').default;

jest.mock('react-router-dom', () => ({ Link: ({ children }) => <span>{children}</span> }));
jest.mock('~/components/Icons', () => Object.fromEntries(['BellIcon', 'EyeIcon', 'FinishAllIcon', 'LoggedEventsIcon', 'TargetIcon'].map(name => [name, () => <span />])), { virtual: true });
jest.mock('~/components/AnimatedIcons', () => ({ ReadyIcon: () => <span /> }), { virtual: true });
jest.mock('~/lib/actionItem', () => ({ itemColors: { ready: '0,255,0', unready: '0,100,255' }, backgroundColors: { ready: '0,100,0', unready: '0,0,100' } }), { virtual: true });
jest.mock('~/components/ButtonAlt', () => ({ __esModule: true, default: ({ children, onClick }) => <button onClick={onClick}>{children}</button> }), { virtual: true });
jest.mock('~/components/CollapsibleSection', () => ({ __esModule: true, default: ({ title, children, initiallyClosed, onCollapsedChange }) => {
  const React = require('react');
  const [closed, setClosed] = React.useState(initiallyClosed);
  React.useEffect(() => { onCollapsedChange(closed); }, [closed]);
  return <section>{title}<button onClick={() => setClosed(!closed)}>Toggle objectives</button>{!closed && children}</section>;
} }), { virtual: true });
jest.mock('~/contexts/ChainTransactionContext', () => ({ __esModule: true, default: require('react').createContext() }), { virtual: true });
jest.mock('~/hooks/useActionItems', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
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

const useStore = require('~/hooks/useStore').default;
const useActionItems = require('~/hooks/useActionItems').default;
const useManager = require('~/hooks/actionManagers/useStarterMissionManager').default;
const { useMissionScope } = require('~/hooks/useMissionGuidance');
const Context = require('~/contexts/ChainTransactionContext').default;
const ActionItems = require('./ActionItems').default;
let state, execute, view;
const theme = { colors: { success: '#00aa00', mainRGB: '0,100,200', main: '#0088aa' }, cursors: { active: 'pointer' } };
const mount = () => render(<ThemeProvider theme={theme}><Context.Provider value={{ execute, getStatus: () => null }}><ActionItems /></Context.Provider></ThemeProvider>);

beforeEach(() => {
  execute = jest.fn();
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

test('an eligible new crew sees an expanded starter invitation in Ready', () => {
  mount();
  expect(screen.getByText('Begin your starter campaign')).toBeVisible();
  fireEvent.click(screen.getByText('Show details'));
  expect(state.getState().dispatchLauncherPage).toHaveBeenCalledWith('missions', 'starter');
  expect(state.getState().dispatchMissionDetails).not.toHaveBeenCalled();
});

test('acceptance moves the invitation from Ready to an active mission in In Progress without another action', () => {
  const rendered = mount();
  expect(screen.getByText('Begin your starter campaign')).toBeVisible();
  view = { ...view, missions: [{ id: 0, title: 'Make Landfall', accepted: true }] };
  rendered.rerender(<ThemeProvider theme={theme}><Context.Provider value={{ execute, getStatus: () => null }}><ActionItems /></Context.Provider></ThemeProvider>);
  expect(screen.queryByText('Begin your starter campaign')).not.toBeInTheDocument();
  expect(screen.queryByText('Mission: Make Landfall')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('In Progress'));
  expect(screen.getByText('Mission: Make Landfall')).toBeVisible();
  expect(screen.queryByText(/crew busy|view requirements|campaign warehouse/i)).not.toBeInTheDocument();
  expect(screen.queryByText('Show me how')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Show details'));
  expect(state.getState().dispatchMissionDetails).toHaveBeenCalledWith({ scope: 'crew-1', id: 0 });
});

test('collapse and tab preferences survive remounting without affecting another crew', () => {
  const first = mount();
  fireEvent.click(screen.getByText('In Progress'));
  fireEvent.click(screen.getByText('Toggle objectives'));
  first.unmount();
  expect(state.getState().objectivePreferences['crew-1']).toEqual({ filter: 'progress', collapsed: true });
  const second = mount();
  expect(screen.queryByText('Begin your starter campaign')).not.toBeInTheDocument();
  second.unmount();
  useMissionScope.mockReturnValue('crew-2');
  mount();
  expect(screen.getByText('Begin your starter campaign')).toBeVisible();
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
