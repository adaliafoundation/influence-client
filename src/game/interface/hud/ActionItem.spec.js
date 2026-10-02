import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import ActionItem from './ActionItem';

jest.mock('react-router-dom', () => ({ useHistory: () => ({}) }));
jest.mock('~/appConfig', () => ({ appConfig: { get: () => '' } }), { virtual: true });
jest.mock('~/components/Icons', () => ({ CloseIcon: () => null, EyeIcon: () => null }), { virtual: true });
jest.mock('~/components/AnimatedIcons', () => ({ FailedIcon: () => null }), { virtual: true });
jest.mock('~/components/LiveTimer', () => () => null, { virtual: true });
jest.mock('~/components/IconButton', () => () => null, { virtual: true });
jest.mock('~/components/LotLink', () => ({ useLotLink: () => jest.fn() }), { virtual: true });
jest.mock('~/hooks/useAsteroid', () => () => ({}), { virtual: true });
jest.mock('~/hooks/useLot', () => () => ({}), { virtual: true });
jest.mock('~/hooks/useStore', () => selector => selector({ asteroids: { resourceMap: {} } }), { virtual: true });
jest.mock('~/lib/formatters', () => ({}), { virtual: true });
jest.mock('~/lib/actionItem', () => ({
  formatActionItem: data => data, itemColors: {}, backgroundColors: {}, statuses: { failed: 'Failed' }
}), { virtual: true });

test('failed transaction rows never request a chain activity configuration', () => {
  const getActivityConfig = jest.fn();
  const data = { type: 'failed', category: 'tx', key: 'SampleDepositStart', label: 'Core sample', err: 'UNKNOWN_ERROR' };
  const view = <ThemeProvider theme={{ colors: {}, cursors: {} }}><ActionItem data={data} getActivityConfig={getActivityConfig} /></ThemeProvider>;
  const { rerender } = render(view);
  rerender(view);
  expect(getActivityConfig).not.toHaveBeenCalled();
});
