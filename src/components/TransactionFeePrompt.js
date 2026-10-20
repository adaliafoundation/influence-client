import { errorMessages } from '../lib/errorMessages';
import GenericDialog from './GenericDialog';
import WarningAlert from './WarningAlert';
import { WarningIcon } from './Icons';

const copy = errorMessages.feePrompts;

const TransactionFeePrompt = ({ accountAddress, onConfirm, onReject, type, busy = false }) => {
  const prompt = copy[type];
  if (!prompt) return null;
  const sessionRecovery = type === 'SESSION_FEE_LIMIT';

  return (
    <GenericDialog
      role="dialog"
      aria-modal="true"
      aria-label={prompt.title}
      title={prompt.title}
      alignActionsRight
      onConfirm={onConfirm}
      confirmText={busy ? 'Waiting for wallet…' : prompt.confirmText}
      confirmButtonProps={{ disabled: busy }}
      onReject={onReject}
      rejectText={prompt.rejectText || errorMessages.notNow}
      rejectButtonProps={{ disabled: busy }}>
      {sessionRecovery && (
        <WarningAlert severity="warning" role="alert">
          <div><WarningIcon /></div>
          <div>{prompt.body[0]}</div>
        </WarningAlert>
      )}
      {prompt.body.slice(sessionRecovery ? 1 : 0).map(text => <p key={text}>{text}</p>)}
      {type === 'TOP_UP_STRK' && accountAddress && (
        <p>Account address: <code style={{ overflowWrap: 'anywhere' }}>{accountAddress}</code></p>
      )}
    </GenericDialog>
  );
};

export default TransactionFeePrompt;
