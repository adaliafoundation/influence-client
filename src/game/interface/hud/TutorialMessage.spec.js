const React = require('react');
const { render, screen, fireEvent } = require('@testing-library/react');
require('@testing-library/jest-dom');
const { ThemeProvider } = require('styled-components');

jest.mock('~/components/ButtonAlt', () => ({ __esModule: true, default: ({ children, onClick }) => <button onClick={onClick}>{children}</button> }), { virtual: true });
jest.mock('~/components/IconButton', () => ({ __esModule: true, default: ({ children, onClick, 'aria-label': label }) => <button aria-label={label} onClick={onClick}>{children}</button> }), { virtual: true });
jest.mock('~/components/ClipCorner', () => ({ __esModule: true, default: () => null }), { virtual: true });
jest.mock('~/components/Icons', () => ({ CloseIcon: () => null, ChevronDoubleDownIcon: () => null }), { virtual: true });
jest.mock('~/hooks/useCrewmate', () => ({ __esModule: true, default: () => ({}) }), { virtual: true });
jest.mock('~/lib/utils', () => ({ reactBool: value => value ? 'true' : undefined }), { virtual: true });
jest.mock('~/lib/spriteUtils', () => ({ getCrewmateCompositorImageUrl: jest.fn() }), { virtual: true });
jest.mock('~/theme', () => ({ __esModule: true, default: { colors: { mainRGB: '0,100,200', brightMain: '#00aaff' } } }), { virtual: true });

const TutorialMessage = require('./TutorialMessage').default;
const TutorialBubble = require('./TutorialBubble').default;
const theme = { colors: { mainRGB: '0,100,200', darkMainRGB: '0,50,100', main: '#0088aa' }, cursors: { active: 'pointer' }, clipCorner: () => '' };
const withTheme = element => <ThemeProvider theme={theme}>{element}</ThemeProvider>;

test('the message exposes separate minimize and close controls and is inert when hidden', () => {
  const onMinimize = jest.fn();
  const onClose = jest.fn();
  const props = { step: { title: 'Guide', content: 'Instructions' }, onMinimize, onClose, role: 'region' };
  const rendered = render(withTheme(<TutorialMessage {...props} isIn />));
  fireEvent.click(screen.getByRole('button', { name: 'Minimize guidance' }));
  expect(onMinimize).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Close guidance' }));
  expect(onClose).toHaveBeenCalledTimes(1);
  rendered.rerender(withTheme(<TutorialMessage {...props} isIn={false} />));
  expect(screen.getByRole('region', { hidden: true })).toHaveAttribute('inert');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('the shared portrait is an accessible resume button only while minimized', () => {
  const onClick = jest.fn();
  const rendered = render(withTheme(<TutorialBubble isIn onClick={onClick} />));
  fireEvent.click(screen.getByRole('button', { name: 'Resume guidance' }));
  expect(onClick).toHaveBeenCalledTimes(1);
  rendered.rerender(withTheme(<TutorialBubble isIn={false} onClick={onClick} />));
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { hidden: true })).toHaveAttribute('tabindex', '-1');
});
