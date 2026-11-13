import { fireEvent, render, screen } from '@testing-library/react';
import Prospect from './Prospect';
import usePrivateDataKey from '~/hooks/usePrivateDataKey';
import { createCampaignRepository } from '../../../prospecting/campaignRepository';
import { replayCampaign } from '../../../prospecting/campaignRecord';

const mockOpen = jest.fn();
const mockSelect = jest.fn(), mockToggle = jest.fn(), mockMenu = jest.fn();
jest.mock('~/appConfig', () => ({ appConfig: { get: () => 'dispatcher' } }), { virtual: true });
jest.mock('@influenceth/sdk', () => ({ Lot: { toIndex: () => 250 }, Product: { TYPES: { 1: { name: 'Water' } } } }));
jest.mock('~/components/Icons', () => ({ NewCoreSampleIcon: () => null, ImproveCoreSampleIcon: () => null }), { virtual: true });
jest.mock('~/hooks/usePrivateDataKey', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useSession', () => () => ({ accountAddress: 'owner', chainId: 'chain' }), { virtual: true });
jest.mock('~/hooks/useCoachmarkRefSetter', () => () => () => null, { virtual: true });
jest.mock('~/contexts/CoachmarkContext', () => ({ COACHMARK_IDS: { actionButtonCoreSample: 'sample' } }), { virtual: true });
jest.mock('~/hooks/useStore', () => (select) => select({
  dispatchResourceMapSelect: mockSelect, dispatchResourceMapToggle: mockToggle, dispatchHudMenuOpened: mockMenu
}), { virtual: true });
jest.mock('../../../prospecting/store', () => ({ useProspecting: (select) => select({ open: mockOpen }), prospectingOnchain: () => false }));
jest.mock('../../../prospecting/campaignIdentity', () => ({ campaignIdentity: (identity) => identity }));
jest.mock('../../../prospecting/campaignRepository', () => ({ createCampaignRepository: jest.fn() }));
jest.mock('../../../prospecting/campaignRecord', () => ({ replayCampaign: jest.fn() }));
jest.mock('./ActionButton', () => (props) => (
  <button aria-label={props.label} disabled={props.flags.disabled}
    data-attention={props.flags.attention} title={props.labelAddendum} onClick={props.onClick}>Icon</button>
));

it('opens locked prospecting with the selected resource using a normal action button', () => {
  usePrivateDataKey.mockReturnValue({ privateKey: null });
  render(<Prospect asteroidId={1} lotId={2} resourceId={1} />);
  const button = screen.getByRole('button', { name: 'Prospect for Water' });
  expect(button).toHaveAttribute('data-attention', 'false');
  expect(button.title).toContain('Unlock private data');
  fireEvent.click(button);
  expect(mockOpen).toHaveBeenCalledWith(1, 250, 1);
  expect(mockSelect).toHaveBeenCalledWith(1);
  expect(mockToggle).toHaveBeenCalledWith(true);
  expect(mockMenu).toHaveBeenCalledWith('LOT_PROSPECTING');
});

it('loads the encrypted campaign to show the correct resume hover label', async () => {
  usePrivateDataKey.mockReturnValue({ privateKey: 'key', publicKey: 'public' });
  createCampaignRepository.mockReturnValue({ load: jest.fn(async () => ({ record: {} })) });
  replayCampaign.mockReturnValue({ history: [{}, {}, {}], cells: [[1, 250, 0, 1]] });
  render(<Prospect asteroidId={1} lotId={2} resourceId={1} />);
  const button = await screen.findByRole('button', { name: 'Continue Water Prospecting' });
  expect(button.title).toContain('3 / 10 samples');
  expect(button).toHaveAttribute('data-attention', 'false');
});
