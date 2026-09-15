import styled from 'styled-components';

import Button from '~/components/ButtonAlt';
import { ChevronRightIcon } from '~/components/Icons';
import PurchaseButtonInner from '~/components/PurchaseButtonInner';
import { UsdPrice } from '~/components/UserPrice';
import useCrewContext from '~/hooks/useCrewContext';
import { TOKEN, TOKEN_FORMAT } from '~/lib/priceUtils';
import { nativeBool, reactBool } from '~/lib/utils';

const StyledPurchaseButtonInner = styled(PurchaseButtonInner)`
  & > svg:last-child {
    font-size: 20px;
  }
`;

const SKUButton = ({ usdcPrice, onClick, isPurchasing, isSway, ...props }) => {
  const { isLaunched } = useCrewContext();
  return (
    <Button
      disabled={nativeBool(isPurchasing || !isLaunched)}
      isTransaction
      loading={reactBool(isPurchasing)}
      onClick={onClick}
      size="large"
      {...props}>
      <StyledPurchaseButtonInner>
        Purchase{usdcPrice ? (<>: {(
          <UsdPrice
            price={usdcPrice}
            priceToken={TOKEN.USDC}
            format={TOKEN_FORMAT.SHORT} />
          )}</>) : null
        }
        <ChevronRightIcon />
      </StyledPurchaseButtonInner>
    </Button>
  );
}

export default SKUButton;
