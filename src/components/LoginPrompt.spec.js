import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import LoginPrompt from './LoginPrompt';
import { features } from '~/appConfig/features';

jest.mock('~/appConfig/features', () => ({ features: { privy: false } }), { virtual: true });
jest.mock('~/components/Icons', () => ({ ArgentXIcon: () => null, BraavosIcon: () => null, ChevronRightIcon: () => null, UserIcon: () => null }), { virtual: true });
jest.mock('~/theme', () => ({ hexToRGB: () => '255,255,255' }), { virtual: true });

const theme = { colors: { main: '#fff' }, cursors: {}, breakpoints: { mobile: 600 } };

beforeEach(() => { features.privy = false; });

test('offers Ready by default and never reveals disabled Privy', () => {
  const login = jest.fn();
  render(<ThemeProvider theme={theme}><LoginPrompt onClick={login} /></ThemeProvider>);
  fireEvent.click(screen.getByRole('button', { name: /Ready Wallet/ }));
  expect(login).toHaveBeenCalledWith('argentX');
  fireEvent.click(screen.getByText('Other Login Options'));
  expect(screen.queryByText('Influence Account')).not.toBeInTheDocument();
  expect(screen.getByText('Braavos')).toBeVisible();
});

test('retains Influence Account as the default when Privy is configured', () => {
  features.privy = true;
  render(<ThemeProvider theme={theme}><LoginPrompt onClick={jest.fn()} /></ThemeProvider>);
  expect(screen.getByText('Influence Account')).toBeVisible();
  expect(screen.queryByText('Ready Wallet')).not.toBeInTheDocument();
});
