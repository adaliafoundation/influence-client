import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PuffLoader } from 'react-spinners';

import { TOKEN, TOKEN_SCALE } from '~/lib/priceUtils';
import useSession from '~/hooks/useSession';
import { nativeBool } from '~/lib/utils';
import UserPrice from '~/components/UserPrice';
import api from '~/lib/api';
import useFaucetInfo from '~/hooks/useFaucetInfo';
import BrightButton from '~/components/BrightButton';

const EthFaucetButton = ({ onError, onProcessing, onSuccess, noLabel }) => {
  const queryClient = useQueryClient();
  const { data: faucetInfo, isLoading: faucetInfoLoading } = useFaucetInfo();
  const { accountAddress, login, provider } = useSession();

  const [requestingEth, setRequestingEth] = useState();

  const ethEnabled = useMemo(() => {
    if (!faucetInfo) return false;
    const lastClaimed = faucetInfo.ETH.lastClaimed || 0;
    return Date.now() > (Date.parse(lastClaimed) + 23.5 * 3600e3);
  }, [faucetInfo]);

  const requestEth = useCallback(async () => {
    if (!accountAddress) return login();
    
    setRequestingEth(true);

    try {
      const txHash = await api.requestTokens('ETH');
      await provider.waitForTransaction(txHash);

      setRequestingEth(false);

      if (onSuccess) onSuccess();
    } catch (e) {
      console.error(e);
      setRequestingEth(false);
      if (onError) onError('Faucet request failed, please try again later.');
    }

    queryClient.invalidateQueries({ queryKey: ['faucetInfo'], refetchType: 'none' });
    queryClient.refetchQueries({ queryKey: ['faucetInfo'], type: 'active' });
    queryClient.invalidateQueries({ queryKey: ['walletBalance', 'eth'] });
  }, [provider]);

  useEffect(() => {
    if (onProcessing) onProcessing(requestingEth);
  }, [onProcessing, requestingEth]);

  const disabled = (accountAddress && !ethEnabled) || requestingEth || faucetInfoLoading;
  return (
    <BrightButton
      onClick={requestEth}
      disabled={nativeBool(disabled)}
      success>
      {!noLabel && <label>ETH Faucet (Daily)</label>}
      <span style={noLabel ? {} : { textAlign: 'right' }}>
        {(requestingEth || faucetInfoLoading)
          ? <span style={{ alignItems: 'center', display: 'inline-flex', width: 24, height: 24 }}><PuffLoader size="20px" color="white" /></span>
          : (
            <>
              +<UserPrice price={0.015 * TOKEN_SCALE[TOKEN.ETH]} priceToken={TOKEN.ETH} format />
            </>
          )}
      </span>
    </BrightButton>
  );
}

export default EthFaucetButton;
