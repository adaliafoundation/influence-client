import React from 'react';
import { render, screen } from '@testing-library/react';
import ActionDialogGate from './ActionDialogGate';
import useStore from '~/hooks/useStore';

jest.mock('~/hooks/useStore', () => jest.fn(), { virtual: true });

let state;
beforeEach(() => {
  state = { asteroids: { lot: 100, zoomStatus: 'in' }, lotCameraTransition: 100 };
  useStore.mockImplementation(selector => selector(state));
});

test('does not mount an action during lot travel; mounts on arrival', () => {
  const mount = jest.fn();
  const Dialog = () => { mount(); return <div>Construct Building</div>; };
  const view = render(<ActionDialogGate><Dialog /></ActionDialogGate>);
  expect(mount).not.toHaveBeenCalled();
  state.lotCameraTransition = null;
  view.rerender(<ActionDialogGate><Dialog /></ActionDialogGate>);
  expect(screen.getByText('Construct Building')).toBeTruthy();
});

test('asteroid arrival still waits for the subsequent lot animation', () => {
  state.asteroids.zoomStatus = 'zooming-in';
  const dialog = <ActionDialogGate><div>Construct Building</div></ActionDialogGate>;
  const view = render(dialog);
  expect(screen.queryByText('Construct Building')).toBeNull();
  state.asteroids.zoomStatus = 'in';
  view.rerender(<ActionDialogGate><div>Construct Building</div></ActionDialogGate>);
  expect(screen.queryByText('Construct Building')).toBeNull();
  state.lotCameraTransition = null;
  view.rerender(<ActionDialogGate><div>Construct Building</div></ActionDialogGate>);
  expect(screen.getByText('Construct Building')).toBeTruthy();
});

test('an action at an already settled location opens immediately', () => {
  state.lotCameraTransition = null;
  render(<ActionDialogGate><div>Construct Building</div></ActionDialogGate>);
  expect(screen.getByText('Construct Building')).toBeTruthy();
});
