import { useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { validateAndParseAddress } from 'starknet';

import ActionSubmissionProvider from '~/components/ActionSubmissionProvider';
import GenericDialog from '~/components/GenericDialog';
import StatusMessage from '~/components/StatusMessage';
import UncontrolledTextInput from '~/components/TextInputUncontrolled';
import { useActionSubmission } from '~/contexts/ActionSubmissionContext';
import { sameBridgeAddress } from '~/bridge/transfers';

const Content = styled.article`
  line-height: 1.5;
  overflow-wrap: anywhere;
  & > p:first-child { margin-top: 0; font-weight: bold; }
  & label { display: block; margin: 20px 0; }
  & > div:not(:empty) { margin-top: 16px; }
`;

const AddressInput = styled(UncontrolledTextInput)`
  box-sizing: border-box;
  margin-top: 8px;
`;

const normalizeAddress = (address) => {
  try {
    const normalized = validateAndParseAddress(address.trim());
    return BigInt(normalized) > 0n ? normalized : '';
  } catch {
    return '';
  }
};

export const AssetRecipientForm = ({ assetName, ownerAddress, initialAddress = '', readOnly = false, currentAddress, title, description, successMessage, actionName, onSubmit, getStatus, onClose, onSuccess }) => {
  const submission = useActionSubmission();
  const [address, setAddress] = useState(initialAddress);
  const [result, setResult] = useState(null);
  const normalizedAddress = normalizeAddress(address);
  const busy = submission.busy || getStatus(normalizedAddress) === 'pending';
  const succeeded = result === 'indexed';
  const unchanged = sameBridgeAddress(normalizedAddress, currentAddress);
  const disabled = !normalizedAddress || unchanged || busy || succeeded || result === 'unknown'
    || (!readOnly && sameBridgeAddress(normalizedAddress, ownerAddress));

  const submit = async () => {
    if (disabled) return;
    setResult(null);
    const outcome = await onSubmit(normalizedAddress);
    if (outcome?.status === 'dismissed') return;
    setResult(outcome?.status || 'failed');
    if (outcome?.status === 'indexed') onSuccess(normalizedAddress);
  };

  return (
    <GenericDialog
      role="dialog"
      aria-modal="true"
      aria-label={title}
      title={title}
      onConfirm={succeeded ? onClose : submit}
      confirmText={succeeded ? 'Close' : title}
      onReject={succeeded ? undefined : onClose}
      rejectText="Close"
      disabled={!succeeded && disabled}
      isTransaction={!succeeded}>
      <Content>
        <p>{assetName}</p>
        <p>{description}</p>
        <label>
          Starknet account address
          <AddressInput
            autoFocus={!readOnly}
            value={address}
            placeholder="0x..."
            readOnly={readOnly}
            disabled={busy || succeeded || result === 'unknown'}
            onChange={(event) => { setAddress(event.target.value); setResult(null); }} />
        </label>
        {address && !normalizedAddress && (
          <StatusMessage role="alert" tone="error" title="Invalid address">
            Enter a valid, nonzero Starknet account address.
          </StatusMessage>
        )}
        {unchanged && !succeeded && (
          <StatusMessage tone="warning" title="No change needed">
            This account is already the recipient.
          </StatusMessage>
        )}
        <div role="status" aria-live="polite" aria-atomic="true">
          {busy && (
            <StatusMessage tone="main" title="Pending confirmation">
              Waiting for the wallet and transaction confirmation…
            </StatusMessage>
          )}
          {succeeded && (
            <StatusMessage tone="success" title="Success">
              {successMessage}
            </StatusMessage>
          )}
          {result === 'unknown' && (
            <StatusMessage tone="warning" title="Outcome unknown">
              The transaction outcome is not yet known. Check your wallet before trying again.
            </StatusMessage>
          )}
          {result && !['indexed', 'unknown'].includes(result) && (
            <StatusMessage tone="error" title={`${actionName} incomplete`}>
              {actionName} was not completed. You can try again.
            </StatusMessage>
          )}
        </div>
      </Content>
    </GenericDialog>
  );
};

const BridgeAssetRecipientDialog = ({ children, onClose }) => createPortal(
  <ActionSubmissionProvider onClose={onClose}>{children}</ActionSubmissionProvider>,
  document.body
);

export default BridgeAssetRecipientDialog;
