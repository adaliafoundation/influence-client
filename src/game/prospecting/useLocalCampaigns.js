import { useEffect, useMemo, useState } from 'react';
import { appConfig } from '~/appConfig';
import usePrivateDataKey from '~/hooks/usePrivateDataKey';
import useSession from '~/hooks/useSession';
import { campaignIdentity } from './campaignIdentity';
import { listCampaigns } from './campaignRepository';

export default function useLocalCampaigns(asteroidId) {
  const { accountAddress, chainId } = useSession(false);
  const { privateKey, publicKey, unlock } = usePrivateDataKey();
  const identity = useMemo(() => campaignIdentity({
    chainId, dispatcher: appConfig.get('Starknet.Address.dispatcher'), owner: accountAddress,
    asteroidId, originIndex: 1, resource: 1
  }), [chainId, accountAddress, asteroidId]);
  const [result, setResult] = useState(null);
  const ready = !!(identity && privateKey && publicKey);
  useEffect(() => {
    if (!ready) { setResult(null); return undefined; }
    let cancelled = false;
    listCampaigns(identity, publicKey, privateKey)
      .then((campaigns) => { if (!cancelled) setResult({ identity, privateKey, campaigns, error: '' }); })
      .catch((error) => { if (!cancelled) setResult({ identity, privateKey, campaigns: [], error: error.message }); });
    return () => { cancelled = true; };
  }, [ready, identity, privateKey, publicKey]);
  const current = ready && result?.identity === identity && result.privateKey === privateKey;
  return { campaigns: current ? result.campaigns : [], error: current ? result.error : '',
    loading: ready && !current, locked: !privateKey, unlock };
}
