import { fireEvent, render, screen } from '@testing-library/react';
import AuthorizationNotice from './AuthorizationNotice';
import useCrewContext from '~/hooks/useCrewContext';

jest.mock('~/hooks/useCrewContext', () => jest.fn(), { virtual: true });
jest.mock('~/components/Button', () => ({ children, onClick }) => <button onClick={onClick}>{children}</button>, { virtual: true });

test.each([undefined, 'unresolved', 'allowed'])('does not show a notice for %s access', (status) => {
  useCrewContext.mockReturnValue({ retryAuthorization: jest.fn() });
  render(<AuthorizationNotice authorization={status && { status }} />);
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
});

test('shows confirmed denial and keeps the retry action', () => {
  const retryAuthorization = jest.fn();
  useCrewContext.mockReturnValue({ retryAuthorization });
  render(<AuthorizationNotice authorization={{ status: 'denied' }} deniedMessage="Docking is restricted." />);
  expect(screen.getByRole('status').textContent).toContain('Docking is restricted.');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh access' }));
  expect(retryAuthorization).toHaveBeenCalledTimes(1);
});
