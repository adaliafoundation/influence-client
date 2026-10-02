import { fireEvent, render, screen } from '@testing-library/react';
import BridgeAssetAction from './BridgeAssetAction';

jest.mock('~/components/IconButton', () => ({ children, onClick, disabled, dataTip, ...props }) => (
  <button aria-label={props['aria-label']} title={dataTip} disabled={disabled} onClick={onClick}>{children}</button>
), { virtual: true });
jest.mock('~/components/Icons', () => ({ CrewIcon: () => null, UserIcon: () => null }), { virtual: true });
jest.mock('~/bridge/transfers', () => jest.requireActual('../../../bridge/transfers'), { virtual: true });

test('mints only the clicked asteroid without toggling bridge selection', () => {
  const onMint = jest.fn();
  const select = jest.fn();
  render(<div onClick={select}><BridgeAssetAction
    asset={{ id: 141, AsteroidReward: { hasMintableCrewmate: true } }}
    assetType="asteroids" chain="ethereum" onMint={onMint} /></div>);
  const button = screen.getByRole('button', { name: 'Mint Crewmate' });
  expect(button.title).toBe('Mint Crewmate');
  fireEvent.click(button);
  expect(onMint).toHaveBeenCalledWith(141);
  expect(select).not.toHaveBeenCalled();
});

test('does not offer minting on Starknet or for an already claimed asteroid', () => {
  const { rerender } = render(<BridgeAssetAction asset={{ id: 1 }} assetType="asteroids" chain="ethereum" />);
  expect(screen.queryByRole('button')).toBeNull();
  rerender(<BridgeAssetAction asset={{ id: 1, AsteroidReward: { hasMintableCrewmate: true } }} assetType="asteroids" chain="starknet" />);
  expect(screen.queryByRole('button')).toBeNull();
});

test('owned Starknet crews switch between delegation and revocation without selecting the row', () => {
  const onDelegate = jest.fn();
  const select = jest.fn();
  const crew = { id: 2, Nft: { owners: { starknet: '0x000a' } }, Crew: { delegatedTo: '0xa' } };
  const view = (asset) => <div onClick={select}><BridgeAssetAction asset={asset} assetType="crews"
    chain="starknet" accountAddress="0xa" onDelegate={onDelegate} /></div>;
  const { rerender } = render(view(crew));
  fireEvent.click(screen.getByRole('button', { name: 'Delegate Crew' }));
  expect(onDelegate).toHaveBeenLastCalledWith(crew, false);
  const delegated = { ...crew, Crew: { delegatedTo: '0xb' } };
  rerender(view(delegated));
  fireEvent.click(screen.getByRole('button', { name: 'Revoke Delegation' }));
  expect(onDelegate).toHaveBeenLastCalledWith(delegated, true);
  expect(select).not.toHaveBeenCalled();
  rerender(view(crew));
  expect(screen.getByRole('button', { name: 'Delegate Crew' })).toBeTruthy();
});

test('cannot delegate another wallet’s crew or a crew on Ethereum', () => {
  const crew = { id: 2, Nft: { owners: { starknet: '0xb' } } };
  const { rerender } = render(<BridgeAssetAction asset={crew} assetType="crews" chain="starknet" accountAddress="0xa" />);
  expect(screen.queryByRole('button')).toBeNull();
  rerender(<BridgeAssetAction asset={crew} assetType="crews" chain="ethereum" accountAddress="0xb" />);
  expect(screen.queryByRole('button')).toBeNull();
});
