jest.mock('~/hooks/useMissionCampaigns', () => jest.fn(() => ({ data: { starter: true, colonization: true } })), { virtual: true });
jest.mock('~/hooks/useColonizationAsteroids', () => jest.fn(), { virtual: true });
jest.mock('react-popper', () => jest.requireActual('../../../compat/react-popper'), { virtual: true });
jest.mock('~/components/Dropdown', () => jest.requireActual('../../../components/Dropdown'), { virtual: true });
jest.mock('../../../components/ButtonAlt', () => require('~/components/ButtonAlt'));
jest.mock('~/assets/images/sales/asteroids_hero.png', () => 'asteroids_hero.png', { virtual: true });
jest.mock('~/components/WarningAlert', () => jest.requireActual('../../../components/WarningAlert'), { virtual: true });
jest.mock('~/theme', () => jest.requireActual('../../../theme'), { virtual: true });
jest.mock('~/lib/starterCampaign', () => jest.requireActual('../../../lib/starterCampaign'), { virtual: true });
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const React = require('react');
const { render, screen, fireEvent, within, act } = require('@testing-library/react');
require('@testing-library/jest-dom');
const userEvent = require('@testing-library/user-event').default;
const { ThemeProvider } = require('styled-components');
const { StarterMission } = require('@influenceth/sdk');

