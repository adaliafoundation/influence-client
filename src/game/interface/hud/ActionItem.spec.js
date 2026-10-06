import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import ActionItem from './ActionItem';
import useLot from '~/hooks/useLot';
import useStore from '~/hooks/useStore';
import { useLotLink } from '~/components/LotLink';

jest.mock('react-router-dom', () => ({ useHistory: () => ({}) }));
jest.mock('~/appConfig', () => ({ appConfig: { get: () => '' } }), { virtual: true });
jest.mock('~/components/Icons', () => ({ CloseIcon: () => null, EyeIcon: () => null }), { virtual: true });
jest.mock('~/components/AnimatedIcons', () => ({ FailedIcon: () => null }), { virtual: true });
jest.mock('~/components/LiveTimer', () => () => null, { virtual: true });
jest.mock('~/components/IconButton', () => () => null, { virtual: true });
jest.mock('~/components/LotLink', () => ({ useLotLink: jest.fn(() => jest.fn()) }), { virtual: true });
jest.mock('~/hooks/useAsteroid', () => () => ({}), { virtual: true });
jest.mock('~/hooks/useLot', () => jest.fn(() => ({})), { virtual: true });
jest.mock('~/hooks/useStore', () => jest.fn(selector => selector({ asteroids: { resourceMap: {} } })), { virtual: true });
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

test('objective rows do not preload lots and still navigate to the correct action', () => {
  jest.useFakeTimers();
  const dispatchActionDialog = jest.fn();
  const navigate = jest.fn();
  useLotLink.mockReturnValue(navigate);
  useStore.mockImplementation(selector => selector({
    asteroids: { resourceMap: {} }, dispatchActionDialog
  }));
  const items = Array.from({ length: 24 }, (_, index) => ({
    type: 'plan', label: `Construction ${index}`, asteroidId: 1, lotId: index + 100,
    onClick: ({ openDialog }) => openDialog('CONSTRUCT')
  }));
  try {
    render(<ThemeProvider theme={{ colors: {}, cursors: {} }}>
      {items.map(data => <ActionItem key={data.lotId} data={data} getActivityConfig={jest.fn()} />)}
    </ThemeProvider>);
    expect(useLot).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Construction 3'));
    expect(navigate).toHaveBeenCalledTimes(1);
    act(() => jest.runOnlyPendingTimers());
    expect(dispatchActionDialog).toHaveBeenCalledWith('CONSTRUCT', { asteroidId: 1, lotId: 103 });
    expect(useLot).not.toHaveBeenCalled();
  } finally {
    jest.useRealTimers();
  }
});
