import styled from 'styled-components';
import IconButton from '~/components/IconButton';
import { CrewIcon, UserIcon, GoIcon } from '~/components/Icons';
import { getBridgeAssetConfig } from '~/bridge/assets';
import { sameBridgeAddress } from '~/bridge/transfers';

export const hasCrewDelegation = (crew, ownerAddress) => (
  !!crew?.Crew?.delegatedTo
  && !sameBridgeAddress(crew.Crew.delegatedTo, '0x0')
  && !sameBridgeAddress(crew.Crew.delegatedTo, ownerAddress)
);

const AssetActions = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 8px;
`;

const AssetButton = ({ label, active, disabled, onClick, children }) => (
  <IconButton
    active={active}
    aria-label={label}
    dataTip={label}
    dataFor="launcherTooltip"
    dataPlace="left"
    disabled={disabled}
    marginless
    onClick={(event) => { event.stopPropagation(); onClick(); }}>
    {children}
  </IconButton>
);

const BridgeAssetAction = ({ asset, assetType, chain, accountAddress, disabled, onMint, onDelegate, onTransfer }) => {
  if (assetType === 'asteroids' && chain === 'ethereum' && asset.AsteroidReward?.hasMintableCrewmate) {
    return <AssetButton label="Mint Crewmate" disabled={disabled} onClick={() => onMint(asset.id)}><UserIcon /></AssetButton>;
  }
  const config = getBridgeAssetConfig(assetType);
  if (chain !== 'starknet' || !config?.starknetAssetAddress
    || !sameBridgeAddress(asset.Nft?.owners?.starknet || asset.Nft?.owner, accountAddress)) return null;

  const revoke = hasCrewDelegation(asset, accountAddress);
  return <AssetActions>
    {assetType === 'crews' && (
      <AssetButton label={revoke ? 'Revoke Delegation' : 'Delegate Crew'} active={revoke}
        disabled={disabled} onClick={() => onDelegate(asset, revoke)}><CrewIcon /></AssetButton>
    )}
    <AssetButton label={`Transfer ${config.starknetName} Ownership`}
      disabled={disabled} onClick={() => onTransfer(asset)}><GoIcon /></AssetButton>
  </AssetActions>;
};

export default BridgeAssetAction;
