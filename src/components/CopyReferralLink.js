import { useCallback } from 'react';
import styled from 'styled-components';

import useSession from '~/hooks/useSession';
import useStore from '~/hooks/useStore';
import { copyTextToClipboard } from '~/lib/clipboard';

const StyledClipboard = styled.span`
  cursor: pointer;
  text-decoration: none;
`;

const CopyReferralLink = ({ children, fallbackContent }) => {
  const { accountAddress } = useSession();
  const createAlert = useStore(s => s.dispatchAlertLogged);
  const playSound = useStore(s => s.dispatchEffectStartRequested);

  const handleClick = useCallback(async () => {
    const copied = await copyTextToClipboard(`${document.location.origin}/play?r=${accountAddress}`);
    playSound('click');
    createAlert({
      type: 'ClipboardAlert',
      data: { content: copied ? 'Recruitment link copied to clipboard.' : 'Unable to copy recruitment link.' },
    });
  }, [accountAddress, createAlert, playSound]);

  if (!accountAddress) return fallbackContent || null;
  return (
    <StyledClipboard
      onClick={handleClick}>
      {children}
    </StyledClipboard>
  );
}

export default CopyReferralLink;
