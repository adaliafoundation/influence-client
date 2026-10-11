import { useContext } from 'react';
import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import { getBridgeAssetConfig } from '~/bridge/assets';
import BridgeAssetRecipientDialog, { AssetRecipientForm } from './BridgeAssetRecipientDialog';

const TransferForm = ({ asset, assetType, ownerAddress, onClose, onTransferred }) => {
  const { execute, getStatus } = useContext(ChainTransactionContext);
  const config = getBridgeAssetConfig(assetType);
  const getVars = (to) => ({ tokenAddress: config.starknetAssetAddress, tokenId: asset.id, from: ownerAddress, to });
  return <AssetRecipientForm
    assetName={asset.Name?.name || `${config.starknetName} #${asset.id}`}
    ownerAddress={ownerAddress}
    currentAddress={ownerAddress}
    title={`Transfer ${config.starknetName}`}
    description={`Enter the Starknet account that will receive ownership of this ${config.starknetName.toLowerCase()} NFT. You will no longer own it and cannot revoke this transfer.`}
    successMessage={`${config.starknetName} transferred successfully.`}
    actionName="Transfer"
    onSubmit={(to) => execute('TransferNft', getVars(to), {}, { requireExplicitSignature: true })}
    getStatus={(to) => getStatus('TransferNft', getVars(to))}
    onClose={onClose}
    onSuccess={(address) => onTransferred(asset.id, address)} />;
};

const BridgeAssetTransferDialog = (props) => (
  <BridgeAssetRecipientDialog onClose={props.onClose}><TransferForm {...props} /></BridgeAssetRecipientDialog>
);
export default BridgeAssetTransferDialog;
