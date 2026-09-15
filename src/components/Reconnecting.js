import { useEffect, useState } from 'react';

import FullpageInterstitial from '~/components/FullpageInterstitial';
import { AUTH_PHASES, getReconnectMessage } from '~/lib/authFlow';

const Reconnecting = ({ phase = AUTH_PHASES.RECONNECTING_WALLET, onLogout, walletName }) => {
  const [show, setShow] = useState(false);

  // give a moment to successfully connect without showing an extra screen...
  useEffect(() => {
    const to = setTimeout(() => {
      setShow(true);
    }, 1500);
    return () => clearTimeout(to);
  }, []);

  if (!show) return null;
  return (
    <FullpageInterstitial
      message={getReconnectMessage({ phase, walletName })}
      onSkip={onLogout}
      skipContent="Skip Login"
    />
  );
}

export default Reconnecting;
