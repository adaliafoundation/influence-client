import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ScreensizeWarning from './ScreensizeWarning';
import useScreenSize from '~/hooks/useScreenSize';
import { appConfig } from '~/appConfig';

jest.mock('~/appConfig', () => ({ appConfig: { get: jest.fn(() => false) } }), { virtual: true });
jest.mock('~/hooks/useScreenSize', () => jest.fn(), { virtual: true });
jest.mock('~/components/Icons', () => ({ WarningIcon: props => <svg {...props} /> }), { virtual: true });
jest.mock('~/theme', () => ({ breakpoints: { mobile: 1023 } }), { virtual: true });

beforeEach(() => appConfig.get.mockReturnValue(false));

test.each([[1023, 1000], [1500, 796], [800, 600]])('shows only a non-blocking notice at %s × %s', (width, height) => {
  useScreenSize.mockReturnValue({ width, height });
  render(<ScreensizeWarning />);
  expect(screen.getByRole('status')).toHaveTextContent('Device size is not well supported.');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('clears and restores the notice on resize using the old interruption boundaries', () => {
  useScreenSize.mockReturnValue({ width: 1024, height: 797 });
  const view = render(<ScreensizeWarning />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  useScreenSize.mockReturnValue({ width: 1024, height: 796 });
  view.rerender(<ScreensizeWarning />);
  expect(screen.getByRole('status')).toBeInTheDocument();
  useScreenSize.mockReturnValue({ width: 1024, height: 797 });
  view.rerender(<ScreensizeWarning />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('honors the existing warning configuration', () => {
  appConfig.get.mockReturnValue(true);
  useScreenSize.mockReturnValue({ width: 800, height: 600 });
  render(<ScreensizeWarning />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