jest.mock('~/components/Icons', () => {
  const React = require('react');
  return Object.fromEntries(['WarningOutlineIcon','CheckIcon','HelpIcon','LockIcon','PlayIcon','SwayIcon','TargetIcon','ChevronDoubleDownIcon','ChevronDoubleUpIcon','ForwardIcon','RewardsIcon'].map(name => [name, () => React.createElement('svg', { 'aria-hidden': true })]));
}, { virtual: true });
jest.mock('~/components/ActionSubmissionProvider', () => ({ __esModule: true, default: ({ children }) => children }), { virtual: true });
jest.mock('~/components/ButtonAlt', () => ({ __esModule: true, default: ({ children, onClick, disabled, 'aria-label': label }) => <button aria-label={label} onClick={onClick} disabled={disabled}>{children}</button> }), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => ({ __esModule: true, default: () => ({ crew: { id: 501 } }) }), { virtual: true });
jest.mock('~/hooks/useSession', () => ({ __esModule: true, default: () => ({ authenticated: true }) }), { virtual: true });
jest.mock('~/hooks/useStore', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useSimulationEnabled', () => ({ __esModule: true, default: () => false }), { virtual: true });
jest.mock('~/hooks/actionManagers/useStarterMissionManager', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('~/hooks/useMissionGuidance', () => ({ __esModule: true, default: () => jest.fn() }), { virtual: true });
jest.mock('~/lib/assetUtils', () => ({ getLicensedAssetUrl: key => key }), { virtual: true });
jest.mock('~/lib/utils', () => ({ nativeBool: Boolean, reactBool: Boolean }), { virtual: true });
jest.mock('~/lib/starterMissionStories', () => jest.requireActual('../../../lib/starterMissionStories'), { virtual: true });
jest.mock('~/lib/spriteUtils', () => ({ useSpriteAtlases: jest.fn(), getBuildingSpriteStyle: jest.fn(), SPRITE_ATLAS_GROUPS: { buildings: [] } }), { virtual: true });
jest.mock('~/components/ResourceThumbnail', () => ({
  __esModule: true,
  default: ({ resource, tooltipContainer }) => <div role="img" aria-label={resource.name} data-tooltip-id={tooltipContainer} />,
  ResourceImage: () => <div />,
  ResourceThumbnailWrapper: ({ children, size, ...props }) => <div {...props}>{children}</div>
}), { virtual: true });
jest.mock('~/components/HeroLayout', () => jest.requireActual('../../../components/HeroLayout'), { virtual: true });
jest.mock('~/components/DetailsModal', () => ({ __esModule: true, default: ({ children, detailsProps }) => <div {...detailsProps}>{children}</div> }), { virtual: true });
jest.mock('~/components/GenericDialog', () => jest.requireActual('../../../components/GenericDialog'), { virtual: true });
jest.mock('~/components/Dialog', () => jest.requireActual('../../../components/Dialog'), { virtual: true });
jest.mock('~/components/Loader', () => jest.requireActual('../../../components/Loader'), { virtual: true });
jest.mock('~/components/NavIcon', () => jest.requireActual('../../../components/NavIcon'), { virtual: true });
jest.mock('~/lib/starterMissions', () => jest.requireActual('../../../lib/starterMissions'), { virtual: true });
jest.mock('~/lib/missionPresentation', () => jest.requireActual('../../../lib/missionPresentation'), { virtual: true });
jest.mock('~/assets/images/cursor.png', () => '', { virtual: true });
jest.mock('~/assets/images/cursor-active.png', () => '', { virtual: true });
jest.mock('~/components/InProgressIcon', () => jest.requireActual('../../../components/InProgressIcon'), { virtual: true });
const StarterCampaign = require('./MissionCampaign').default;
const theme = require('../../../theme').default;


jest.mock('~/hooks/useWalletAsteroids', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/actionManagers/useColonizationMissionManager', () => jest.fn(), { virtual: true });
jest.mock('~/lib/colonizationMissions', () => jest.requireActual('../../../lib/colonizationMissions'), { virtual: true });
const Missions = require('./StarterMissions').default;
const useStore = require('~/hooks/useStore');
const useWalletAsteroids = require('~/hooks/useWalletAsteroids');
const useColony = require('~/hooks/actionManagers/useColonizationMissionManager');
const useStarter = require('~/hooks/actionManagers/useStarterMissionManager').default;
const { ColonizationMission, Entity } = require('@influenceth/sdk');
const manager = { canManage: true, getPending: () => null, accept: jest.fn(), complete: jest.fn() };
beforeEach(() => {
  require('~/hooks/useMissionCampaigns').mockReturnValue({ data: { starter: true, colonization: true } });
  sessionStorage.clear();
  require('~/hooks/useColonizationAsteroids').mockImplementation(asteroids => ({ data: asteroids }));
  useStore.mockImplementation(selector => selector({ asteroids: { origin: 99 } }));
  useWalletAsteroids.mockReturnValue({ data: [{ id: 99 }, { id: 100 }] });
  useStarter.mockReturnValue({ ...manager, data: { active: true, eligible: true, campaign: '123', subject: { label: Entity.IDS.CREW, id: 501 },
    progress: {}, missions: Object.values(StarterMission.TYPES) } });
  useColony.mockImplementation(id => ({ ...manager, data: id ? { active: true, campaign: '124', subject: { label: Entity.IDS.ASTEROID, id },
    progress: { selectedBuildings: [] }, missions: Object.values(ColonizationMission.TYPES) } : undefined }));
});
const open = () => render(<ThemeProvider theme={theme}><Missions /></ThemeProvider>);
test('both campaigns are peer collapsible cards on one Missions page', () => {
  open();
  const starter = screen.getByRole('button', { name: /Your foothold/i });
  const colony = screen.getByRole('button', { name: /Campaign.*Colonization/i });
  expect(starter).toHaveAttribute('aria-expanded', 'false');
  expect(colony).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByRole('button', { name: 'Colony asteroid' })).toHaveTextContent('Select asteroid');
  fireEvent.click(starter);
  fireEvent.click(colony);
  expect(screen.getAllByRole('listitem')).toHaveLength(13);
  expect(screen.getByRole('button', { name: 'Colony asteroid' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Colony asteroid' }));
  fireEvent.click(screen.getByText('Asteroid #100'));
  expect(useColony).toHaveBeenLastCalledWith('100');
  expect(colony).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(colony);
  expect(screen.getAllByRole('listitem')).toHaveLength(8);
  expect(starter).toHaveAttribute('aria-expanded', 'true');
  expect(screen.queryByText('Colonization missions')).not.toBeInTheDocument();
});
test('Colonization remains expandable without an asteroid or indexed campaign', () => {
  useWalletAsteroids.mockReturnValue({ data: [] });
  useStore.mockImplementation(selector => selector({ asteroids: {} }));
  open();
  fireEvent.click(screen.getByRole('button', { name: /Campaign.*Colonization/i }));
  expect(screen.getAllByRole('listitem')).toHaveLength(5);
  expect(screen.queryByText(/Explore the five missions below/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Enroll an unscanned asteroid before/)).not.toBeInTheDocument();
});

test.each(['no asteroid', 'loading', 'error', 'inactive'])('all five mission details remain browsable with disabled actions: %s', state => {
  if (state === 'no asteroid') {
    useWalletAsteroids.mockReturnValue({ data: [] });
    useStore.mockImplementation(selector => selector({ asteroids: {} }));
  }
  useColony.mockReturnValue({ ...manager, isLoading: state === 'loading', isError: state === 'error',
    data: state === 'inactive' ? { active: false } : undefined });
  const { unmount } = open();
  fireEvent.click(screen.getByRole('button', { name: /Campaign.*Colonization/i }));
  const rows = screen.getAllByRole('listitem');
  expect(rows).toHaveLength(5);
  for (const row of rows) {
    fireEvent.click(within(row).getByRole('button'));
    const dialog = screen.getByRole('dialog');
    fireEvent.load(dialog.querySelector('img'));
    expect(within(dialog).getByRole('button', { name: 'Accept mission' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Complete mission' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: /close/i }));
  }
  unmount();
});

test('asteroid selection is explicit, independent of expansion, and remembered when reopening', () => {
  const first = open();
  expect(useColony).toHaveBeenLastCalledWith(undefined);
  fireEvent.click(screen.getByRole('button', { name: 'Colony asteroid' }));
  fireEvent.click(screen.getByText('Asteroid #100'));
  expect(screen.getByRole('button', { name: /Campaign.*Colonization/i })).toHaveAttribute('aria-expanded', 'false');
  first.unmount();
  open();
  expect(screen.getByRole('button', { name: 'Colony asteroid' })).toHaveTextContent('Asteroid #100');
  expect(useColony).toHaveBeenLastCalledWith('100');
  fireEvent.click(screen.getByRole('button', { name: /Campaign.*Colonization/i }));
  fireEvent.click(within(screen.getAllByRole('listitem')[0]).getByRole('button'));
  const dialog = screen.getByRole('dialog');
  fireEvent.load(dialog.querySelector('img'));
  expect(within(dialog).getByText('Asteroid #100')).toBeInTheDocument();
});

test('asteroid options use the shared menu above the launcher dialog', () => {
  open();
  fireEvent.click(screen.getByRole('button', { name: 'Colony asteroid' }));
  const option = screen.getByText('Asteroid #100');
  expect(option.parentElement.parentElement.parentElement).toHaveStyle({ zIndex: 10002 });
  fireEvent.click(option);
  expect(screen.getByRole('button', { name: 'Colony asteroid' })).toHaveTextContent('Asteroid #100');
});

test('only eligible or enrolled asteroids appear, and an excluded saved selection cannot submit', () => {
  sessionStorage.setItem('colonizationAsteroid', '99');
  require('~/hooks/useColonizationAsteroids').mockImplementation(asteroids => ({ data: asteroids.filter(a => a.id === '100') }));
  open();
  expect(useColony).toHaveBeenLastCalledWith(undefined);
  fireEvent.click(screen.getByRole('button', { name: 'Colony asteroid' }));
  expect(screen.queryByText('Asteroid #99')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Asteroid #100'));
  expect(useColony).toHaveBeenLastCalledWith('100');
});

test('every colonization preview displays its supplied brief without the starter crew warning', () => {
  const stories = Object.fromEntries(require('../../../lib/colonizationMissionContent.json').missions.map(mission => [mission.key, mission.brief]));
  open();
  fireEvent.click(screen.getByRole('button', { name: /Campaign.*Colonization/i }));
  const rows = screen.getAllByRole('listitem');
  for (const [index, mission] of Object.values(ColonizationMission.TYPES).entries()) {
    fireEvent.click(within(rows[index]).getByRole('button'));
    const dialog = screen.getByRole('dialog');
    fireEvent.load(dialog.querySelector('img'));
    expect(within(dialog).getByText(stories[mission.key][0])).toBeInTheDocument();
    expect(within(dialog).queryByText(require('../../../lib/starterCampaign').STARTER_CAMPAIGN_CREW_REQUIREMENT)).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /close/i }));
  }
});

test('on-chain activation controls campaign visibility independently of asteroid ownership', () => {
  const useCampaigns = require('~/hooks/useMissionCampaigns');
  useWalletAsteroids.mockReturnValue({ data: [] });
  useStore.mockImplementation(selector => selector({ asteroids: {} }));
  useCampaigns.mockReturnValue({ data: { starter: false, colonization: false } });
  const { rerender } = open();
  expect(screen.getByText('No active campaigns')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Campaign.*Colonization/i })).not.toBeInTheDocument();
  useCampaigns.mockReturnValue({ data: { starter: false, colonization: true } });
  rerender(<ThemeProvider theme={theme}><Missions /></ThemeProvider>);
  fireEvent.click(screen.getByRole('button', { name: /Campaign.*Colonization/i }));
  expect(screen.getAllByRole('listitem')).toHaveLength(5);
  expect(screen.queryByText('No active campaigns')).not.toBeInTheDocument();
  useCampaigns.mockReturnValue({ data: { starter: true, colonization: false } });
  rerender(<ThemeProvider theme={theme}><Missions /></ThemeProvider>);
  expect(screen.queryByRole('button', { name: /Campaign.*Colonization/i })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Your foothold/i })).toBeInTheDocument();
});
