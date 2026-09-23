const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const React = require('react');
const { render, screen, fireEvent, within } = require('@testing-library/react');
require('@testing-library/jest-dom');
const userEvent = require('@testing-library/user-event').default;
const { ThemeProvider } = require('styled-components');
const { StarterMission } = require('@influenceth/sdk');

jest.mock('~/components/Icons', () => {
  const React = require('react');
  return Object.fromEntries(['CheckIcon','HelpIcon','LockIcon','PlayIcon','SwayIcon','TargetIcon','ChevronDoubleDownIcon','ChevronDoubleUpIcon','ForwardIcon','RewardsIcon'].map(name => [name, () => React.createElement('svg', { 'aria-hidden': true })]));
}, { virtual: true });
jest.mock('~/components/ButtonAlt', () => ({ __esModule: true, default: ({ children, onClick, disabled }) => <button onClick={onClick} disabled={disabled}>{children}</button> }), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => ({ __esModule: true, default: () => ({ crew: { id: 501 } }) }), { virtual: true });
jest.mock('~/hooks/useSession', () => ({ __esModule: true, default: () => ({ authenticated: true }) }), { virtual: true });
jest.mock('~/hooks/useStore', () => ({ __esModule: true, default: selector => selector({}) }), { virtual: true });
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
const { StarterCampaign } = require('./StarterMissions');
const theme = require('../../../theme').default;

const setup = (overrides = {}, onGuide, initiallyExpanded = false) => {
  const view = { campaign: '123', subject: { id: '501' }, eligible: true,
    progress: { sampleCount: 2 },
    missions: Object.values(StarterMission.TYPES).map(m => ({ ...m, canAccept: m.id === 0 })), ...overrides };
  const manager = { canManage: true, getPending: () => null, accept: jest.fn(), complete: jest.fn() };
  render(<ThemeProvider theme={theme}><StarterCampaign view={view} manager={manager} onGuide={onGuide} initiallyExpanded={initiallyExpanded} /></ThemeProvider>);
  return manager;
};

test('campaign expands into eight accessible mission rows', () => {
  setup();
  const campaign = screen.getByRole('button', { name: /Your foothold/i });
  expect(campaign).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
  fireEvent.click(campaign);
  expect(screen.getAllByRole('listitem')).toHaveLength(8);
  expect(screen.getByRole('button', { name: /Prospect the Surface: Complete the previous mission/ })).toBeVisible();
});

test('opens mission zero in the reusable modal, accepts explicitly, and restores focus on escape', async () => {
  const manager = setup();
  fireEvent.click(screen.getByRole('button', { name: /Your foothold/i }));
  const row = screen.getByRole('button', { name: /Make Landfall: Ready/ });
  row.focus(); fireEvent.click(row);
  fireEvent.load(screen.getByRole('dialog').querySelector('img'));
  const dialog = screen.getByRole('dialog', { name: 'Make Landfall' });
  expect(dialog).toHaveFocus();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Accept mission' }));
  expect(manager.accept).toHaveBeenCalledWith(0);
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(row).toHaveFocus();
});

test('keeps a completed reward claim available for an ineligible crew', async () => {
  const mission = { ...StarterMission.TYPES[0], accepted: true, earned: true, completed: true, claimable: true };
  const manager = setup({ eligible: false, missions: [mission] });
  fireEvent.click(screen.getByRole('button', { name: /Your foothold/i }));
  fireEvent.click(screen.getByRole('button', { name: /Make Landfall: Reward ready/ }));
  fireEvent.load(screen.getByRole('dialog').querySelector('img'));
  await userEvent.click(screen.getByRole('button', { name: 'Complete mission' }));
  expect(manager.complete).toHaveBeenCalledWith(0);
});

test('shows recorded partial sample progress without marking the mission complete', () => {
  setup({ missions: [{ ...StarterMission.TYPES[1], accepted: true }] });
  fireEvent.click(screen.getByRole('button', { name: /Your foothold/i }));
  expect(screen.getByText('2 / 3 samples')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /Prospect the Surface: In progress/ }));
  fireEvent.load(screen.getByRole('dialog').querySelector('img'));
  const progress = screen.getByRole('region', { name: 'Mission progress' });
  expect(within(progress).getByText('Mission accepted')).toBeInTheDocument();
  expect(within(progress).getAllByRole('img', { name: 'Objective completed' })).toHaveLength(2);
  expect(within(progress).queryByText('In progress')).not.toBeInTheDocument();
  expect(within(progress).getByRole('img', { name: 'Objective incomplete' })).toBeInTheDocument();
  expect(within(progress).getByRole('button', { name: 'Complete mission' })).toBeDisabled();
});


test('locked missions preview the pathway without enabling transactions', () => {
  setup();
  fireEvent.click(screen.getByRole('button', { name: /Your foothold/i }));
  fireEvent.click(screen.getByRole('button', { name: /Prospect the Surface: Complete the previous mission/ }));
  fireEvent.load(screen.getByRole('dialog').querySelector('img'));
  expect(screen.getByRole('region', { name: 'Mission progress' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Accept mission' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Complete mission' })).toBeDisabled();
  expect(screen.queryByText(/unlock acceptance/)).not.toBeInTheDocument();
});

