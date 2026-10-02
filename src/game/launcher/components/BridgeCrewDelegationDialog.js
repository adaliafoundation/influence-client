import { useState } from 'react';
import { createPortal } from 'react-dom';
import styled from 'styled-components';
import { validateAndParseAddress } from 'starknet';

import ActionSubmissionProvider from '~/components/ActionSubmissionProvider';
import GenericDialog from '~/components/GenericDialog';
import StatusMessage from '~/components/StatusMessage';
import UncontrolledTextInput from '~/components/TextInputUncontrolled';
import { useActionSubmission } from '~/contexts/ActionSubmissionContext';
import useCrewDelegationManager from '~/hooks/actionManagers/useCrewDelegationManager';
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

const DelegationForm = ({ crew, ownerAddress, revoke, onClose, onDelegated }) => {
  const { delegateCrew, getDelegationStatus } = useCrewDelegationManager(crew.id);
  const submission = useActionSubmission();
  const [address, setAddress] = useState(revoke ? ownerAddress : '');
  const [result, setResult] = useState(null);
  const normalizedAddress = normalizeAddress(address);
  const busy = submission.busy || getDelegationStatus(normalizedAddress) === 'pending';
  const succeeded = result === 'indexed';
  const unchanged = sameBridgeAddress(normalizedAddress, crew.Crew?.delegatedTo);
  const disabled = !normalizedAddress || unchanged || busy || succeeded || result === 'unknown'
    || (!revoke && sameBridgeAddress(normalizedAddress, ownerAddress));
  const title = revoke ? 'Revoke Delegation' : 'Delegate Crew';

  const submit = async () => {
    if (disabled) return;
    setResult(null);
    const outcome = await delegateCrew(normalizedAddress);
    if (outcome?.status === 'dismissed') return;
    setResult(outcome?.status || 'failed');
    if (outcome?.status === 'indexed') onDelegated(crew.id, normalizedAddress);
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
        <p>{crew.Name?.name || `Crew #${crew.id}`}</p>
        <p>{revoke
          ? 'Return control of this crew to your Starknet account.'
          : 'Enter the Starknet account that will control this crew. You retain ownership of the crew NFT.'}</p>
        <label>
          Starknet account address
          <AddressInput
            autoFocus={!revoke}
            value={address}
            placeholder="0x..."
            readOnly={revoke}
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
            This account already controls the crew.
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
              {revoke ? 'Delegation revoked. Your account controls this crew again.' : 'Crew delegated successfully.'}
            </StatusMessage>
          )}
          {result === 'unknown' && (
            <StatusMessage tone="warning" title="Outcome unknown">
              The transaction outcome is not yet known. Check your wallet before trying again.
            </StatusMessage>
          )}
          {result && !['indexed', 'unknown'].includes(result) && (
            <StatusMessage tone="error" title="Delegation incomplete">
              Delegation was not completed. You can try again.
            </StatusMessage>
          )}
        </div>
      </Content>
    </GenericDialog>
  );
};

const BridgeCrewDelegationDialog = (props) => createPortal(
  <ActionSubmissionProvider onClose={props.onClose}>
    <DelegationForm {...props} />
  </ActionSubmissionProvider>,
  document.body
);

export default BridgeCrewDelegationDialog;
