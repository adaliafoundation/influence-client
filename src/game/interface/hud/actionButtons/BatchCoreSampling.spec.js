import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import BatchCoreSampling from './BatchCoreSampling';

jest.mock('~/components/Icons', () => ({ NewCoreSampleIcon: () => null }), { virtual: true });
jest.mock('~/hooks/useSimulationEnabled', () => jest.fn(), { virtual: true });
jest.mock('./ActionButton', () => ({
  __esModule: true,
  default: jest.fn(({ label, onClick }) => (
    <button data-testid="action-button" data-label={label} onClick={onClick} />
  )),
  getCrewDisabledReason: jest.fn(() => undefined)
}));

const useSimulationEnabled = require('~/hooks/useSimulationEnabled');
const { default: ActionButton, getCrewDisabledReason } = require('./ActionButton');
const asteroid = { id: 7, Celestial: { scanStatus: 4 } };
const crew = { id: 9, _location: { asteroidId: 7, lotId: 200 }, _readyToSequence: true };

beforeEach(() => {
  jest.clearAllMocks();
  // resetMocks strips factory implementations; re-establish them per test
  ActionButton.mockImplementation(({ label, onClick }) => (
    <button data-testid="action-button" data-label={label} onClick={onClick} />
  ));
  getCrewDisabledReason.mockReturnValue(undefined);
  useSimulationEnabled.mockReturnValue(false);
});

test('opens the core sampling dialog on click', () => {
  const onSetAction = jest.fn();
  render(
    <BatchCoreSampling.Component
      asteroid={asteroid}
      crew={crew}
      onSetAction={onSetAction} />
  );

  expect(screen.getByTestId('action-button').dataset.label).toBe('Batch Core Sampling');
  fireEvent.click(screen.getByTestId('action-button'));
  expect(onSetAction).toHaveBeenCalledWith('CORE_SAMPLING');
});

test('is never auto-included in the lower-left action bar (resources tray only)', () => {
  // the resources panel renders the component explicitly; isVisible gates only
  // the lot-specific lower-left action bar, where it does not belong
  expect(BatchCoreSampling.isVisible({ asteroid, crew })).toBe(false);
  expect(BatchCoreSampling.isVisible({})).toBe(false);
});

test('requests the sequenceable crew gate rather than requiring an idle crew', () => {
  render(
    <BatchCoreSampling.Component
      asteroid={asteroid}
      crew={crew}
      onSetAction={() => {}} />
  );

  expect(getCrewDisabledReason).toHaveBeenCalledWith(expect.objectContaining({ isSequenceable: true }));
});

test('is not part of the training simulation', () => {
  useSimulationEnabled.mockReturnValue(true);
  const { container } = render(
    <BatchCoreSampling.Component
      asteroid={asteroid}
      crew={crew}
      onSetAction={() => {}} />
  );

  expect(container).toBeEmptyDOMElement();
});
