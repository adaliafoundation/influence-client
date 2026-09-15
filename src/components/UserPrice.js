import { useMemo } from 'react';

import { asteroidPrice, TOKEN } from '~/lib/priceUtils';
import usePriceConstants from '~/hooks/usePriceConstants';
import usePriceHelper from '~/hooks/usePriceHelper';
import { safeBigInt } from '~/lib/utils';

const UserPrice = ({ price, priceToken, format, outputToken }) => {
  const priceHelper = usePriceHelper();
  const displayToken = outputToken || TOKEN.USDC;

  if (!priceToken || priceToken === 'undefined') return <>-</>;
  return (
    <>
      {
        priceHelper
          .from(
            !price ? 0n : (typeof price === 'bigint' ? price : safeBigInt(price)),
            priceToken
          )
          .to(displayToken, format || true)
      }
    </>
  );
};

export const UsdPrice = (props) => (
  <UserPrice {...props} outputToken={TOKEN.USDC} />
);

export const AsteroidUserPrice = ({ lots = 0n, format = true }) => {
  const { data: priceConstants } = usePriceConstants();

  const price = useMemo(() => {
    return asteroidPrice(lots, priceConstants);
  }, [lots, priceConstants]);

  return (
    <UsdPrice
      price={price}
      priceToken={priceConstants.ASTEROID_PURCHASE_TOKEN}
      format={format}
    />
  );
}

export const CrewmateUserPrice = ({ format = true }) => {
  const { data: priceConstants } = usePriceConstants();
  return (
    <UsdPrice
      price={priceConstants.ADALIAN_PURCHASE_PRICE}
      priceToken={priceConstants.ADALIAN_PURCHASE_TOKEN}
      format={format}
    />
  );
};

export default UserPrice;
