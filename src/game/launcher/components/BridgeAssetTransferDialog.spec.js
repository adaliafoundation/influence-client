import { ThemeProvider } from 'styled-components';
import theme from '../../../theme';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import { notifyTransactionSettlement } from '../../../lib/transactionSettlement';
import BridgeAssetTransferDialog from './BridgeAssetTransferDialog';

jest.mock('~/contexts/ChainTransactionContext', () => ({ __esModule: true, default: require('react').createContext(null) }), { virtual: true });
jest.mock('~/contexts/ActionSubmissionContext', () => jest.requireActual('../../../contexts/ActionSubmissionContext'), { virtual: true });
jest.mock('~/components/ActionSubmissionProvider', () => jest.requireActual('../../../components/ActionSubmissionProvider'), { virtual: true });
jest.mock('~/hooks/actionManagers/useCrewDelegationManager', () => jest.requireActual('../../../hooks/actionManagers/useCrewDelegationManager'), { virtual: true });
jest.mock('starknet', () => {
  global.TextEncoder = require('util').TextEncoder;
  global.TextDecoder = require('util').TextDecoder;
  return jest.requireActual('starknet');
});
jest.mock('@influenceth/sdk', () => ({ Entity: { IDS: { CREW: 1 } } }));
jest.mock('~/bridge/transfers', () => jest.requireActual('../../../bridge/transfers'), { virtual: true });
jest.mock('~/components/StatusMessage', () => jest.requireActual('../../../components/StatusMessage'), { virtual: true });
jest.mock('~/components/GenericDialog', () => jest.requireActual('../../../components/GenericDialog'), { virtual: true });
jest.mock('~/components/TextInputUncontrolled', () => jest.requireActual('../../../components/TextInputUncontrolled'), { virtual: true });
jest.mock('~/assets/images/cursor.png', () => '', { virtual: true });
jest.mock('~/assets/images/cursor-active.png', () => '', { virtual: true });
jest.mock('~/theme', () => jest.requireActual('../../../theme'), { virtual: true });
jest.mock('~/components/Loader', () => () => null, { virtual: true });
jest.mock('~/components/NavIcon', () => () => null, { virtual: true });
jest.mock('~/lib/utils', () => ({ nativeBool: Boolean }), { virtual: true });
jest.mock('~/components/Dialog', () => ({ children }) => <div>{children}</div>, { virtual: true });
jest.mock('~/components/ButtonAlt', () => ({ children, disabled, onClick }) => <button disabled={disabled} onClick={onClick}>{children}</button>, { virtual: true });
jest.mock('~/hooks/useStore', () => ({ getState: () => ({ dispatchAlertLogged: jest.fn() }) }), { virtual: true });
jest.mock('../../../lib/errorReporting', () => ({ reportFailure: jest.fn() }));

jest.mock('~/bridge/assets', () => ({ getBridgeAssetConfig: (type) => ({
  starknetAssetAddress: { crews: '0xc', crewmates: '0xd', asteroids: '0xe', ships: '0xf' }[type],
  starknetName: { crews: 'Crew', crewmates: 'Crewmate', asteroids: 'Asteroid', ships: 'Ship' }[type]
}) }), { virtual: true });

let execute, onTransferred;
const view = (assetType = 'crews') => <ThemeProvider theme={theme}>
  <ChainTransactionContext.Provider value={{ execute, getStatus: () => 'ready' }}>
    <BridgeAssetTransferDialog asset={{ id: 12 }} assetType={assetType} ownerAddress="0xa"
      onClose={jest.fn()} onTransferred={onTransferred} />
  </ChainTransactionContext.Provider>
</ThemeProvider>;
const setAddress = (value) => fireEvent.change(screen.getByLabelText('Starknet account address'), { target: { value } });

beforeEach(() => {
  execute = jest.fn().mockResolvedValue({ status: 'submitted', txHash: '0x456' });
  onTransferred = jest.fn();
});

test.each(['crews', 'crewmates', 'asteroids', 'ships'])('transfers %s through explicit wallet approval and waits for indexing', async (type) => {
  render(view(type));
  const name = { crews: 'Crew', crewmates: 'Crewmate', asteroids: 'Asteroid', ships: 'Ship' }[type];
  expect(screen.getByRole('dialog', { name: `Transfer ${name}` })).toBeTruthy();
  expect(screen.getByText(/You will no longer own it/)).toBeTruthy();
  for (const address of ['', 'invalid', '0x0', '0x' + 'f'.repeat(64), '0x000a']) {
    setAddress(address);
    expect(screen.getByRole('button', { name: `Transfer ${name}` }).disabled).toBe(true);
  }
  setAddress('0xb');
  fireEvent.click(screen.getByRole('button', { name: `Transfer ${name}` }));
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
  expect(execute).toHaveBeenCalledWith('TransferNft', {
    tokenAddress: { crews: '0xc', crewmates: '0xd', asteroids: '0xe', ships: '0xf' }[type], tokenId: 12, from: '0xa', to: expect.any(String)
  }, {}, { requireExplicitSignature: true });
  expect(BigInt(execute.mock.calls[0][1].to)).toBe(11n);
  expect(onTransferred).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: `Transfer ${name}` }).disabled).toBe(true);
  await act(async () => notifyTransactionSettlement('0x456', 'indexed'));
  expect(screen.getByText(`${name} transferred successfully.`)).toBeTruthy();
  expect(onTransferred).toHaveBeenCalledWith(12, expect.any(String));
});

test.each(['failed', 'unknown'])('does not remove an asset after a %s transfer', async (status) => {
  render(view());
  setAddress('0xb');
  fireEvent.click(screen.getByRole('button', { name: 'Transfer Crew' }));
  await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
  await act(async () => notifyTransactionSettlement('0x456', status));
  expect(onTransferred).not.toHaveBeenCalled();
  expect(screen.getByRole('status').textContent).toContain(status === 'unknown' ? 'not yet known' : 'Transfer was not completed');
  expect(screen.getByRole('button', { name: 'Transfer Crew' }).disabled).toBe(status === 'unknown');
});
