import { render } from '@testing-library/react';
import Resources from './Resources';
import useStore from '~/hooks/useStore';
import { useProspecting } from '../../../prospecting/store';

jest.mock('~/hooks/useStore', () => jest.fn(), { virtual: true });
jest.mock('../../../prospecting/store', () => ({ useProspecting: { getState: jest.fn() } }));
jest.mock('./components/LotResources', () => () => null);
jest.mock('./components/AsteroidResources', () => () => null);

it.each([false, true])('preserves the heatmap only when handing off to prospecting: %s', (active) => {
  const toggle = jest.fn();
  useStore.mockImplementation((select) => select({
    asteroids: { origin: 1, lot: 2 }, dispatchResourceMapToggle: toggle
  }));
  useProspecting.getState.mockReturnValue({ active });
  const { unmount } = render(<Resources />);
  unmount();
  if (active) expect(toggle).not.toHaveBeenCalled();
  else expect(toggle).toHaveBeenCalledWith(false);
});
