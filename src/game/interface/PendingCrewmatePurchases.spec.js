import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, useLocation } from 'react-router-dom';

jest.mock('~/hooks/usePendingCrewmatePurchases', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('~/hooks/useSession', () => ({ __esModule: true, default: () => ({ authenticated: true }) }), { virtual: true });
jest.mock('~/hooks/useStore', () => ({ __esModule: true, default: jest.fn() }), { virtual: true });
jest.mock('~/components/ButtonAlt', () => ({ __esModule: true, default: (props) => <button {...props} /> }), { virtual: true });
jest.mock('~/components/Icons', () => ({ CrewmateIcon: () => null }), { virtual: true });
jest.mock('~/appConfig', () => ({ appConfig: { get: () => 'test' } }), { virtual: true });
jest.mock('~/components/SelectHabitatDialog', () => () => null, { virtual: true });
jest.mock('~/components/SelectUninitializedCrewmateDialog', () => () => <div>Credit selection</div>, { virtual: true });
jest.mock('~/game/interface/details/crewAssignments/Create', () => () => <div>Review customization</div>, { virtual: true });
jest.mock('~/game/interface/details/crewAssignments/Assignment', () => () => <div>Story</div>, { virtual: true });
jest.mock('./Alerts', () => ({ useControlledAlert: jest.fn() }));

const usePendingCrewmatePurchases = require('~/hooks/usePendingCrewmatePurchases').default;
const useStore = require('~/hooks/useStore').default;
const { useControlledAlert } = require('./Alerts');
const PendingCrewmatePurchases = require('./PendingCrewmatePurchases').default;
const RecruitCrewmate = require('./RecruitCrewmate').default;
const Location = () => <div data-testid="location">{useLocation().pathname}</div>;
let create;
let destroy;
let closeLauncher;

beforeEach(() => {
  create = jest.fn(() => 'recovery-alert');
  destroy = jest.fn();
  closeLauncher = jest.fn();
  useControlledAlert.mockReturnValue({ create, destroy });
  useStore.mockReturnValue(closeLauncher);
  usePendingCrewmatePurchases.mockReturnValue({ enabled: true, isPending: false, purchases: [{ id: 'one' }, { id: 'two' }] });
});

test('login prompt shows both paid purchases and opens crew recruitment', () => {
  const { unmount, rerender } = render(<MemoryRouter><PendingCrewmatePurchases /><Location /></MemoryRouter>);
  const content = create.mock.calls[0][0].content;
  rerender(<MemoryRouter><PendingCrewmatePurchases />{content}<Location /></MemoryRouter>);
  expect(screen.getByText(/You have 2 paid crewmate purchases/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Finish crewmate recruitment' }));
  expect(closeLauncher).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('location')).toHaveTextContent('/crew');
  unmount();
  expect(destroy).toHaveBeenCalledWith('recovery-alert');
});

test('paid recovery enters customization for a new crewmate instead of consuming an existing NFT credit', async () => {
  render(<MemoryRouter initialEntries={['/recruit/42/1']}>
    <Route path="/recruit/:crewId/:locationId/:crewmateId?/:page?">
      <RecruitCrewmate />
    </Route>
    <Location />
  </MemoryRouter>);
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/recruit/42/1/0/create'));
  expect(screen.getByText('Review customization')).toBeInTheDocument();
  expect(screen.queryByText('Credit selection')).not.toBeInTheDocument();
});

test('ordinary recruitment retains credit selection when there are no paid purchases', () => {
  usePendingCrewmatePurchases.mockReturnValue({ enabled: true, isPending: false, purchases: [] });
  render(<MemoryRouter initialEntries={['/recruit/42/1']}>
    <Route path="/recruit/:crewId/:locationId/:crewmateId?/:page?"><RecruitCrewmate /></Route>
  </MemoryRouter>);
  expect(screen.getByText('Credit selection')).toBeInTheDocument();
});
