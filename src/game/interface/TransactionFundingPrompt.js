import { useContext } from 'react';
import ChainTransactionContext from '~/contexts/ChainTransactionContext';
import usePriceHelper from '~/hooks/usePriceHelper';
import FundingFlow from '../launcher/store/FundingFlow';

const ActiveFundingPrompt = ({ requirement, onClose }) => {
  const priceHelper = usePriceHelper();
  return <FundingFlow
    totalPrice={priceHelper.from(requirement.total, requirement.token)}
    onClose={onClose}
    onFunded={onClose} />;
};

// Keep funding UI out of the transaction provider: its buttons consume that provider.
const TransactionFundingPrompt = () => {
  const { fundingRequirement, dismissFunding } = useContext(ChainTransactionContext);
  return fundingRequirement ? <ActiveFundingPrompt requirement={fundingRequirement} onClose={dismissFunding} /> : null;
};

export default TransactionFundingPrompt;
