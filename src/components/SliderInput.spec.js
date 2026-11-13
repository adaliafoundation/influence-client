import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
const theme = { colors: { main: '#36a7cd', mainRGB: '54,167,205' } };
import SliderInput from './SliderInput';

it('retains the full scale while clamping mouse and keyboard to reachable steps', () => {
  const onChange = jest.fn();
  render(<ThemeProvider theme={theme}>
    <SliderInput min={0} max={4} availableMax={1} value={0} onChange={onChange} ariaLabel="Depth" />
  </ThemeProvider>);
  const slider = screen.getByRole('slider', { name: 'Depth' });
  fireEvent.keyDown(slider, { key: 'End' });
  expect(onChange).toHaveBeenLastCalledWith(1);
  Object.defineProperty(slider, 'offsetWidth', { value: 400 });
  const click = new MouseEvent('mousedown', { bubbles: true });
  Object.defineProperty(click, 'offsetX', { value: 400 });
  fireEvent(slider, click);
  expect(onChange).toHaveBeenLastCalledWith(1);
});

it('preserves the full range for existing callers without an availability limit', () => {
  const onChange = jest.fn();
  render(<ThemeProvider theme={theme}><SliderInput min={0} max={4} value={0} onChange={onChange} /></ThemeProvider>);
  fireEvent.keyDown(screen.getByRole('slider'), { key: 'End' });
  expect(onChange).toHaveBeenLastCalledWith(4);
});
