import useCrewDelegationManager from '~/hooks/actionManagers/useCrewDelegationManager';
import BridgeAssetRecipientDialog, { AssetRecipientForm } from './BridgeAssetRecipientDialog';

const DelegationForm = ({ crew, ownerAddress, revoke, onClose, onDelegated }) => {
  const { delegateCrew, getDelegationStatus } = useCrewDelegationManager(crew.id);
  return <AssetRecipientForm
    assetName={crew.Name?.name || `Crew #${crew.id}`}
    ownerAddress={ownerAddress}
    initialAddress={revoke ? ownerAddress : ''}
    readOnly={revoke}
    currentAddress={crew.Crew?.delegatedTo}
    title={revoke ? 'Revoke Delegation' : 'Delegate Crew'}
    description={revoke
      ? 'Return control of this crew to your Starknet account.'
      : 'Enter the Starknet account that will control this crew. You retain ownership of the crew NFT.'}
    successMessage={revoke ? 'Delegation revoked. Your account controls this crew again.' : 'Crew delegated successfully.'}
    actionName="Delegation"
    onSubmit={delegateCrew}
    getStatus={getDelegationStatus}
    onClose={onClose}
    onSuccess={(address) => onDelegated(crew.id, address)} />;
};

const BridgeCrewDelegationDialog = (props) => (
  <BridgeAssetRecipientDialog onClose={props.onClose}><DelegationForm {...props} /></BridgeAssetRecipientDialog>
);
export default BridgeCrewDelegationDialog;
