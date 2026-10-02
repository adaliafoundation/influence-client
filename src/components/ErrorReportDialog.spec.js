import React from 'react';
import { fireEvent, render as renderView, screen, waitFor } from '@testing-library/react';
import ErrorReportDialog from './ErrorReportDialog';
import { errorMessages } from '../lib/errorMessages';

jest.mock('~/components/Dialog', () => ({ children }) => <div>{children}</div>, { virtual: true });
jest.mock('~/components/ButtonAlt', () => ({ children, onClick, disabled }) => <button disabled={disabled} onClick={onClick}>{children}</button>, { virtual: true });
jest.mock('~/components/Loader', () => () => null, { virtual: true });
jest.mock('~/components/NavIcon', () => () => null, { virtual: true });
jest.mock('~/lib/utils', () => ({ nativeBool: Boolean }), { virtual: true });

const { ThemeProvider } = require('styled-components');
const theme = { cursors: { default: 'default' }, breakpoints: { mobile: 1023 }, colors: { mainRGB: '0, 180, 220', mainText: 'white', inputBackground: 'black' } };
const render = component => renderView(<ThemeProvider theme={theme}>{component}</ThemeProvider>);

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: jest.fn().mockResolvedValue() } });
});

test('shows a selectable plaintext report and copies exactly that report', async () => {
  const close = jest.fn();
  render(<ErrorReportDialog report={'Provider error\ncode: 42'} onClose={close} />);
  const field = screen.getByRole('textbox');
  expect(field.readOnly).toBe(true);
  expect(field.value).toBe('Provider error\ncode: 42');
  fireEvent.click(screen.getByText(errorMessages.copyReport));
  await screen.findByText(errorMessages.copied);
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(field.value);
  fireEvent.click(screen.getByText(errorMessages.close));
  expect(close).toHaveBeenCalledTimes(1);
});

test('copy failure keeps the report available for manual copying', async () => {
  navigator.clipboard.writeText.mockRejectedValue(new Error('Clipboard blocked'));
  render(<ErrorReportDialog report="error details" onClose={() => {}} />);
  fireEvent.click(screen.getByText(errorMessages.copyReport));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe(errorMessages.copyFailed));
  expect(screen.getByRole('textbox').value).toBe('error details');
});


// DOM relationships and computed styles are the behavior under test here.
/* eslint-disable testing-library/no-node-access */
test('uses the shared modal footer with both buttons in one horizontal row', () => {
  render(<ErrorReportDialog report="error details" onClose={() => {}} />);
  const copy = screen.getByRole('button', { name: errorMessages.copyReport });
  const close = screen.getByRole('button', { name: errorMessages.close });
  expect(copy.parentElement).toBe(close.parentElement);
  expect(window.getComputedStyle(copy.parentElement).display).toBe('flex');
  expect(window.getComputedStyle(copy.parentElement).flexDirection).toBe('row');
  expect(copy.parentElement).toBe(screen.getByRole('dialog').lastElementChild);
});

/* eslint-enable testing-library/no-node-access */
