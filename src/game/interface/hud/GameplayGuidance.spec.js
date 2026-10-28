const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder; global.TextDecoder = TextDecoder;
jest.mock('~/hooks/actionManagers/useColonizationMissionManager', () => jest.fn(), { virtual: true });
jest.mock('~/lib/colonizationMissions', () => ({ colonizationPresentation: { name: 'Colonization' } }), { virtual: true });
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
const { gameplayGuides } = require('~/lib/missionGuidance');
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
  const { pages } = gameplayGuides.land;
  store.missionGuidance = { scope: 'campaign-scope', topic: 'land', missionId: 0, objectiveIndex: 0 };
  useCrewContext.mockReturnValue({ crew: { Crew: { readyAt: 200 } } });
  const rendered = renderGuide();
  expect(screen.getByText(pages[0])).toBeVisible();
  for (let page = 1; page < pages.length; page++) fireEvent.click(screen.getByText('Next'));
  expect(screen.getByText(pages[pages.length - 1])).toBeVisible();
  fireEvent.click(screen.getByText('Next'));
  expect(screen.getByRole('status')).toHaveTextContent('work underway');
  useCrewContext.mockReturnValue({ crew: { Crew: { readyAt: 0 } } });
  rendered.rerender(<ThemeProvider theme={{}}><GameplayGuidance /></ThemeProvider>);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByText(pages[pages.length - 1])).toBeVisible();
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

const useColonyManager = require('~/hooks/actionManagers/useColonizationMissionManager');
const colonyContext = { kind: 'colonization', campaign: 'colony', subject: { label: 1, id: '99' },
  subjectName: 'Asteroid #99', scope: 'colony-scope', topic: 'scan_colony', missionId: 0, objectiveIndex: 1 };
const setupColony = () => {
  store.missionGuidance = { ...colonyContext };
  useMissionScope.mockImplementation((campaign, subject) => subject ? 'colony-scope' : 'campaign-scope');
  useColonyManager.mockReturnValue({ data: { active: true, campaign: 'colony', missions: [
    { id: 0, title: 'Claim a New World', key: 'CLAIM_A_NEW_WORLD', accepted: true }
  ] }, getPending: () => null });
};

test('colonization guidance highlights scans and returns to details for the same asteroid', () => {
  setupColony();
  const { rerender } = renderGuide();
  expect(useColonyManager).toHaveBeenCalledWith('99');
  expect(store.dispatchCoachmarks).toHaveBeenLastCalledWith({ hudMenuMyAssets: true });
  fireEvent.click(screen.getByText('Mission details'));
  const details = store.dispatchMissionDetails.mock.calls.slice(-1)[0][0];
  expect(details).toMatchObject({ kind: 'colonization', subject: colonyContext.subject, campaign: 'colony', id: 0 });
  fireEvent.click(screen.getByText('Next'));
  expect(store.dispatchCoachmarks).toHaveBeenLastCalledWith({ actionButtonScanAsteroid: true });
  fireEvent.click(screen.getByText('Next'));
  expect(store.dispatchCoachmarks).toHaveBeenLastCalledWith({ actionButtonScanAsteroid: true });
  store.missionDetails = details;
  store.missionGuidance = null;
  rerender(<ThemeProvider theme={{}}><GameplayGuidance /></ThemeProvider>);
  expect(screen.getByText('Details: Claim a New World')).toBeInTheDocument();
});

test('colonization enrollment guidance works before choosing an asteroid', () => {
  setupColony();
  store.missionGuidance = { ...colonyContext, campaign: undefined, subject: { label: 1, id: null }, topic: 'enroll_colony' };
  useColonyManager.mockReturnValue({ getPending: () => null });
  renderGuide();
  expect(screen.getByText(/Accept this mission before starting/)).toBeInTheDocument();
  fireEvent.click(screen.getByText('Next'));
  expect(screen.getByText(/Hello again, Lea here/)).toBeInTheDocument();
  expect(store.dispatchMissionGuidance).not.toHaveBeenCalledWith(null);
});

test('a changed colony campaign clears guidance instead of showing another campaign’s mission', () => {
  setupColony();
  useColonyManager.mockReturnValue({ data: { campaign: 'changed' } });
  const { container } = renderGuide();
  expect(container).toBeEmptyDOMElement();
  expect(store.dispatchMissionGuidance).toHaveBeenCalledWith(null);
});

test('docking guidance highlights the registered landing and docking action', () => {
  setupColony();
  store.missionGuidance.topic = 'dock_ship';
  renderGuide();
  fireEvent.click(screen.getByText('Next'));
  fireEvent.click(screen.getByText('Next'));
  expect(store.dispatchCoachmarks).toHaveBeenLastCalledWith({ actionButtonLandShip: true });
});

test('starter guidance previews begin with an acceptance reminder and keep highlights aligned', () => {
  view.missions[0].accepted = false;
  store.missionGuidance = { scope: 'campaign-scope', topic: 'land', missionId: 0, objectiveIndex: 0 };
  renderGuide();
  expect(screen.getByText(/Accept this mission before starting/)).toBeInTheDocument();
  expect(store.dispatchCoachmarks).toHaveBeenLastCalledWith({});
  fireEvent.click(screen.getByText('Next'));
  expect(screen.queryByText(/Accept this mission before starting/)).not.toBeInTheDocument();
  expect(store.dispatchCoachmarks).toHaveBeenLastCalledWith({ hudCrewLocation: true });
  fireEvent.click(screen.getByText('Back'));
  expect(screen.getByText(/Accept this mission before starting/)).toBeInTheDocument();
  expect(store.dispatchCoachmarks).toHaveBeenLastCalledWith({});
  fireEvent.click(screen.getByText('Mission details'));
  expect(store.dispatchMissionDetails).toHaveBeenCalledWith({ scope: 'campaign-scope', id: 0 });
});
