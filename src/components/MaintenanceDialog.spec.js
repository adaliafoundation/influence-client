import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'styled-components';
import MaintenanceDialog from './MaintenanceDialog';
import { isMaintenanceActive, subscribeMaintenance } from '../lib/maintenance';

jest.mock('../lib/maintenance', () => ({ isMaintenanceActive: jest.fn(), subscribeMaintenance: jest.fn() }));
jest.mock('~/components/Dialog', () => jest.requireActual('./Dialog'), { virtual: true });
jest.mock('~/components/ButtonAlt', () => () => <button>Ok</button>, { virtual: true });
jest.mock('~/components/Loader', () => () => null, { virtual: true });
jest.mock('~/components/NavIcon', () => () => null, { virtual: true });
jest.mock('~/lib/utils', () => ({ nativeBool: Boolean }), { virtual: true });

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = jest.fn(function () { this.setAttribute('open', ''); });
  HTMLDialogElement.prototype.close = jest.fn(function () { this.removeAttribute('open'); });
});

test('shows a non-dismissible maintenance dialog and refreshes queries on recovery', () => {
  const listeners = new Set();
  subscribeMaintenance.mockImplementation(listener => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  });
  isMaintenanceActive.mockReturnValue(false);
  const client = new QueryClient();
  jest.spyOn(client, 'invalidateQueries');
  const { unmount } = render(<QueryClientProvider client={client}>
    <ThemeProvider theme={{ colors: { contentBackdrop: '#000' }, breakpoints: { mobile: 600 } }}>
      <MaintenanceDialog />
    </ThemeProvider>
  </QueryClientProvider>);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  act(() => { isMaintenanceActive.mockReturnValue(true); listeners.forEach(fn => fn()); });
  expect(screen.getByText('The server is currently undergoing daily maintenance. Please leave Influence open and it will reconnect automatically upon completion.')).toBeVisible();
  expect(screen.getByLabelText('Waiting for maintenance to complete')).toBeVisible();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
  const cancel = new Event('cancel', { cancelable: true });
  fireEvent(screen.getByRole('dialog'), cancel);
  expect(cancel.defaultPrevented).toBe(true);
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  fireEvent.click(screen.getByRole('dialog'));
  expect(screen.getByRole('dialog')).toBeVisible();
  act(() => { isMaintenanceActive.mockReturnValue(false); listeners.forEach(fn => fn()); });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(client.invalidateQueries).toHaveBeenCalledTimes(1);
  unmount();
  expect(listeners.size).toBe(0);
});
