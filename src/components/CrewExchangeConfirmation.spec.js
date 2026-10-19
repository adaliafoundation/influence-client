import { fireEvent, render as renderComponent, screen } from '@testing-library/react';
import CrewExchangeConfirmation from './CrewExchangeConfirmation';
import { ThemeProvider } from 'styled-components';

const render = (element) => renderComponent(<ThemeProvider theme={{ colors: { orange: '#ffaa00', main: '#00aaff' }, cursors: { active: 'pointer' } }}>{element}</ThemeProvider>);

jest.mock('./ConfirmationDialog', () => ({ body, disabled, onConfirm, onReject }) => <div>
  {body}<button disabled={disabled} onClick={onConfirm}>Confirm</button><button onClick={onReject}>Back</button>
</div>);
jest.mock('./filters/components', () => ({
  CheckboxButton: require('styled-components').default.button``
}));
jest.mock('./Icons', () => ({
  CheckedIcon: () => <svg data-testid="checked-icon" />,
  UncheckedIcon: () => <svg data-testid="unchecked-icon" />,
  WarningIcon: () => <svg data-testid="warning-icon" />
}));
jest.mock('~/theme', () => ({ hexToRGB: () => '255,170,0' }), { virtual: true });
const crew = { id: 101, Name: { name: 'Starter Crew' } };

test('shows separate warnings and requires explicit benefit acknowledgement', () => {
  const onConfirm = jest.fn();
  render(<CrewExchangeConfirmation warnings={{ missions: [crew], benefits: [crew] }} onConfirm={onConfirm} />);
  expect(screen.getByText('Starter mission campaign')).toBeTruthy();
  expect(screen.getByText('Unused starter pack benefits')).toBeTruthy();
  expect(screen.getAllByRole('alert')).toHaveLength(2);
  expect(screen.getAllByTestId('warning-icon')).toHaveLength(2);
  expect(screen.getByTestId('unchecked-icon')).toBeTruthy();
  expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('false');
  fireEvent.click(screen.getByText('Confirm'));
  expect(onConfirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByText('Confirm'));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('checkbox'));
  expect(screen.getByText('Confirm').disabled).toBe(true);
});

test('mission-only warning needs no checkbox and allows backing out', () => {
  const onConfirm = jest.fn();
  const onReject = jest.fn();
  render(<CrewExchangeConfirmation warnings={{ missions: [crew], benefits: [] }} onConfirm={onConfirm} onReject={onReject} />);
  expect(screen.queryByRole('checkbox')).toBeNull();
  fireEvent.click(screen.getByText('Back'));
  expect(onReject).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Confirm'));
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test('benefits-only warning resets acknowledgement when reopened', () => {
  const warnings = { missions: [], benefits: [crew] };
  const { unmount } = render(<CrewExchangeConfirmation warnings={warnings} />);
  expect(screen.queryByText('Starter mission campaign')).toBeNull();
  fireEvent.click(screen.getByRole('checkbox'));
  expect(screen.getByText('Confirm').disabled).toBe(false);
  unmount();
  render(<CrewExchangeConfirmation warnings={warnings} />);
  expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('false');
  expect(screen.getByText('Confirm').disabled).toBe(true);
});

test.each(['Enter', ' '])('acknowledgement supports the %s key', (key) => {
  render(<CrewExchangeConfirmation warnings={{ missions: [], benefits: [crew] }} />);
  fireEvent.keyDown(screen.getByRole('checkbox'), { key });
  expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('true');
  expect(screen.getByTestId('checked-icon')).toBeTruthy();
  expect(screen.getByText('Confirm').disabled).toBe(false);
});