test('available missions show objectives directly in the progress timeline', () => {
  setup();
  fireEvent.click(screen.getByRole('button', { name: /Your foothold/i }));
  fireEvent.click(screen.getByRole('button', { name: /Make Landfall: Ready/ }));
  fireEvent.load(screen.getByRole('dialog').querySelector('img'));
  expect(screen.getByRole('region', { name: 'Mission progress' })).toBeInTheDocument();
  expect(screen.getByText('Plan your campaign Warehouse')).toBeInTheDocument();
  expect(screen.getAllByRole('img', { name: 'Objective incomplete' }).length).toBeGreaterThan(0);
});


test('shows SDK building thumbnails and clearly marked draft briefings', () => {
  setup();
  fireEvent.click(screen.getByRole('button', { name: /Your foothold/i }));
  fireEvent.click(screen.getByRole('button', { name: /Make Landfall: Ready/ }));
  fireEvent.load(screen.getByRole('dialog').querySelector('img'));
  expect(screen.getByRole('img', { name: 'Warehouse' })).toBeInTheDocument();
  expect(screen.getByText('Warehouse', { selector: 'figcaption' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Warehouse' })).not.toHaveAttribute('data-tooltip-id');
  expect(screen.getByRole('img', { name: 'Warehouse' }).closest('li')).toHaveTextContent('Plan your campaign Warehouse');
  expect(within(screen.getByRole('dialog')).queryByRole('complementary')).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Mission briefing' })).toHaveTextContent('[DRAFT]');
});

test('route previews update the buildings and materials without changing mission actions', () => {
  setup({ missions: [{ ...StarterMission.TYPES[7], accepted: true }] });
  fireEvent.click(screen.getByRole('button', { name: /Your foothold/i }));
  fireEvent.click(screen.getByRole('button', { name: /Close the Production Loop: In progress/ }));
  fireEvent.load(screen.getByRole('dialog').querySelector('img'));
  expect(screen.getAllByRole('img', { name: 'Refinery' })).toHaveLength(2);
  fireEvent.change(screen.getByRole('combobox', { name: 'Production route' }), { target: { value: '4' } });
  expect(screen.getAllByRole('img', { name: 'Bioreactor' }).length).toBeGreaterThan(0);
  expect(screen.getAllByRole('img', { name: 'Food' }).length).toBeGreaterThan(0);
  expect(screen.getAllByText('Food', { selector: 'figcaption' }).length).toBeGreaterThan(0);
  screen.getAllByRole('img', { name: 'Food' }).forEach(image => expect(image).not.toHaveAttribute('data-tooltip-id'));
  expect(screen.queryByRole('button', { name: 'Finalize mission' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Check completion' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Complete mission' })).toBeDisabled();
});

test('finalizes an accepted mission only after its objectives are recorded as met', async () => {
  const manager = setup({ missions: [{ ...StarterMission.TYPES[0], accepted: true, earned: true }] });
  fireEvent.click(screen.getByRole('button', { name: /Your foothold/i }));
  fireEvent.click(screen.getByRole('button', { name: /Make Landfall: Objective met/ }));
  fireEvent.load(screen.getByRole('dialog').querySelector('img'));
  await userEvent.click(screen.getByRole('button', { name: 'Complete mission' }));
  expect(manager.complete).toHaveBeenCalledWith(0);
});

test('requirement guidance closes the modal and passes the chosen requirement without accepting', () => {
  const onGuide = jest.fn();
  const manager = setup({ missions: [{ ...StarterMission.TYPES[0], accepted: true }] }, onGuide);
  fireEvent.click(screen.getByRole('button', { name: /Your foothold/i }));
  fireEvent.click(screen.getByRole('button', { name: /Make Landfall: In progress/ }));
  fireEvent.load(screen.getByRole('dialog').querySelector('img'));
  const guidance = screen.getAllByRole('button', { name: 'Show me how' })[0];
  expect(guidance).not.toHaveAttribute('title');
  expect(guidance).toHaveAttribute('data-tooltip-id', 'detailsTooltip');
  expect(guidance).toHaveAttribute('data-tooltip-content', 'Show me how');
  expect(guidance).toHaveAttribute('data-tooltip-place', 'top');
  expect(guidance).toHaveAttribute('data-tooltip-delay-show', '0');
  fireEvent.click(guidance);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(onGuide).toHaveBeenCalledWith(expect.objectContaining({ id: 0 }), 0);
  expect(manager.accept).not.toHaveBeenCalled();
});

test('unaccepted missions do not expose guidance even when a guide handler is available', () => {
  setup({}, jest.fn());
  fireEvent.click(screen.getByRole('button', { name: /Your foothold/i }));
  fireEvent.click(screen.getByRole('button', { name: /Make Landfall: Ready/ }));
  expect(screen.queryByRole('button', { name: 'Show me how' })).not.toBeInTheDocument();
});

test('the starter invitation can open the campaign already expanded', () => {
  setup({}, undefined, true);
  expect(screen.getByRole('button', { name: /Your foothold/i })).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getAllByRole('listitem')).toHaveLength(8);
});
