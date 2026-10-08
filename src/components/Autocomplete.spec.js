import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'styled-components';
import { StaticAutocomplete } from './Autocomplete';
import theme from '~/theme';

jest.mock('react-popper', () => ({
  usePopper: () => ({ styles: {}, attributes: {} })
}), { virtual: true });
jest.mock('~/hooks/useAutocomplete', () => jest.fn(), { virtual: true });
jest.mock('~/lib/utils', () => ({ reactBool: value => value || undefined }), { virtual: true });
jest.mock('~/theme', () => ({
  __esModule: true,
  default: {
    colors: { main: '#fff', mainRGB: '255,255,255', inputBackground: '#000' },
    cursors: { active: 'pointer' },
    fontSizes: { detailText: '14px' }
  },
  hexToRGB: () => '0,0,0'
}), { virtual: true });

const mount = () => {
  const onSelect = jest.fn();
  const onBlur = jest.fn();
  render(
    <ThemeProvider theme={theme}>
      <StaticAutocomplete
        options={[{ id: 1, name: 'Iron' }, { id: 2, name: 'Water' }]}
        labelKey="name"
        valueKey="id"
        placeholder="Add Product"
        onSelect={onSelect}
        onBlur={onBlur}
      />
      <button>Outside</button>
    </ThemeProvider>
  );
  return { input: screen.getByPlaceholderText('Add Product'), onSelect, onBlur };
};

test('keeps the input focused until a pressed option is clicked', async () => {
  const user = userEvent.setup();
  const { input, onSelect, onBlur } = mount();
  await user.type(input, 'Iron');

  await user.pointer({ target: screen.getByText('Iron'), keys: '[MouseLeft>]' });
  expect(input).toHaveFocus();
  expect(onBlur).not.toHaveBeenCalled();
  expect(onSelect).not.toHaveBeenCalled();

  await user.pointer({ keys: '[/MouseLeft]' });
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect).toHaveBeenCalledWith({ id: 1, name: 'Iron' });
  expect(onBlur).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Iron')).not.toBeInTheDocument();
});

test('supports keyboard selection and Escape without selecting', async () => {
  const user = userEvent.setup();
  const { input, onSelect } = mount();
  await user.type(input, 'Iron{Escape}');
  expect(onSelect).not.toHaveBeenCalled();
  expect(screen.queryByText('Iron')).not.toBeInTheDocument();

  await user.type(input, 'Water{Enter}');
  expect(onSelect).toHaveBeenCalledWith({ id: 2, name: 'Water' });
  expect(screen.queryByText('Water')).not.toBeInTheDocument();
});

test('closes on an outside click without selecting', async () => {
  const user = userEvent.setup();
  const { input, onSelect } = mount();
  await user.type(input, 'Iron');
  await user.click(screen.getByRole('button', { name: 'Outside' }));
  expect(onSelect).not.toHaveBeenCalled();
  expect(screen.queryByText('Iron')).not.toBeInTheDocument();
});
