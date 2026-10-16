import { useCallback } from 'react';
import useStore from '~/hooks/useStore';
import { copyTextToClipboard } from '~/lib/clipboard';
import { errorMessages } from '~/lib/errorMessages';

const useCopyWalletAddress = (address) => {
  const createAlert = useStore(s => s.dispatchAlertLogged);
  return useCallback(async () => {
    const copied = await copyTextToClipboard(address);
    createAlert({
      type: copied ? 'ClipboardAlert' : 'GenericAlert',
      data: { content: copied ? 'Wallet address copied to clipboard.' : errorMessages.copyFailed },
      duration: 3000
    });
  }, [address, createAlert]);
};

export default useCopyWalletAddress;
