jest.mock('~/lib/starterCampaign', () => jest.requireActual('../../../lib/starterCampaign'), { virtual: true });
const React = require('react');
const { render, screen, fireEvent } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { ThemeProvider } = require('styled-components');

jest.mock('~/components/ButtonAlt', () => ({ __esModule: true, default: ({ children, onClick }) => <button onClick={onClick}>{children}</button> }), { virtual: true });
jest.mock('./TutorialMessage', () => ({ __esModule: true, default: ({ step, onClose, onMinimize, isIn, leftButton, rightButton, messageRef }) => <section hidden={!isIn} ref={messageRef} tabIndex={-1}>
  <h3>{step.title}</h3><div>{step.content}</div><button aria-label="Close guidance" onClick={onClose}>X</button>
  {onMinimize && <button onClick={onMinimize}>Minimize guidance</button>}
  {leftButton && <button onClick={leftButton.onClick}>{leftButton.children}</button>}
  {rightButton && <button onClick={rightButton.onClick}>{rightButton.children}</button>}
</section> }));
jest.mock('./TutorialBubble', () => ({ __esModule: true, default: ({ isIn, onClick, setRef }) =>
  <button hidden={!isIn} onClick={onClick} ref={setRef}>Resume guidance</button> }));
jest.mock('~/game/launcher/components/MissionDialog', () => ({ __esModule: true, default: ({ mission }) => <div>Details: {mission.title}</div> }), { virtual: true });
jest.mock('~/hooks/useMissionGuidance', () => ({ __esModule: true, default: jest.fn(), useMissionScope: jest.fn() }), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('~/hooks/useSession', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('~/hooks/useSimulationEnabled', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('~/hooks/actionManagers/useStarterMissionManager', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('~/hooks/useStore', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('~/lib/missionGuidance', () => jest.requireActual('../../../lib/missionGuidance'), { virtual: true });

const useStore = require('~/hooks/useStore').default;
const useCrewContext = require('~/hooks/useCrewContext').default;
const useSession = require('~/hooks/useSession').default;
const useSimulationEnabled = require('~/hooks/useSimulationEnabled').default;
const useManager = require('~/hooks/actionManagers/useStarterMissionManager').default;
const { default: useGuidance, useMissionScope } = require('~/hooks/useMissionGuidance');
const GameplayGuidance = require('./GameplayGuidance').default;
let store, view, start;
const renderGuide = () => render(<ThemeProvider theme={{}}><GameplayGuidance /></ThemeProvider>);

beforeEach(() => {
  start = jest.fn();
  store = { graphics: {}, actionDialog: {}, objectivePreferences: {}, dispatchCoachmarks: jest.fn(),
    dispatchMissionGuidance: jest.fn(), dispatchMissionDetails: jest.fn(), dispatchObjectivePreferences: jest.fn() };
  view = { campaign: 'campaign', eligible: true, progress: {}, missions: [{ id: 0, key: 'MAKE_LANDFALL', title: 'Make Landfall', accepted: true }] };
  useStore.mockImplementation(selector => selector(store));
  useCrewContext.mockReturnValue({ crew: { id: 1, Crew: { readyAt: 0 } } });
  useSession.mockReturnValue({ authenticated: true, blockTime: 100 });
  useSimulationEnabled.mockReturnValue(false);
  useManager.mockImplementation(() => ({ data: view, getPending: () => null }));
  useMissionScope.mockImplementation(campaign => campaign ? 'campaign-scope' : 'general-scope');
  useGuidance.mockReturnValue(start);
});

test('first acceptance offers help without starting it, and dismissal is scoped', () => {
  renderGuide();
  expect(screen.getByText('Your first mission')).toBeVisible();
  expect(start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('No thanks'));
  expect(store.dispatchObjectivePreferences).toHaveBeenCalledWith('campaign-scope', { guidanceOffered: true });
});

test('Show me how explicitly launches guidance after acceptance', () => {
  renderGuide();
  fireEvent.click(screen.getByText('Show me how'));
  expect(start).toHaveBeenCalledWith(view.missions[0]);
});

test('guidance remains open during and after timers until explicitly closed', () => {
  store.missionGuidance = { scope: 'campaign-scope', topic: 'land', missionId: 0, objectiveIndex: 0 };
  useCrewContext.mockReturnValue({ crew: { Crew: { readyAt: 200 } } });
  const rendered = renderGuide();
  expect(screen.getByText(/Click the location pin/)).toBeVisible();
  for (let page = 0; page < 4; page++) fireEvent.click(screen.getByText('Next'));
  expect(screen.getByText(/Planning is enough/)).toBeVisible();
  fireEvent.click(screen.getByText('Next'));
  expect(screen.getByRole('status')).toHaveTextContent('work underway');
  useCrewContext.mockReturnValue({ crew: { Crew: { readyAt: 0 } } });
  rendered.rerender(<ThemeProvider theme={{}}><GameplayGuidance /></ThemeProvider>);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByText(/Planning is enough/)).toBeVisible();
  expect(store.dispatchMissionGuidance).not.toHaveBeenCalled();
  expect(screen.queryByText('Next')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Close guidance' })).toBeVisible();
  fireEvent.click(screen.getByText('Close'));
  expect(store.dispatchMissionGuidance).toHaveBeenCalledWith(null);
});

test('general help is available without campaign eligibility', () => {
  view.eligible = false;
  store.missionGuidance = { scope: 'general-scope', topic: 'sample' };
  renderGuide();
  expect(screen.getByText('Prospect the surface')).toBeVisible();
});

test('crew/campaign changes clear stale mission guidance and details', () => {
  store.missionGuidance = { scope: 'old-scope', topic: 'land', missionId: 0 };
  store.missionDetails = { scope: 'old-scope', id: 0 };
  renderGuide();
  expect(store.dispatchMissionGuidance).toHaveBeenCalledWith(null);
  expect(store.dispatchMissionDetails).toHaveBeenCalledWith(null);
});

test('training suppresses post-purchase guidance and does not change training coachmarks', () => {
  useSimulationEnabled.mockReturnValue(true);
  const { container } = renderGuide();
  expect(container).toBeEmptyDOMElement();
  expect(store.dispatchCoachmarks).not.toHaveBeenCalled();
});

test('guidance highlights controls without dispatching asset selections', () => {
  store.missionGuidance = { scope: 'campaign-scope', topic: 'land', missionId: 0, objectiveIndex: 0 };
  renderGuide();
  expect(store.dispatchCoachmarks).toHaveBeenLastCalledWith({ hudCrewLocation: true });
  fireEvent.click(screen.getByText('Next'));
  expect(store.dispatchCoachmarks).toHaveBeenLastCalledWith({ hudMenuResources: true });
  fireEvent.click(screen.getByText('Next'));
  expect(store.dispatchCoachmarks).toHaveBeenLastCalledWith({ actionButtonLease: true });
  fireEvent.click(screen.getByText('Next'));
  expect(store.dispatchCoachmarks).toHaveBeenLastCalledWith({ actionButtonPlan: true });
  fireEvent.click(screen.getByText('Next'));
  expect(store.dispatchCoachmarks).toHaveBeenLastCalledWith({});
});

test('minimizing preserves the page and highlight, and the portrait restores focus', () => {
  store.missionGuidance = { scope: 'campaign-scope', topic: 'land', missionId: 0, objectiveIndex: 0 };
  renderGuide();
  fireEvent.click(screen.getByText('Next'));
  fireEvent.click(screen.getByRole('button', { name: 'Minimize guidance' }));
  expect(screen.getByText(/Open the Resources pane/)).not.toBeVisible();
  expect(screen.getByRole('button', { name: 'Resume guidance' })).toHaveFocus();
  expect(store.dispatchMissionGuidance).not.toHaveBeenCalled();
  expect(store.dispatchCoachmarks).toHaveBeenLastCalledWith({ hudMenuResources: true });
  fireEvent.click(screen.getByRole('button', { name: 'Resume guidance' }));
  expect(screen.getByText(/Open the Resources pane/)).toBeVisible();
  expect(screen.getByText('Choose your foothold').closest('section')).toHaveFocus();
  expect(screen.queryByRole('button', { name: 'Resume guidance' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close guidance' }));
  expect(store.dispatchMissionGuidance).toHaveBeenCalledWith(null);
});
