import IconButton from '~/components/IconButton';
import { CrewIcon, UserIcon } from '~/components/Icons';
import { sameBridgeAddress } from '~/bridge/transfers';

export const hasCrewDelegation = (crew, ownerAddress) => (
  !!crew?.Crew?.delegatedTo
  && !sameBridgeAddress(crew.Crew.delegatedTo, '0x0')
  && !sameBridgeAddress(crew.Crew.delegatedTo, ownerAddress)
);

const BridgeAssetAction = ({ asset, assetType, chain, accountAddress, disabled, onMint, onDelegate }) => {
  let label;
  let onClick;
  let icon;
  let revoke = false;
  if (assetType === 'asteroids' && chain === 'ethereum' && asset.AsteroidReward?.hasMintableCrewmate) {
    label = 'Mint Crewmate';
    onClick = () => onMint(asset.id);
    icon = <UserIcon />;
  } else if (assetType === 'crews' && chain === 'starknet'
    && sameBridgeAddress(asset.Nft?.owners?.starknet || asset.Nft?.owner, accountAddress)) {
    revoke = hasCrewDelegation(asset, accountAddress);
    label = revoke ? 'Revoke Delegation' : 'Delegate Crew';
    onClick = () => onDelegate(asset, revoke);
    icon = <CrewIcon />;
  } else {
    return null;
  }

  return (
    <IconButton
      active={revoke}
      aria-label={label}
      dataTip={label}
      dataFor="launcherTooltip"
      dataPlace="left"
      disabled={disabled}
      marginless
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}>
      {icon}
    </IconButton>
  );
};

export default BridgeAssetAction;
