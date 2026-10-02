import { errorMessages } from '../lib/errorMessages';
import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';

import AddressLink from '~/components/AddressLink';
import GenericDialog from '~/components/GenericDialog';
import UncontrolledTextArea from '~/components/TextAreaUncontrolled';
import useWalletCrews from '~/hooks/useWalletCrews';
import formatters from '~/lib/formatters';
import { nativeBool } from '~/lib/utils';
import { LockIcon } from './Icons';
import useDirectMessageManager from '~/hooks/actionManagers/useDirectMessageManager';
import useStore from '~/hooks/useStore';
import PageLoader from './PageLoader';

const Wrapper = styled.div`
  border-bottom: 1px solid #222;
  border-top: 1px solid #222;
  padding: 15px 0;
  text-align: left;

  & > label {
    display: block;
    margin-top: 15px;
    margin-bottom: 5px;
    &:first-child {
      margin-top: 0;
    }
  }

  textarea {
    height: 200px;
  }
`;
const Recipient = styled.div`
  border-left: 4px solid ${p => p.theme.colors.main};
  padding: 8px 10px;
  & > div {
    font-size: 13px;
    margin-top: 2px;
    opacity: 0.5;
  }
`;

const Footnote = styled.div`
  font-size: 12px;
  text-align: center;
  transition: color 150ms ease, opacity 150ms ease;
  ${p => p.highlight
    ? `color: ${p.theme.colors.success};`
    : `opacity: 0.3;`
  }
`;

const SendingOverlayWrapper = styled.div`
  background: #171717;
  border: 1px solid rgba(${p => p.theme.colors.mainRGB}, 0.3);
  color: #555;
  pointer-events: all;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1;
`;

const DirectMessageDialog = ({ onClose, recipient }) => {
  const { data: crews } = useWalletCrews(recipient);
  const { encryptMessage, sendEncryptedMessage, isHashing, isSending } = useDirectMessageManager(recipient);
  const createAlert = useStore(s => s.dispatchAlertLogged);
  
  const [encryptedMessage, setEncryptedMessage] = useState();
  const [message, setMessage] = useState('');

  const sortedCrews = useMemo(() => {
    return crews?.sort((a, b) => (a.Name?.name || `Crew #${a.id}`).toLowerCase() < (b.Name?.name || `Crew #${b.id}`).toLowerCase() ? -1 : 1);
  }, [crews]);

  const sendMessage = useCallback(async () => {
    if (message?.length > 0) {
      const encryptedData = await encryptMessage(message);
      if (!encryptedData) {
        createAlert({
          type: 'GenericAlert',
          level: 'warning',
          data: { content: errorMessages.messageFailed },
          duration: 5000
        });
        return;
      }

      // set encrypted message (vanity)
      setEncryptedMessage(btoa(JSON.stringify(encryptedData)));
      
      // send encrypted message
      await sendEncryptedMessage(encryptedData);
      setEncryptedMessage(null);
      
    } else {
      createAlert({
        type: 'GenericAlert',
        level: 'warning',
        data: { content: errorMessages.emptyMessage },
        duration: 5000
      });
    }
  }, [message]);

  const wasSending = useRef();
  useEffect(() => {
    if (isSending) {
      setMessage('');
      wasSending.current = true;
    } else if (wasSending.current) {
      onClose();
    }
  }, [onClose, isSending]);

  return (
    <GenericDialog
      onConfirm={isSending ? onClose : sendMessage}
      onReject={isSending ? undefined : onClose}
      title="Direct Message"
      confirmText={isSending ? 'Close' : 'Send'}
      rejectText="Cancel"
      confirmButtonProps={isHashing ? { disabled: true, loading: true } : {}}
      rejectButtonProps={isHashing ? { disabled: isHashing } : {}}>
      <Wrapper>
        <Recipient>
          <label><AddressLink address={recipient} doNotReplaceYou /></label>
          <div style={{ maxHeight: 54, overflow: 'auto' }}>
            {sortedCrews?.map((c, i) => (
              <Fragment key={c.id}>
                {i > 0 && ', '}{formatters.crewName(c)}
              </Fragment>
            ))}
          </div>
        </Recipient>

        <label>Message</label>
        <div style={{ position: 'relative' }}>
          {isSending && (
            <SendingOverlayWrapper>
              <PageLoader message="Sending..." />
            </SendingOverlayWrapper>
          )}
          <UncontrolledTextArea
            disabled={nativeBool(encryptedMessage)}
            onChange={(e) => setMessage(e.currentTarget.value || '')}
            placeholder="Write your message..."
            value={message} />
        </div>
        {isSending || encryptedMessage
          ? <Footnote highlight><LockIcon /> Message Encrypted</Footnote>
          : <Footnote>Your message will be encrypted such that only you and the recipient can decrypt it.</Footnote>
        }
        
      </Wrapper>
    </GenericDialog>
  );
};

export default DirectMessageDialog;