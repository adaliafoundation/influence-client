import { render } from '@testing-library/react';
import { Lot } from '@influenceth/sdk';
import LegacySamplingRedirect from './LegacySamplingRedirect';
import useLot from '~/hooks/useLot';
import useStore from '~/hooks/useStore';
import { useProspecting } from './store';

jest.mock('~/hooks/useLot', () => jest.fn(), { virtual: true });
jest.mock('~/hooks/useStore', () => Object.assign(jest.fn(), { getState: jest.fn() }), { virtual: true });
jest.mock('./store', () => ({ useProspecting: { getState: jest.fn() } }));
let state, open;
beforeEach(() => {
  state = { asteroids: { lot: Lot.toId(1, 5) }, dispatchResourceMapSelect: jest.fn(),
    dispatchResourceMapToggle: jest.fn(), dispatchHudMenuOpened: jest.fn(), dispatchActionDialog: jest.fn() };
  useStore.mockImplementation(select => select(state));
  useStore.getState.mockReturnValue(state);
  open = jest.fn();
  useProspecting.getState.mockReturnValue({ open });
  useLot.mockReturnValue({ data: { deposits: [{ id: 42, Deposit: { resource: 1 } }] } });
});
it.each([{ sampleId: 42 }, { preselect: { sampleId: 42 } }])('redirects both old sample link forms: %j', params => {
  render(<LegacySamplingRedirect params={params} />);
  expect(open).toHaveBeenCalledWith(1, 5, 1);
  expect(state.dispatchHudMenuOpened).toHaveBeenCalledWith('LOT_PROSPECTING');
  expect(state.dispatchActionDialog).toHaveBeenCalledWith();
});
it('waits for indexed sample data before opening its material', () => {
  useLot.mockReturnValue({ data: undefined });
  const params = { sampleId: 42 };
  const { rerender } = render(<LegacySamplingRedirect params={params} />);
  expect(open).not.toHaveBeenCalled();
  useLot.mockReturnValue({ data: { deposits: [{ id: 42, Deposit: { resource: 6 } }] } });
  rerender(<LegacySamplingRedirect params={params} />);
  expect(open).toHaveBeenCalledWith(1, 5, 6);
});
it('opens resources for an old start shortcut without a chosen resource', () => {
  render(<LegacySamplingRedirect />);
  expect(open).not.toHaveBeenCalled();
  expect(state.dispatchHudMenuOpened).toHaveBeenCalledWith('RESOURCES');
});
