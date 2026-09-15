import { useEffect } from 'react';
import { useHistory, useLocation } from 'react-router-dom';

import { appConfig } from '~/appConfig';
import useFundingIntentMonitor from '~/hooks/useFundingIntentMonitor';
import useSession from '~/hooks/useSession';
import useStore from '~/hooks/useStore';
import { parseBanxaReturnUrl } from '~/lib/funding';

const BANXA_RETURN_PARAMS = [
  'fulfillmentStatus',
  'identityStatus',
  'orderId',
  'orderRef',
  'orderStatus',
  'paymentStatus'
];

const ActiveFundingIntentMonitor = ({ intent }) => {
  const history = useHistory();
  const location = useLocation();
  const dispatchFundingIntentUpdated = useStore(s => s.dispatchFundingIntentUpdated);

  useFundingIntentMonitor(intent);

  useEffect(() => {
    const returnData = parseBanxaReturnUrl({
      baseUrl: appConfig.get('Api.banxa'),
      href: window.location.href
    });
    if (!returnData) return;

    dispatchFundingIntentUpdated(intent.id, returnData);

    const searchParams = new URLSearchParams(location.search);
    BANXA_RETURN_PARAMS.forEach((param) => searchParams.delete(param));
    history.replace({
      pathname: location.pathname,
      search: searchParams.toString()
    });
  }, [dispatchFundingIntentUpdated, history, intent.id, location.pathname, location.search]);

  return null;
};

const FundingIntentMonitor = () => {
  const { accountAddress } = useSession();
  const activeFundingIntent = useStore(s => {
    const intent = s.activeFundingIntentId ? s.fundingIntents?.[s.activeFundingIntentId] : null;
    return intent?.accountAddress === accountAddress ? intent : null;
  });

  if (!activeFundingIntent) return null;
  return <ActiveFundingIntentMonitor intent={activeFundingIntent} />;
};

export default FundingIntentMonitor;
