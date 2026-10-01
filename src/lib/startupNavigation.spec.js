import { resetReloadNavigation } from './startupNavigation';

const browser = (type) => ({
  performance: { getEntriesByType: () => type ? [{ type }] : [] },
  location: { pathname: '/asteroids/1', search: '?checkout_session_id=return-token', hash: '#wallet-return' },
  history: { replaceState: jest.fn() }
});

test('clears route-based navigation on refresh without dropping return-flow parameters', () => {
  const window = browser('reload');
  resetReloadNavigation(window);
  expect(window.history.replaceState).toHaveBeenCalledWith(null, '', '/?checkout_session_id=return-token#wallet-return');
});

test.each(['navigate', 'back_forward', undefined])('preserves explicit links on %s navigation', (type) => {
  const window = browser(type);
  resetReloadNavigation(window);
  expect(window.history.replaceState).not.toHaveBeenCalled();
});
