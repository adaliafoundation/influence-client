import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import styled from 'styled-components';
import BrightButton from '~/components/BrightButton';
import { PuffLoader } from 'react-spinners';

import Button from '~/components/ButtonAlt';
import { SwayIcon } from '~/components/Icons';
import PurchaseButtonInner from '~/components/PurchaseButtonInner';
import useFaucetInfo from '~/hooks/useFaucetInfo';
import useSession from '~/hooks/useSession';
import useStore from '~/hooks/useStore';
import api from '~/lib/api';
import { nativeBool, reactBool } from '~/lib/utils';
import theme from '~/theme';

const SwayFaucetButton = ({ noLabel }) => {
  const queryClient = useQueryClient();
  const { data: faucetInfo, isLoading: faucetInfoLoading } = useFaucetInfo();
  const { accountAddress, login, provider } = useSession();

  const createAlert = useStore(s => s.dispatchAlertLogged);

  const [requestingSway, setRequestingSway] = useState();

  const swayEnabled = useMemo(() => {
    if (!faucetInfo) return false;
    const lastClaimed = faucetInfo.SWAY.lastClaimed || 0;
    return Date.now() > (Date.parse(lastClaimed) + 23.5 * 3600e3);
  }, [faucetInfo]);

  const requestSway = useCallback(async () => {
    if (!accountAddress) return login();

    setRequestingSway(true);

    try {
      const txHash = await api.requestTokens('SWAY');
      await provider.waitForTransaction(txHash);

      createAlert({
        type: 'WalletAlert',
        data: { content: 'Added 400,000 SWAY to your account.' },
        // duration: 5000
      });
    } catch (e) {
      console.error(e);
      createAlert({
        type: 'GenericAlert',
        data: { content: 'Faucet request failed, please try again later.' },
        level: 'warning',
        duration: 5000
      });
    } finally {
      setRequestingSway(false);
    }

    queryClient.invalidateQueries({ queryKey: ['faucetInfo'], refetchType: 'none' });
    queryClient.refetchQueries({ queryKey: ['faucetInfo'], type: 'active' });
    queryClient.invalidateQueries({ queryKey: ['walletBalance', 'sway'] });
  }, [accountAddress, login, provider]);

  return (
    <BrightButton
      onClick={requestSway}
      disabled={nativeBool((accountAddress && !swayEnabled) || requestingSway || faucetInfoLoading)}>
      {!noLabel && <label>SWAY Faucet (Daily)</label>}
      <span style={noLabel ? {} : { textAlign: 'right' }}>
        {(requestingSway || faucetInfoLoading)
          ? <span style={{ alignItems: 'center', display: 'inline-flex', width: 24, height: 24 }}><PuffLoader size="20px" color="white" /></span>
          : (
            <span style={{ marginLeft: 10 }}>
              +<SwayIcon />{Number(400000).toLocaleString()}
            </span>
          )}
      </span>
    </BrightButton>
  );
}

export default SwayFaucetButton;
