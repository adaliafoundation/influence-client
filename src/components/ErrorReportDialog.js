import { useState } from 'react';
import styled from 'styled-components';
import GenericDialog from './GenericDialog';
import UncontrolledTextArea from './TextAreaUncontrolled';
import { errorMessages } from '../lib/errorMessages';

const ReportField = styled(UncontrolledTextArea)`
  box-sizing: border-box;
  height: min(40vh, 400px);
  font-family: 'Jetbrains Mono', monospace;
  font-size: 12px;
`;

const CopyStatus = styled.p`
  min-height: 1.5em;
  margin: 8px 0 0;
`;

const ErrorReportDialog = ({ report, onClose }) => {
  const [copyState, setCopyState] = useState(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopyState('copied');
    } catch (error) {
      setCopyState('copyFailed');
    }
  };
  return <GenericDialog
    role="dialog"
    aria-modal="true"
    aria-label={errorMessages.reportTitle}
    title={errorMessages.reportTitle}
    onConfirm={copy}
    confirmText={errorMessages.copyReport}
    onReject={onClose}
    rejectText={errorMessages.close}>
    <p>{errorMessages.reportHelp}</p>
    <ReportField aria-label={errorMessages.reportTitle} readOnly value={report}
      onFocus={event => event.target.select()} />
    <CopyStatus role="status">{copyState ? errorMessages[copyState] : ''}</CopyStatus>
  </GenericDialog>;
};
export default ErrorReportDialog;
