import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { Asteroid } from '@influenceth/sdk';
import LotResources from './LotResources';

jest.mock('@influenceth/sdk', () => {
  global.TextEncoder = require('util').TextEncoder;
  global.TextDecoder = require('util').TextDecoder;
  return jest.requireActual('@influenceth/sdk');
});

jest.mock('~/components/Icons', () => ({ WarningIcon: () => <svg /> }), { virtual: true });
jest.mock('~/components/ResourceThumbnail', () => () => null, { virtual: true });
jest.mock('~/components/ButtonAlt', () => () => null, { virtual: true });
jest.mock('~/components/EntityLink', () => () => null, { virtual: true });
jest.mock('~/hooks/actionManagers/useCoreSampleManager', () => () => ({}), { virtual: true });
jest.mock('~/hooks/actionManagers/useExtractionManager', () => () => ({}), { virtual: true });
jest.mock('~/hooks/actionManagers/useDepositSaleManager', () => () => ({}), { virtual: true });
jest.mock('~/hooks/useActionButtons', () => () => ({}), { virtual: true });
jest.mock('~/hooks/useCrewContext', () => () => ({ accountCrewIds: [] }), { virtual: true });
jest.mock('~/hooks/useLot', () => () => ({ data: { deposits: [] } }), { virtual: true });
jest.mock('~/hooks/useAsteroid', () => () => ({
  data: { Celestial: { celestialType: 1, bonuses: 0, scanStatus: 2 } }
}), { virtual: true });
jest.mock('~/hooks/useStore', () => (selector) => selector({
  asteroids: { lot: 1, resourceMap: {} }
}), { virtual: true });
jest.mock('~/lib/utils', () => ({}), { virtual: true });
jest.mock('~/theme', () => ({}), { virtual: true });
jest.mock('../../actionButtons', () => ({}));
jest.mock('./ListForSalePanel', () => ({}));
jest.mock('./components', () => ({
  HudMenuCollapsibleSection: ({ children }) => <div>{children}</div>,
  Scrollable: ({ children }) => <div>{children}</div>
}));

test('selecting a lot before the surface scan displays the message without calculating abundances', () => {
  const getAbundances = jest.spyOn(Asteroid.Entity, 'getAbundances');
  render(<ThemeProvider theme={{ colors: { warning: 'orange' } }}><LotResources /></ThemeProvider>);
  expect(screen.getByText('Complete orbital scan to reveal resource distributions')).toBeTruthy();
  expect(getAbundances).not.toHaveBeenCalled();
  getAbundances.mockRestore();
});
