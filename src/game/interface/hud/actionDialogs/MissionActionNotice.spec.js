import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeProvider } from 'styled-components';
import { useMissionAction } from '~/contexts/MissionActionContext';
import MissionActionNotice from './MissionActionNotice';

jest.mock('~/contexts/MissionActionContext', () => ({ useMissionAction: jest.fn() }), { virtual: true });
jest.mock('~/lib/actionStages', () => jest.requireActual('../../../../lib/actionStages'), { virtual: true });
jest.mock('~/components/Icons', () => ({
  CheckedIcon: props => <svg {...props} />,
  UncheckedIcon: props => <svg {...props} />
}), { virtual: true });

test('names the mission and allows opting out of a bound action', () => {
  const setSelected = jest.fn();
  useMissionAction.mockReturnValue({
    visible: true, ready: true, eligible: true, selected: true, bound: true,
    missionTitle: 'Make Landfall', setSelected
  });
  render(<ThemeProvider theme={{ colors: { main: 'teal' } }}><MissionActionNotice /></ThemeProvider>);
  const checkbox = screen.getByRole('checkbox', { name: 'Apply toward Make Landfall mission' });
  expect(checkbox).toBeChecked();
  expect(checkbox).toBeEnabled();
  fireEvent.click(checkbox);
  expect(setSelected).toHaveBeenCalledWith(false);
});

test.each(['STARTING', 'COMPLETING'])('hides campaign controls and indexing notices while %s', stage => {
  useMissionAction.mockReturnValue({ visible: true, ready: true, selected: true, pending: true, missionTitle: 'Make Landfall' });
  const { container } = render(<MissionActionNotice stage={stage} />);
  expect(container).toBeEmptyDOMElement();
});
